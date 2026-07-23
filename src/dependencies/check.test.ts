import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("checkClaudeOnPath (mock de @tauri-apps/api/core)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invoca check_claude_on_path e devolve claudePath quando presente", async () => {
    const { checkClaudeOnPath } = await import("./check");
    invokeMock.mockResolvedValueOnce({ claudePath: "/usr/local/bin/claude" });

    const result = await checkClaudeOnPath();

    expect(invokeMock).toHaveBeenCalledWith("check_claude_on_path");
    expect(result.claudePath).toBe("/usr/local/bin/claude");
  });

  it("devolve claudePath null quando ausente", async () => {
    const { checkClaudeOnPath } = await import("./check");
    invokeMock.mockResolvedValueOnce({ claudePath: null });

    const result = await checkClaudeOnPath();

    expect(result.claudePath).toBeNull();
  });
});

describe("deriveToolMissingState (função pura, sem mock)", () => {
  it("devolve none quando claude e gsd-core estão presentes", async () => {
    const { deriveToolMissingState } = await import("./check");
    expect(deriveToolMissingState("/usr/bin/claude", true)).toBe("none");
  });

  it("devolve claude-missing quando só claude está ausente", async () => {
    const { deriveToolMissingState } = await import("./check");
    expect(deriveToolMissingState(null, true)).toBe("claude-missing");
  });

  it("devolve gsd-core-missing quando só gsd-core está ausente", async () => {
    const { deriveToolMissingState } = await import("./check");
    expect(deriveToolMissingState("/usr/bin/claude", false)).toBe(
      "gsd-core-missing",
    );
  });

  it("devolve both-missing quando ambos estão ausentes", async () => {
    const { deriveToolMissingState } = await import("./check");
    expect(deriveToolMissingState(null, false)).toBe("both-missing");
  });
});
