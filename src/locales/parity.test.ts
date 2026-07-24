// Guarda de paridade de chaves entre pt-BR e en (DIST-01, 05-01-PLAN.md,
// CONTEXT.md "Completude") — trava as 10 namespaces (a 10ª, `update`,
// adicionada em 05-03-PLAN.md, DIST-03) contra regressão futura: falha se um
// par de PR adicionar uma chave a um idioma e esquecer o outro.
// Compara ESTRUTURA de chaves (dotted paths), NUNCA valores — pt-BR e en têm
// o MESMO propósito ter conteúdo diferente (05-RESEARCH.md Pitfall 5).

import { describe, expect, it } from "vitest";

import { resources } from "../i18n";

/** Coleta recursivamente os dotted key paths de um objeto de tradução
 * aninhado — ex.: `{ stale: { body: "..." } }` -> `["stale.body"]`. Nunca
 * compara valores: pt-BR e en têm conteúdo DIFERENTE por design. */
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([key, value]) =>
    collectKeyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n namespace parity (pt-BR ⇄ en)", () => {
  const namespaces = Object.keys(resources["pt-BR"]) as Array<
    keyof (typeof resources)["pt-BR"]
  >;

  it("todas as 10 namespaces declaradas em i18n.ts estão presentes nos dois idiomas", () => {
    expect(namespaces).toHaveLength(10);
    expect(Object.keys(resources.en)).toEqual(namespaces);
  });

  it.each(namespaces)("namespace %s tem o mesmo conjunto de chaves nos dois idiomas", (ns) => {
    const ptKeys = new Set(collectKeyPaths(resources["pt-BR"][ns]));
    const enKeys = new Set(collectKeyPaths(resources.en[ns]));

    const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
    const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));

    expect({ missingInEn, missingInPt }).toEqual({ missingInEn: [], missingInPt: [] });
  });
});
