export function stateForProgress(previousState: unknown, reportedState?: unknown): "running" | "paused" {
  if (reportedState === "paused" || reportedState === "running") return reportedState;
  return previousState === "paused" ? "paused" : "running";
}
