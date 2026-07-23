// Monta a árvore de 3 níveis de uma fase — fase → planos → tarefas — a
// partir dos artefatos reais do diretório da fase (BOARD-02).
//
// Regra de granularidade (T-01-06d, Pitfall 4 da pesquisa): `TaskState` é
// tudo-ou-nada por plano, ancorado exclusivamente na PRESENÇA do
// `{phase}-{plan}-SUMMARY.md` correspondente — nunca em conteúdo de commit,
// mtime, ou qualquer outro sinal. Um plano sem SUMMARY tem todas as tarefas
// `pending`; com SUMMARY, todas `done`, de uma vez.
//
// Regra de falha localizada (D-15, BOARD-05): um artefato que falhe o parse
// (ex.: frontmatter corrompido) vira uma entrada `unrecognized` naquele
// artefato específico — nunca lança, nunca remove os demais artefatos da
// árvore.

import { parsePlanFile, type PlanModel } from "./parser/plan";
import type { ParseIssue } from "./parse-result";

export type TaskState = "pending" | "done";

export interface ArtifactTreeTask {
  name: string;
  type: string;
  state: TaskState;
}

export interface ArtifactTreePlan {
  id: string;
  planPath: string;
  summaryPath: string | null;
  /** `unrecognized` quando o próprio PLAN.md não pôde ser parseado — `tasks` fica vazio nesse caso. */
  parsed: "ok" | "unrecognized";
  tasks: ArtifactTreeTask[];
}

export type ArtifactKind = "plan" | "summary" | "verification" | "other";

export interface ArtifactRef {
  path: string;
  fileName: string;
  kind: ArtifactKind;
  parsed: "ok" | "unrecognized";
  issues: ParseIssue[];
}

export interface PhaseArtifactTree {
  phaseDirPath: string;
  plans: ArtifactTreePlan[];
  artifacts: ArtifactRef[];
}

const PLAN_PATTERN = /^(\d+(?:\.\d)?)-(\d{2})-PLAN\.md$/;
const SUMMARY_PATTERN = /^(\d+(?:\.\d)?)-(\d{2})-SUMMARY\.md$/;
const VERIFICATION_PATTERN = /^\d+(?:\.\d)?-VERIFICATION\.md$/;

interface Classified {
  fileName: string;
  kind: ArtifactKind;
  planId: string | null;
}

function classify(fileName: string): Classified {
  const planMatch = PLAN_PATTERN.exec(fileName);
  if (planMatch) return { fileName, kind: "plan", planId: planMatch[2] };

  const summaryMatch = SUMMARY_PATTERN.exec(fileName);
  if (summaryMatch) return { fileName, kind: "summary", planId: summaryMatch[2] };

  if (VERIFICATION_PATTERN.test(fileName)) {
    return { fileName, kind: "verification", planId: null };
  }

  return { fileName, kind: "other", planId: null };
}

/**
 * Tenta parsear um artefato conhecido (PLAN/SUMMARY/VERIFICATION) só para
 * decidir `ArtifactRef.parsed`/`issues` — artefatos `other` (CONTEXT,
 * RESEARCH, UI-SPEC, etc.) não têm parser estruturado nesta fase e sempre
 * contam como `ok` (a fidelidade deles é avaliada em modo de leitura crua,
 * não estrutural).
 */
async function classifyParseResult(
  kind: ArtifactKind,
  path: string,
  load: (path: string) => Promise<string>,
): Promise<{ parsed: "ok" | "unrecognized"; issues: ParseIssue[] }> {
  if (kind === "other") return { parsed: "ok", issues: [] };

  let raw: string;
  try {
    raw = await load(path);
  } catch (error) {
    return {
      parsed: "unrecognized",
      issues: [{ path, reason: `Falha ao ler artefato: ${String(error)}` }],
    };
  }

  if (kind === "plan") {
    const result = parsePlanFile(raw, path);
    return result.kind === "ok" ? { parsed: "ok", issues: [] } : { parsed: "unrecognized", issues: result.issues };
  }

  if (kind === "summary") {
    const { parseSummaryFile } = await import("./parser/summary");
    const result = parseSummaryFile(raw, path);
    return result.kind === "ok" ? { parsed: "ok", issues: [] } : { parsed: "unrecognized", issues: result.issues };
  }

  // verification
  const { parseVerificationFile } = await import("./parser/verification");
  const result = parseVerificationFile(raw, path);
  return result.kind === "ok" ? { parsed: "ok", issues: [] } : { parsed: "unrecognized", issues: result.issues };
}

async function buildPlanNode(
  phaseDirPath: string,
  planId: string,
  planFileName: string,
  hasSummary: boolean,
  summaryFileName: string | null,
  load: (path: string) => Promise<string>,
): Promise<ArtifactTreePlan> {
  const planPath = `${phaseDirPath}/${planFileName}`;
  const summaryPath = summaryFileName ? `${phaseDirPath}/${summaryFileName}` : null;

  let raw: string;
  let parsedPlan: ReturnType<typeof parsePlanFile> | null = null;
  try {
    raw = await load(planPath);
    parsedPlan = parsePlanFile(raw, planPath);
  } catch {
    parsedPlan = null;
  }

  if (!parsedPlan || parsedPlan.kind === "unrecognized") {
    return { id: planId, planPath, summaryPath, parsed: "unrecognized", tasks: [] };
  }

  const state: TaskState = hasSummary ? "done" : "pending";
  const model: PlanModel = parsedPlan.value;
  const tasks: ArtifactTreeTask[] = model.tasks.map((task) => ({
    name: task.name,
    type: task.type,
    state,
  }));

  return { id: planId, planPath, summaryPath, parsed: "ok", tasks };
}

export async function buildPhaseArtifactTree(
  phaseDirPath: string,
  fileNames: string[],
  load: (path: string) => Promise<string>,
): Promise<PhaseArtifactTree> {
  const classified = fileNames.map(classify);

  const planFiles = classified.filter((entry) => entry.kind === "plan");
  const summaryPlanIds = new Set(
    classified.filter((entry) => entry.kind === "summary").map((entry) => entry.planId),
  );
  const summaryByPlanId = new Map<string, string>();
  for (const entry of classified) {
    if (entry.kind === "summary" && entry.planId) {
      summaryByPlanId.set(entry.planId, entry.fileName);
    }
  }

  const plans = await Promise.all(
    planFiles
      .filter((entry): entry is Classified & { planId: string } => entry.planId !== null)
      .map((entry) =>
        buildPlanNode(
          phaseDirPath,
          entry.planId,
          entry.fileName,
          summaryPlanIds.has(entry.planId),
          summaryByPlanId.get(entry.planId) ?? null,
          load,
        ),
      ),
  );
  plans.sort((a, b) => a.id.localeCompare(b.id));

  const artifacts = await Promise.all(
    classified.map(async (entry) => {
      const path = `${phaseDirPath}/${entry.fileName}`;
      const { parsed, issues } = await classifyParseResult(entry.kind, path, load);
      const ref: ArtifactRef = { path, fileName: entry.fileName, kind: entry.kind, parsed, issues };
      return ref;
    }),
  );

  return { phaseDirPath, plans, artifacts };
}
