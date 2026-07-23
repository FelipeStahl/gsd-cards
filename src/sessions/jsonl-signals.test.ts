import { describe, expect, it } from "vitest";

import { extractSessionId, sortByLastModifiedDesc } from "./jsonl-signals";
import type { SessionSignal } from "./discover";

describe("extractSessionId", () => {
  it("remove a extensão .jsonl do nome do arquivo", () => {
    expect(extractSessionId("01998f3a-uuid.jsonl")).toBe("01998f3a-uuid");
  });

  it("devolve o nome inalterado quando não termina em .jsonl", () => {
    expect(extractSessionId("subagents")).toBe("subagents");
  });
});

describe("sortByLastModifiedDesc", () => {
  it("ordena da sessão mais recente para a mais antiga", () => {
    const sessions: SessionSignal[] = [
      { id: "antiga", lastModified: new Date("2026-01-01T00:00:00Z") },
      { id: "recente", lastModified: new Date("2026-03-01T00:00:00Z") },
      { id: "media", lastModified: new Date("2026-02-01T00:00:00Z") },
    ];

    const sorted = sortByLastModifiedDesc(sessions);

    expect(sorted.map((s) => s.id)).toEqual(["recente", "media", "antiga"]);
  });

  it("empurra sessões sem mtime (null) para o final", () => {
    const sessions: SessionSignal[] = [
      { id: "sem-mtime", lastModified: null },
      { id: "com-mtime", lastModified: new Date("2026-01-01T00:00:00Z") },
    ];

    const sorted = sortByLastModifiedDesc(sessions);

    expect(sorted.map((s) => s.id)).toEqual(["com-mtime", "sem-mtime"]);
  });

  it("não muta o array original", () => {
    const sessions: SessionSignal[] = [
      { id: "a", lastModified: new Date("2026-01-01T00:00:00Z") },
      { id: "b", lastModified: new Date("2026-02-01T00:00:00Z") },
    ];
    const original = [...sessions];

    sortByLastModifiedDesc(sessions);

    expect(sessions).toEqual(original);
  });
});
