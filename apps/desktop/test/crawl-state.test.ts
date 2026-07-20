import { describe, expect, it } from "vitest";
import { stateForProgress } from "../src/crawl-state.js";

describe("Live Crawl progress state", () => {
  it("does not let an in-flight progress event overwrite paused state", () => {
    expect(stateForProgress("paused")).toBe("paused");
    expect(stateForProgress("running", "paused")).toBe("paused");
    expect(stateForProgress("paused", "running")).toBe("running");
    expect(stateForProgress("running")).toBe("running");
  });
});
