// Parser de `{phase}-{plan}-PLAN.md` — frontmatter + extração tolerante das
// tarefas do corpo em XML solto dentro do markdown.
//
// Regra de projeto (T-01-06d, nota de granularidade do Pattern 2 da
// pesquisa): o PLAN.md não tem checkbox por tarefa — este parser só extrai
// nome e tipo de cada tarefa na ordem do arquivo. Nenhum estado de conclusão
// é atribuído aqui; isso é responsabilidade exclusiva de `artifact-tree.ts`,
// ancorada na presença do SUMMARY.md correspondente.
//
// O corpo do `<tasks>` é markdown livre com marcação de tag — não é XML
// bem-formado (pode conter `<`/`>` soltos no texto das tarefas). Por isso a
// extração delimita a região de tarefas e varre blocos `<task ...>...</task>`
// com regex tolerante, em vez de rodar um parser XML estrito sobre o arquivo
// inteiro (ver `01-RESEARCH.md` → Task 1 `<action>`).

import matter from "gray-matter";

import { ok, unrecognized, type ParseIssue, type ParseResult } from "../parse-result";

export interface PlanTask {
  name: string;
  type: string;
}

export interface PlanFrontmatter {
  phase: string;
  plan: string;
  type: string;
  wave: number | null;
  dependsOn: string[];
  filesModified: string[];
  autonomous: boolean;
  requirements: string[];
  mustHaves: unknown;
}

export interface PlanModel {
  frontmatter: PlanFrontmatter;
  tasks: PlanTask[];
}

type FrontmatterData = Record<string, unknown>;

function toStringField(data: FrontmatterData, field: string): string {
  const value = data[field];
  if (typeof value === "string") return value;
  // YAML sem aspas interpreta valores como `plan: 01` como número (às vezes
  // octal-like) — normaliza de volta para string em vez de descartar o
  // campo, igual ao padrão já usado em `parser/state.ts`.
  if (typeof value === "number") return String(value);
  return "";
}

function toStringArray(data: FrontmatterData, field: string): string[] {
  const value = data[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toNumberOrNull(data: FrontmatterData, field: string): number | null {
  const value = data[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoolean(data: FrontmatterData, field: string): boolean {
  return data[field] === true;
}

const TASKS_REGION_PATTERN = /<tasks>([\s\S]*?)<\/tasks>/;
const TASK_BLOCK_PATTERN = /<task\s+type="([^"]*)"[^>]*>([\s\S]*?)<\/task>/g;
const TASK_NAME_PATTERN = /<name>([\s\S]*?)<\/name>/;

/**
 * Extrai as tarefas da região `<tasks>...</tasks>`. A região pode estar
 * ausente (marcação de fechamento removida/corrompida) ou presente mas sem
 * nenhum bloco `<task>` reconhecível — ambos os casos devolvem `null`, e
 * quem chama decide o `unrecognized` com o motivo apropriado (regra de
 * fallback do Task 1: nunca apresentar "plano sem tarefas" como lista vazia
 * legítima).
 */
function extractTasks(bodyMarkdown: string): PlanTask[] | null {
  const regionMatch = TASKS_REGION_PATTERN.exec(bodyMarkdown);
  if (!regionMatch) return null;

  const region = regionMatch[1];
  const tasks: PlanTask[] = [];

  TASK_BLOCK_PATTERN.lastIndex = 0;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = TASK_BLOCK_PATTERN.exec(region)) !== null) {
    const [, taskType, taskBody] = blockMatch;
    const nameMatch = TASK_NAME_PATTERN.exec(taskBody);
    const name = nameMatch ? nameMatch[1].trim() : "";
    tasks.push({ name, type: taskType.trim() });
  }

  return tasks.length > 0 ? tasks : null;
}

export function parsePlanFile(rawText: string, sourcePath: string): ParseResult<PlanModel> {
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

  let tasks: PlanTask[] | null;
  try {
    tasks = extractTasks(parsed.content);
  } catch (error) {
    const issue: ParseIssue = {
      path: sourcePath,
      reason: `Falha ao extrair tarefas do corpo do plano: ${error instanceof Error ? error.message : String(error)}`,
    };
    return unrecognized([issue], rawText);
  }

  if (tasks === null) {
    const issue: ParseIssue = {
      path: sourcePath,
      field: "tasks",
      reason: "não foi possível localizar as tarefas do plano",
    };
    return unrecognized([issue], rawText);
  }

  return ok({
    frontmatter: {
      phase: toStringField(data, "phase"),
      plan: toStringField(data, "plan"),
      type: toStringField(data, "type"),
      wave: toNumberOrNull(data, "wave"),
      dependsOn: toStringArray(data, "depends_on"),
      filesModified: toStringArray(data, "files_modified"),
      autonomous: toBoolean(data, "autonomous"),
      requirements: toStringArray(data, "requirements"),
      mustHaves: data.must_haves,
    },
    tasks,
  });
}
