import { describe, expect, it } from "vitest";

import {
  ACTIVE_WINDOW_MS,
  deriveDiskStatus,
  toBoardBadge,
  toBoardColumn,
  type PhaseDirSignals,
} from "./status";

function signals(overrides: Partial<PhaseDirSignals> = {}): PhaseDirSignals {
  return {
    planCount: 0,
    summaryCount: 0,
    hasResearch: false,
    hasContext: false,
    isActive: false,
    verificationStatus: "not_required",
    ...overrides,
  };
}

describe("deriveDiskStatus — os 8 valores de DiskStatus", () => {
  it("diretório inexistente -> no_directory", () => {
    expect(deriveDiskStatus(false, signals())).toBe("no_directory");
  });

  it("diretório existe, nenhum sinal -> empty", () => {
    expect(deriveDiskStatus(true, signals())).toBe("empty");
  });

  it("hasContext true, resto vazio -> discussed", () => {
    expect(deriveDiskStatus(true, signals({ hasContext: true }))).toBe(
      "discussed",
    );
  });

  it("hasResearch true (sem context) -> researched", () => {
    expect(deriveDiskStatus(true, signals({ hasResearch: true }))).toBe(
      "researched",
    );
  });

  it("hasResearch tem precedência sobre hasContext quando ambos verdadeiros", () => {
    expect(
      deriveDiskStatus(
        true,
        signals({ hasResearch: true, hasContext: true }),
      ),
    ).toBe("researched");
  });

  it("planCount > 0, summaryCount 0 -> planned", () => {
    expect(deriveDiskStatus(true, signals({ planCount: 2 }))).toBe("planned");
  });

  it("summaryCount > 0 mas menor que planCount -> partial", () => {
    expect(
      deriveDiskStatus(true, signals({ planCount: 3, summaryCount: 1 })),
    ).toBe("partial");
  });

  it("implementationComplete (summaryCount >= planCount) sem verificação passed -> executed", () => {
    expect(
      deriveDiskStatus(
        true,
        signals({
          planCount: 3,
          summaryCount: 3,
          verificationStatus: "missing",
        }),
      ),
    ).toBe("executed");
  });

  it("implementationComplete + verificationStatus passed -> complete", () => {
    expect(
      deriveDiskStatus(
        true,
        signals({
          planCount: 3,
          summaryCount: 3,
          verificationStatus: "passed",
        }),
      ),
    ).toBe("complete");
  });
});

describe("deriveDiskStatus — casos-limite exigidos pelo plano", () => {
  it("planCount 3, summaryCount 3, verificationStatus gaps_found -> executed (nunca complete)", () => {
    const result = deriveDiskStatus(
      true,
      signals({ planCount: 3, summaryCount: 3, verificationStatus: "gaps_found" }),
    );
    expect(result).toBe("executed");
    expect(result).not.toBe("complete");
  });

  it("planCount 3, summaryCount 3, verificationStatus missing -> executed", () => {
    expect(
      deriveDiskStatus(
        true,
        signals({ planCount: 3, summaryCount: 3, verificationStatus: "missing" }),
      ),
    ).toBe("executed");
  });

  it("summaryCount maior que planCount (5 > 3) ainda resulta em executed — comparação é >=, não igualdade", () => {
    expect(
      deriveDiskStatus(
        true,
        signals({ planCount: 3, summaryCount: 5, verificationStatus: "missing" }),
      ),
    ).toBe("executed");
  });

  it("planCount 0, summaryCount 0, hasResearch e hasContext true -> researched (research tem precedência)", () => {
    expect(
      deriveDiskStatus(
        true,
        signals({ hasResearch: true, hasContext: true }),
      ),
    ).toBe("researched");
  });
});

describe("toBoardBadge — os 7 badges", () => {
  it("no_directory -> pending", () => {
    expect(toBoardBadge("no_directory", false)).toBe("pending");
  });

  it("empty -> pending", () => {
    expect(toBoardBadge("empty", false)).toBe("pending");
  });

  it("discussed -> discussed", () => {
    expect(toBoardBadge("discussed", false)).toBe("discussed");
  });

  it("researched -> discussed (colapsado, decisão travada deste plano)", () => {
    expect(toBoardBadge("researched", false)).toBe("discussed");
  });

  it("planned, isActive false -> planned", () => {
    expect(toBoardBadge("planned", false)).toBe("planned");
  });

  it("planned, isActive true -> executing", () => {
    expect(toBoardBadge("planned", true)).toBe("executing");
  });

  it("partial -> executing", () => {
    expect(toBoardBadge("partial", false)).toBe("executing");
  });

  it("executed -> executed", () => {
    expect(toBoardBadge("executed", false)).toBe("executed");
  });

  it("complete -> verified", () => {
    expect(toBoardBadge("complete", false)).toBe("verified");
  });
});

describe("toBoardBadge — casos-limite exigidos pelo plano", () => {
  it("planCount 2, summaryCount 0, isActive true -> badge executing", () => {
    const status = deriveDiskStatus(true, signals({ planCount: 2, isActive: true }));
    expect(toBoardBadge(status, true)).toBe("executing");
  });

  it("planCount 2, summaryCount 0, isActive false -> badge planned", () => {
    const status = deriveDiskStatus(true, signals({ planCount: 2, isActive: false }));
    expect(toBoardBadge(status, false)).toBe("planned");
  });
});

describe("toBoardColumn — as 4 colunas", () => {
  it("pending -> todo", () => {
    expect(toBoardColumn("pending")).toBe("todo");
  });

  it("discussed -> preparing", () => {
    expect(toBoardColumn("discussed")).toBe("preparing");
  });

  it("planned -> preparing", () => {
    expect(toBoardColumn("planned")).toBe("preparing");
  });

  it("executing -> executing", () => {
    expect(toBoardColumn("executing")).toBe("executing");
  });

  it("executed -> executing (nunca done)", () => {
    expect(toBoardColumn("executed")).toBe("executing");
  });

  it("verified -> done", () => {
    expect(toBoardColumn("verified")).toBe("done");
  });

  it("unknown sem coluna anterior conhecida -> todo", () => {
    expect(toBoardColumn("unknown")).toBe("todo");
  });

  it("unknown com coluna anterior conhecida -> mantém a coluna anterior", () => {
    expect(toBoardColumn("unknown", "executing")).toBe("executing");
  });
});

describe("toBoardColumn — caso-limite central de D-05", () => {
  it("planCount 3, summaryCount 3, verificationStatus gaps_found -> coluna executing, nunca done", () => {
    const status = deriveDiskStatus(
      true,
      signals({ planCount: 3, summaryCount: 3, verificationStatus: "gaps_found" }),
    );
    const badge = toBoardBadge(status, false);
    const column = toBoardColumn(badge);
    expect(column).toBe("executing");
    expect(column).not.toBe("done");
  });
});

describe("ACTIVE_WINDOW_MS", () => {
  it("é uma constante nomeada de 5 minutos", () => {
    expect(ACTIVE_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});
