// Parser de `{phase}-{plan}-SUMMARY.md` — frontmatter + `## Task Commits`.
//
// A presença do arquivo já é o sinal de conclusão do plano (ver
// `artifact-tree.ts`, granularidade tudo-ou-nada por plano); os campos
// abaixo e a lista de commits são detalhe de exibição, não a fonte da
// verdade de "plano concluído".

import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Content, Heading, List, ListItem, Root } from "mdast";

import { ok, unrecognized, type ParseIssue, type ParseResult } from "../parse-result";

export interface TaskCommit {
  description: string;
  hash: string | null;
}

export interface SummaryFrontmatter {
  phase: string;
  plan: string;
  subsystem: string | null;
  tags: string[];
  requirementsCompleted: string[];
  duration: string | null;
  completed: string | null;
  status: string | null;
}

export interface SummaryModel {
  frontmatter: SummaryFrontmatter;
  taskCommits: TaskCommit[];
}

type FrontmatterData = Record<string, unknown>;

function toStringField(data: FrontmatterData, field: string): string {
  const value = data[field];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function toStringOrNull(data: FrontmatterData, field: string): string | null {
  const value = data[field];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  // YAML sem aspas interpreta datas tipo `completed: 2026-07-22` como
  // `Date`, não string — normaliza de volta para ISO em vez de descartar.
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toStringArray(data: FrontmatterData, field: string): string[] {
  const value = data[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
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

/** Primeiro `inlineCode` (hash de commit) e primeiro texto em negrito (descrição) dentro de um item de lista. */
function extractTaskCommit(item: ListItem): TaskCommit {
  let description = "";
  let hash: string | null = null;

  function walk(node: Content): void {
    if (node.type === "strong" && description === "") {
      description = mdastToText(node).trim();
    }
    if (node.type === "inlineCode" && hash === null) {
      hash = node.value.trim();
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children as Content[]) walk(child);
    }
  }

  for (const child of item.children as Content[]) walk(child);

  if (description === "") {
    // Sem texto em negrito reconhecível — usa o texto puro do item inteiro
    // como descrição de fallback, em vez de descartar o commit da lista.
    description = mdastToText(item as unknown as Content).trim();
  }

  return { description, hash };
}

/** Extrai a lista numerada logo após o heading `## Task Commits`, percorrendo a AST (nunca regex sobre texto cru). */
function extractTaskCommits(bodyMarkdown: string): TaskCommit[] {
  const tree = unified().use(remarkParse).parse(bodyMarkdown) as Root;
  const children = tree.children;

  const headingIndex = children.findIndex((node) => isHeading(node, "Task Commits"));
  if (headingIndex === -1) return [];

  const headingDepth = (children[headingIndex] as Heading).depth;

  let listNode: List | undefined;
  for (let i = headingIndex + 1; i < children.length; i += 1) {
    const node = children[i];
    if (node.type === "heading" && (node as Heading).depth <= headingDepth) break;
    if (node.type === "list") {
      listNode = node as List;
      break;
    }
  }

  if (!listNode) return [];

  return listNode.children.map((item) => extractTaskCommit(item));
}

export function parseSummaryFile(rawText: string, sourcePath: string): ParseResult<SummaryModel> {
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

  let taskCommits: TaskCommit[];
  try {
    taskCommits = extractTaskCommits(parsed.content);
  } catch (error) {
    const issue: ParseIssue = {
      path: sourcePath,
      reason: `Falha ao extrair "## Task Commits": ${error instanceof Error ? error.message : String(error)}`,
    };
    return unrecognized([issue], rawText);
  }

  return ok({
    frontmatter: {
      phase: toStringField(data, "phase"),
      plan: toStringField(data, "plan"),
      subsystem: toStringOrNull(data, "subsystem"),
      tags: toStringArray(data, "tags"),
      requirementsCompleted: toStringArray(data, "requirements-completed"),
      duration: toStringOrNull(data, "duration"),
      completed: toStringOrNull(data, "completed"),
      status: toStringOrNull(data, "status"),
    },
    taskCommits,
  });
}
