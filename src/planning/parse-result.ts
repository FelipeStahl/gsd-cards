// Contrato de resultado de parsing usado por TODO parser de `.planning/`
// (base do BOARD-05/D-15). Regra de projeto obrigatória: nunca inferir um
// valor default plausível quando a extração falha — o resultado vira
// `unrecognized`, porque um valor plausível e errado é exatamente o modo de
// falha que degrada a confiança que é o core value do produto (T-01-06a).

export interface ParseIssue {
  path: string;
  field?: string;
  reason: string;
}

export type ParseResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "unrecognized"; issues: ParseIssue[]; raw?: string };

export function ok<T>(value: T): ParseResult<T> {
  return { kind: "ok", value };
}

export function unrecognized<T>(
  issues: ParseIssue[],
  raw?: string,
): ParseResult<T> {
  return { kind: "unrecognized", issues, raw };
}

export function isUnrecognized<T>(
  result: ParseResult<T>,
): result is Extract<ParseResult<T>, { kind: "unrecognized" }> {
  return result.kind === "unrecognized";
}
