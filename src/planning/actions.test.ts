import { describe, expect, it } from "vitest";

import { derivePhaseAction, sanitizePhaseId } from "./actions";
import type { DiskStatus } from "./status";

describe("derivePhaseAction — os 8 valores de DiskStatus (D-ACT01)", () => {
  it("no_directory -> Discutir", () => {
    const action = derivePhaseAction("no_directory");
    expect(action?.labelKey).toBe("board.actions.discuss");
    expect(action?.command("03")).toBe("/gsd-discuss-phase 03");
    expect(action?.icon).toBe("MessageSquare");
  });

  it("empty -> Discutir", () => {
    const action = derivePhaseAction("empty");
    expect(action?.labelKey).toBe("board.actions.discuss");
    expect(action?.command("03")).toBe("/gsd-discuss-phase 03");
    expect(action?.icon).toBe("MessageSquare");
  });

  it("discussed -> Planejar", () => {
    const action = derivePhaseAction("discussed");
    expect(action?.labelKey).toBe("board.actions.plan");
    expect(action?.command("03")).toBe("/gsd-plan-phase 03");
    expect(action?.icon).toBe("ClipboardList");
  });

  it("researched -> Planejar", () => {
    const action = derivePhaseAction("researched");
    expect(action?.labelKey).toBe("board.actions.plan");
    expect(action?.command("03")).toBe("/gsd-plan-phase 03");
    expect(action?.icon).toBe("ClipboardList");
  });

  it("planned -> Executar", () => {
    const action = derivePhaseAction("planned");
    expect(action?.labelKey).toBe("board.actions.execute");
    expect(action?.command("03")).toBe("/gsd-execute-phase 03");
    expect(action?.icon).toBe("Play");
  });

  it("partial -> Continuar", () => {
    const action = derivePhaseAction("partial");
    expect(action?.labelKey).toBe("board.actions.continue");
    expect(action?.command("03")).toBe("/gsd-execute-phase 03");
    expect(action?.icon).toBe("FastForward");
  });

  it("executed -> Verificar", () => {
    const action = derivePhaseAction("executed");
    expect(action?.labelKey).toBe("board.actions.verify");
    expect(action?.command("03")).toBe("/gsd-verify-work 03");
    expect(action?.icon).toBe("CheckCircle2");
  });

  it("complete -> null (sem ação primária, estado terminal)", () => {
    expect(derivePhaseAction("complete")).toBeNull();
  });

  it("tabela cobre exatamente os 8 valores conhecidos de DiskStatus", () => {
    const allStatuses: DiskStatus[] = [
      "no_directory",
      "empty",
      "discussed",
      "researched",
      "planned",
      "partial",
      "executed",
      "complete",
    ];
    for (const status of allStatuses) {
      // Não deve lançar para nenhum valor válido — a cobertura exaustiva do
      // switch (default: never) já é garantida em tempo de compilação.
      expect(() => derivePhaseAction(status)).not.toThrow();
    }
  });
});

describe("sanitizePhaseId — allow/deny (T-03-01)", () => {
  it.each(["3", "9", "03", "12", "02.1", "9.1"])("aceita id válido %s", (id) => {
    expect(sanitizePhaseId(id)).toBe(id);
  });

  // WR-02: um único dígito (`3`, `9`) é aceito — a mitigação de T-03-01 é
  // sobre caracteres de injeção, nunca sobre exigir um mínimo de dígitos.
  // `phase-scan.ts`'s próprio padrão de nome de diretório (`^(\d+(?:\.\d)?)-`)
  // já aceita fases de um único dígito; outros repositórios GSD (não só o
  // padrão `01-`/`02-` deste projeto) podem legitimamente usar `9-algo`.
  it.each(["3; rm -rf ~", "03\rmalicious", "../etc", "03 && x", ""])(
    "rejeita id inválido %j",
    (id) => {
      expect(sanitizePhaseId(id)).toBeNull();
    },
  );
});
