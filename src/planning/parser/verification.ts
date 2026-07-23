// Parser de `{phase}-VERIFICATION.md` — frontmatter (com `status` restrito
// aos três valores conhecidos do gsd-core) + `### Observable Truths`.
//
// Regra de projeto (T-01-06c): `status` NUNCA cai em `passed` por default.
// Qualquer valor desconhecido, ou frontmatter ilegível, vira `unrecognized`
// — um falso "verificada" é a mentira mais cara que este produto pode
// contar (ver `01-RESEARCH.md` → Task 1 `<action>`).

import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Content, Heading, Root, Table, TableRow } from "mdast";

import { ok, unrecognized, type ParseIssue, type ParseResult } from "../parse-result";

export type VerificationStatus = "passed" | "gaps_found" | "human_needed";

const KNOWN_STATUSES = new Set<VerificationStatus>(["passed", "gaps_found", "human_needed"]);

export interface ObservableTruth {
  index: string;
  truth: string;
  marker: string;
  evidence: string;
}

export interface VerificationFrontmatter {
  phase: string;
  verified: string | null;
  status: VerificationStatus;
  score: string | null;
  behaviorUnverified: number | null;
}

export interface VerificationModel {
  frontmatter: VerificationFrontmatter;
  observableTruths: ObservableTruth[];
}

type FrontmatterData = Record<string, unknown>;

function toStringOrNull(data: FrontmatterData, field: string): string | null {
  const value = data[field];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toNumberOrNull(data: FrontmatterData, field: string): number | null {
  const value = data[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mdastToText(node: Content | Root): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => mdastToText(child as Content)).join("");
  }
  return "";
}

function isHeading(node: Content, text: string): node is Heading {
  return node.type === "heading" && mdastToText(node).trim().toLowerCase() === text.toLowerCase();
}

function rowToCells(row: TableRow): string[] {
  return row.children.map((cell) => mdastToText(cell as unknown as Content).trim());
}

/** Extrai a tabela logo após o heading `### Observable Truths` (colunas: #, Truth, Status, Evidence). */
function extractObservableTruths(bodyMarkdown: string): ObservableTruth[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(bodyMarkdown) as Root;
  const children = tree.children;

  const headingIndex = children.findIndex((node) => isHeading(node, "Observable Truths"));
  if (headingIndex === -1) return [];

  const headingDepth = (children[headingIndex] as Heading).depth;

  let tableNode: Table | undefined;
  for (let i = headingIndex + 1; i < children.length; i += 1) {
    const node = children[i];
    if (node.type === "heading" && (node as Heading).depth <= headingDepth) break;
    if (node.type === "table") {
      tableNode = node as Table;
      break;
    }
  }

  if (!tableNode || tableNode.children.length === 0) return [];

  const [, ...bodyRows] = tableNode.children;
  return bodyRows.map((row) => {
    const cells = rowToCells(row);
    return {
      index: cells[0] ?? "",
      truth: cells[1] ?? "",
      marker: cells[2] ?? "",
      evidence: cells[3] ?? "",
    };
  });
}

export function parseVerificationFile(
  rawText: string,
  sourcePath: string,
): ParseResult<VerificationModel> {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(rawText);
  } catch (error) {
    const issue: ParseIssue = {
      path: sourcePath,
      reason: `Frontmatter YAML malformado: ${error instanceof Error ? error.message : String(error)}`,
    };
    return unrecognized([issue], rawText);
  }

  const data = parsed.data as FrontmatterData;
  if (typeof data !== "object" || data === null || typeof data.phase !== "string") {
    const issue: ParseIssue = {
      path: sourcePath,
      field: "phase",
      reason: 'Frontmatter não reconhecível — campo "phase" ausente ou inválido',
    };
    return unrecognized([issue], rawText);
  }

  const rawStatus = data.status;
  if (typeof rawStatus !== "string" || !KNOWN_STATUSES.has(rawStatus as VerificationStatus)) {
    // NUNCA cair em "passed" por default — valor desconhecido/ausente
    // degrada o resultado inteiro para unrecognized (T-01-06c).
    const issue: ParseIssue = {
      path: sourcePath,
      field: "status",
      reason: `Campo "status" ausente ou com valor não reconhecido no frontmatter (recebido: ${JSON.stringify(rawStatus)})`,
    };
    return unrecognized([issue], rawText);
  }

  let observableTruths: ObservableTruth[];
  try {
    observableTruths = extractObservableTruths(parsed.content);
  } catch (error) {
    const issue: ParseIssue = {
      path: sourcePath,
      reason: `Falha ao extrair "### Observable Truths": ${error instanceof Error ? error.message : String(error)}`,
    };
    return unrecognized([issue], rawText);
  }

  return ok({
    frontmatter: {
      phase: data.phase,
      verified: toStringOrNull(data, "verified"),
      status: rawStatus as VerificationStatus,
      score: toStringOrNull(data, "score"),
      behaviorUnverified: toNumberOrNull(data, "behavior_unverified"),
    },
    observableTruths,
  });
}
