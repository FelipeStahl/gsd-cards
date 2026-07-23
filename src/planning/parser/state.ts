// Parser de `.planning/STATE.md` — frontmatter de progresso + blockers por
// fase extraídos de `## Accumulated Context` → `### Blockers/Concerns`.
//
// Regra de projeto (T-01-06a): nenhum campo aqui recebe um valor default
// inventado quando a extração falha — cada campo individual é um
// `ParseResult`, e o resultado geral só vira `unrecognized` quando o próprio
// frontmatter YAML não pôde ser interpretado (T-01-04: `gray-matter` com o
// schema YAML seguro padrão, nunca trocado por um schema/engine permissivo).

import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Content, Heading, List, ListItem, Root } from "mdast";

import {
  ok,
  unrecognized,
  type ParseIssue,
  type ParseResult,
} from "../parse-result";
import type { PhaseBlocker, ProjectProgress } from "../model";

export interface StateFileModel {
  milestone: ParseResult<string>;
  milestoneName: ParseResult<string>;
  currentPhase: ParseResult<number>;
  currentPhaseName: ParseResult<string>;
  status: ParseResult<string>;
  lastUpdated: ParseResult<string>;
  progress: ParseResult<ProjectProgress>;
  blockers: PhaseBlocker[];
  issues: ParseIssue[];
}

type FrontmatterData = Record<string, unknown>;

function extractString(
  data: FrontmatterData,
  field: string,
  sourcePath: string,
  issues: ParseIssue[],
): ParseResult<string> {
  const value = data[field];
  if (typeof value === "string" && value.length > 0) {
    return ok(value);
  }
  if (typeof value === "number") {
    // Alguns campos (ex.: current_phase_name numérico improvável, mas
    // defensivo) podem vir como número no YAML — normaliza para string.
    return ok(String(value));
  }
  const issue: ParseIssue = {
    path: sourcePath,
    field,
    reason:
      value === undefined
        ? `Campo "${field}" ausente no frontmatter`
        : `Campo "${field}" não é uma string reconhecível (recebido: ${typeof value})`,
  };
  issues.push(issue);
  return unrecognized([issue]);
}

function extractNumber(
  data: FrontmatterData,
  field: string,
  sourcePath: string,
  issues: ParseIssue[],
): ParseResult<number> {
  const value = data[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return ok(value);
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return ok(Number(value));
  }
  const issue: ParseIssue = {
    path: sourcePath,
    field,
    reason:
      value === undefined
        ? `Campo "${field}" ausente no frontmatter`
        : `Campo "${field}" não é um número reconhecível (recebido: ${typeof value})`,
  };
  issues.push(issue);
  return unrecognized([issue]);
}

function extractProgress(
  data: FrontmatterData,
  sourcePath: string,
  issues: ParseIssue[],
): ParseResult<ProjectProgress> {
  const progressRaw = data.progress;
  if (typeof progressRaw !== "object" || progressRaw === null) {
    const issue: ParseIssue = {
      path: sourcePath,
      field: "progress",
      reason: "Campo \"progress\" ausente ou não é um objeto no frontmatter",
    };
    issues.push(issue);
    return unrecognized([issue]);
  }

  const progressData = progressRaw as FrontmatterData;
  const requiredFields = [
    "total_phases",
    "completed_phases",
    "total_plans",
    "completed_plans",
    "percent",
  ] as const;

  const localIssues: ParseIssue[] = [];
  for (const field of requiredFields) {
    const value = progressData[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      localIssues.push({
        path: sourcePath,
        field: `progress.${field}`,
        reason: `Campo "progress.${field}" ausente ou não numérico`,
      });
    }
  }

  if (localIssues.length > 0) {
    issues.push(...localIssues);
    return unrecognized(localIssues);
  }

  // Leitura direta, sem recálculo — o gsd-core já mantém este valor.
  return ok({
    totalPhases: progressData.total_phases as number,
    completedPhases: progressData.completed_phases as number,
    totalPlans: progressData.total_plans as number,
    completedPlans: progressData.completed_plans as number,
    percent: progressData.percent as number,
  });
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
  return (
    node.type === "heading" &&
    mdastToText(node).trim().toLowerCase() === text.toLowerCase()
  );
}

const BLOCKER_LABEL_PATTERN = /^\[Phase\s+([0-9./]+)\]:\s*([\s\S]*)$/i;

function parseBlockerItem(itemText: string): PhaseBlocker {
  const match = BLOCKER_LABEL_PATTERN.exec(itemText.trim());
  if (!match) {
    // Rótulo não reconhecido — vira blocker sem fase associada, nunca
    // descartado em silêncio.
    return { phases: [], text: itemText.trim() };
  }
  const [, phaseSpec, text] = match;
  const phases = phaseSpec
    .split("/")
    .map((part) => Number.parseFloat(part))
    .filter((n) => Number.isFinite(n));
  return { phases, text: text.trim() };
}

/**
 * Extrai os itens de `## Accumulated Context` → `### Blockers/Concerns`
 * percorrendo a AST do corpo (remark-parse) em vez de casar headings por
 * regex sobre o texto cru — resiliente a variações de espaçamento/nível de
 * heading conforme o formato do gsd-core evolui na branch `next`.
 */
function extractBlockers(bodyMarkdown: string): PhaseBlocker[] {
  const tree = unified().use(remarkParse).parse(bodyMarkdown) as Root;
  const children = tree.children;

  const blockersHeadingIndex = children.findIndex((node) =>
    isHeading(node, "Blockers/Concerns"),
  );
  if (blockersHeadingIndex === -1) {
    return [];
  }

  const headingDepth = (children[blockersHeadingIndex] as Heading).depth;

  let listNode: List | undefined;
  for (let i = blockersHeadingIndex + 1; i < children.length; i += 1) {
    const node = children[i];
    if (node.type === "heading" && (node as Heading).depth <= headingDepth) {
      break;
    }
    if (node.type === "list") {
      listNode = node as List;
      break;
    }
  }

  if (!listNode) {
    return [];
  }

  return listNode.children.map((item: ListItem) =>
    parseBlockerItem(mdastToText(item)),
  );
}

export function parseStateFile(
  rawText: string,
  sourcePath: string,
): ParseResult<StateFileModel> {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(rawText);
  } catch (error) {
    return unrecognized(
      [
        {
          path: sourcePath,
          reason: `Frontmatter YAML malformado: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      rawText,
    );
  }

  const data = parsed.data as FrontmatterData;
  const issues: ParseIssue[] = [];

  const milestone = extractString(data, "milestone", sourcePath, issues);
  const milestoneName = extractString(
    data,
    "milestone_name",
    sourcePath,
    issues,
  );
  const currentPhase = extractNumber(
    data,
    "current_phase",
    sourcePath,
    issues,
  );
  const currentPhaseName = extractString(
    data,
    "current_phase_name",
    sourcePath,
    issues,
  );
  const status = extractString(data, "status", sourcePath, issues);
  const lastUpdated = extractString(
    data,
    "last_updated",
    sourcePath,
    issues,
  );
  const progress = extractProgress(data, sourcePath, issues);
  const blockers = extractBlockers(parsed.content);

  return ok({
    milestone,
    milestoneName,
    currentPhase,
    currentPhaseName,
    status,
    lastUpdated,
    progress,
    blockers,
    issues,
  });
}
