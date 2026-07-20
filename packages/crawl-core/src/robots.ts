import type { RobotsDecision } from "@seo-auditor/shared-types";

interface Rule {
  allow: boolean;
  value: string;
  regex: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

function compileRule(value: string): RegExp {
  const anchored = value.endsWith("$");
  const body = anchored ? value.slice(0, -1) : value;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

export class RobotsRules {
  private readonly groups: Group[];

  constructor(content: string) {
    this.groups = [];
    let current: Group | undefined;
    let hasRules = false;
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const separator = line.indexOf(":");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (key === "user-agent") {
        if (!current || hasRules) {
          current = { agents: [], rules: [] };
          this.groups.push(current);
          hasRules = false;
        }
        current.agents.push(value.toLowerCase());
      } else if ((key === "allow" || key === "disallow") && current) {
        hasRules = true;
        if (!value && key === "disallow") continue;
        current.rules.push({ allow: key === "allow", value, regex: compileRule(value) });
      }
    }
  }

  evaluate(url: URL, userAgent: string): RobotsDecision {
    const productToken = userAgent.toLowerCase().split(/[\s/]/, 1)[0] ?? userAgent.toLowerCase();
    const matching = this.groups.filter((group) =>
      group.agents.some((agent) => agent === "*" || productToken.includes(agent))
    );
    const specific = matching.filter((group) => group.agents.some((agent) => agent !== "*"));
    const groups = specific.length > 0 ? specific : matching;
    const path = `${url.pathname}${url.search}`;
    const rules = groups.flatMap((group) => group.rules).filter((rule) => rule.regex.test(path));
    rules.sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
    const winner = rules[0];
    return winner
      ? { allowed: winner.allow, matchedRule: `${winner.allow ? "Allow" : "Disallow"}: ${winner.value}` }
      : { allowed: true };
  }
}

export class RobotsCache {
  private readonly cache = new Map<string, Promise<RobotsRules>>();

  constructor(
    private readonly userAgent: string,
    private readonly timeoutMs: number
  ) {}

  async rulesFor(url: URL): Promise<RobotsRules> {
    const origin = url.origin;
    let pending = this.cache.get(origin);
    if (!pending) {
      pending = this.fetch(origin);
      this.cache.set(origin, pending);
    }
    return pending;
  }

  private async fetch(origin: string): Promise<RobotsRules> {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { "user-agent": this.userAgent, accept: "text/plain,*/*;q=0.1" },
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) return new RobotsRules("");
      return new RobotsRules(await response.text());
    } catch {
      return new RobotsRules("");
    }
  }
}
