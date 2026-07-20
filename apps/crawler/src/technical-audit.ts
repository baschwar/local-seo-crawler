import { homedir } from "node:os";
import { ProjectDatabase } from "@seo-auditor/database";
import { runTechnicalSeoAudit } from "@seo-auditor/seo-rules";

export type TechnicalAuditEvent = {
  type: "technical-audit-started" | "technical-audit-completed" | "technical-audit-failed";
  payload: { projectPath: string; crawlId: string; findingCount?: number; message?: string };
};

export function redactAuditError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replaceAll(homedir(), "[home]")
    .replace(/\/(?:Users|home|private|var|tmp)\/[^\s:]+/g, "[local path]")
    .replace(/[A-Za-z]:\\[^\r\n\t]+/g, "[local path]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, "$1 [redacted]")
    .replace(/([?&](?:token|key|secret|password|authorization)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\b(token|api[_-]?key|secret|password|authorization)=\S+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

export async function runTechnicalAuditLifecycle(
  projectPath: string,
  crawlId: string,
  emit: (event: TechnicalAuditEvent) => void,
  runner: typeof runTechnicalSeoAudit = runTechnicalSeoAudit
): Promise<{ ok: true; findingCount: number } | { ok: false; message: string }> {
  emit({ type: "technical-audit-started", payload: { projectPath, crawlId } });
  let auditId: string | undefined;
  try {
    const database = new ProjectDatabase(projectPath);
    try { auditId = database.startTechnicalAudit(crawlId); }
    finally { database.close(); }
    const result = await runner(projectPath, crawlId);
    const completed = new ProjectDatabase(projectPath);
    try { completed.finishTechnicalAudit(auditId, "completed", result.findingCount); }
    finally { completed.close(); }
    emit({ type: "technical-audit-completed", payload: { projectPath, crawlId, findingCount: result.findingCount } });
    return { ok: true, findingCount: result.findingCount };
  } catch (error) {
    const message = redactAuditError(error);
    if (auditId) {
      const failed = new ProjectDatabase(projectPath);
      try { failed.finishTechnicalAudit(auditId, "failed", undefined, message); }
      finally { failed.close(); }
    }
    emit({ type: "technical-audit-failed", payload: { projectPath, crawlId, message } });
    return { ok: false, message };
  }
}
