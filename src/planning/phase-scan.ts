// Varredura do diretório de fases — coleta os sinais de disco (`PhaseDirSignals`)
// que `status.ts` (Task 1) usa para derivar `DiskStatus`. Toda a lógica de
// negócio (a regra em si) vive em `status.ts`; este arquivo só faz I/O.
//
// Regra estrutural (D-15, falha localizada): uma falha ao ler um diretório
// de fase específico produz uma `ParseIssue` naquela fase e a varredura
// continua para as demais — nenhuma exceção de um diretório derruba o board
// inteiro.

import matter from "gray-matter";
import type { DirEntry } from "@tauri-apps/plugin-fs";

import { listPlanningDir, readPlanningText, statPlanningPath } from "./read";
import { phasesDir as planningPhasesDir } from "./paths";
import type { ParseIssue } from "./parse-result";
import { ACTIVE_WINDOW_MS, type PhaseDirSignals, type VerificationStatus } from "./status";

export interface ParsedPhaseDirName {
  /** Valor numérico para ordenação — `2.1` para uma fase decimal inserida (D-07). */
  number: number;
  /** Número zero-padded original, preservado literalmente para exibição (ex.: `01`, `02.1`). */
  padded: string;
  slug: string;
}

export interface PhaseScanEntry extends ParsedPhaseDirName {
  dirName: string;
  signals: PhaseDirSignals;
  issues: ParseIssue[];
}

/** `<numero>-<slug>` — numero inteiro ou decimal com uma casa (fases inseridas, D-07). */
const PHASE_DIR_NAME_PATTERN = /^(\d+(?:\.\d)?)-(.+)$/;

export function parsePhaseDirName(name: string): ParsedPhaseDirName | null {
  const match = PHASE_DIR_NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, numberPart, slug] = match;
  const number = Number.parseFloat(numberPart);
  if (!Number.isFinite(number) || slug.length === 0) return null;
  return { number, padded: numberPart, slug };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface PhaseFilePatterns {
  plan: RegExp;
  summary: RegExp;
  context: RegExp;
  research: RegExp;
  verification: RegExp;
}

/**
 * Padrões escopados ao número da fase quando reconhecível (ex.: `01-`),
 * evitando que artefatos de uma fase vizinha sejam contados por engano.
 * Quando o nome do diretório não casa `parsePhaseDirName` (varredura direta
 * de um diretório com nome atípico), cai para um padrão genérico — melhor
 * degradar para "qualquer numero" do que recusar a varredura inteira.
 */
function buildPatterns(dirName: string): PhaseFilePatterns {
  const parsed = parsePhaseDirName(dirName);
  const numero = parsed ? escapeRegExp(parsed.padded) : "\\d+(?:\\.\\d)?";
  return {
    plan: new RegExp(`^${numero}-\\d{2}-PLAN\\.md$`),
    summary: new RegExp(`^${numero}-\\d{2}-SUMMARY\\.md$`),
    context: new RegExp(`^${numero}-CONTEXT\\.md$`),
    research: new RegExp(`^${numero}-RESEARCH\\.md$`),
    verification: new RegExp(`^${numero}-VERIFICATION\\.md$`),
  };
}

const ACCEPTED_VERIFICATION_STATUSES = new Set([
  "passed",
  "gaps_found",
  "human_needed",
]);

function emptySignals(): PhaseDirSignals {
  return {
    planCount: 0,
    summaryCount: 0,
    hasResearch: false,
    hasContext: false,
    isActive: false,
    verificationStatus: "missing",
  };
}

async function resolveVerificationStatus(
  verificationPath: string,
  issues: ParseIssue[],
): Promise<VerificationStatus> {
  let raw: string;
  try {
    raw = await readPlanningText(verificationPath);
  } catch (error) {
    issues.push({
      path: verificationPath,
      reason: `Falha ao ler ${verificationPath}: ${String(error)}`,
    });
    return "missing";
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch (error) {
    issues.push({
      path: verificationPath,
      field: "status",
      reason: `Frontmatter YAML malformado em VERIFICATION.md: ${String(error)}`,
    });
    return "missing";
  }

  const status = (parsed.data as Record<string, unknown> | null)?.status;
  if (typeof status === "string" && ACCEPTED_VERIFICATION_STATUSES.has(status)) {
    return status as VerificationStatus;
  }

  issues.push({
    path: verificationPath,
    field: "status",
    reason: `Campo "status" ausente ou com valor não reconhecido no frontmatter (recebido: ${JSON.stringify(status)})`,
  });
  return "missing";
}

/** Algum arquivo do diretório com mtime dentro de `ACTIVE_WINDOW_MS` — heurística de "fase ativa" do gsd-core. */
async function isDirRecentlyActive(dirPath: string, entries: DirEntry[]): Promise<boolean> {
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isFile) continue;
    try {
      const info = await statPlanningPath(`${dirPath}/${entry.name}`);
      if (info.mtime && now - info.mtime.getTime() < ACTIVE_WINDOW_MS) {
        return true;
      }
    } catch {
      // Falha de stat em um arquivo específico não derruba a varredura (D-15) —
      // apenas esse arquivo não conta como sinal de atividade.
    }
  }
  return false;
}

/**
 * Coleta `PhaseDirSignals` de um único diretório de fase. `phasesRootDir` é
 * `.planning/phases` já resolvido (ver `paths.ts`); `dirName` é o nome do
 * diretório da fase dentro dele (ex.: `01-espelho-fiel`).
 */
export async function scanPhaseDir(
  phasesRootDir: string,
  dirName: string,
): Promise<{ signals: PhaseDirSignals; issues: ParseIssue[] }> {
  const dirPath = `${phasesRootDir}/${dirName}`;
  const patterns = buildPatterns(dirName);
  const issues: ParseIssue[] = [];

  const entries = await listPlanningDir(dirPath);
  const fileEntries = entries.filter((entry) => entry.isFile);
  const fileNames = fileEntries.map((entry) => entry.name);

  const planCount = fileNames.filter((name) => patterns.plan.test(name)).length;
  const summaryCount = fileNames.filter((name) => patterns.summary.test(name)).length;
  const hasContext = fileNames.some((name) => patterns.context.test(name));
  const hasResearch =
    fileNames.some((name) => patterns.research.test(name)) ||
    fileNames.includes("RESEARCH.md");

  const verificationFileName = fileNames.find((name) => patterns.verification.test(name));
  const verificationStatus = verificationFileName
    ? await resolveVerificationStatus(`${dirPath}/${verificationFileName}`, issues)
    : "missing";

  const isActive = await isDirRecentlyActive(dirPath, fileEntries);

  return {
    signals: {
      planCount,
      summaryCount,
      hasContext,
      hasResearch,
      isActive,
      verificationStatus,
    },
    issues,
  };
}

/**
 * Varre `.planning/phases/` inteiro. Entradas cujo nome não casa
 * `parsePhaseDirName` (arquivos soltos, diretórios fora do padrão) são
 * ignoradas silenciosamente — não quebram a varredura das demais fases.
 * Uma falha ao varrer um diretório específico produz uma entrada com
 * `ParseIssue` e sinais vazios, em vez de abortar a função inteira (D-15).
 */
export async function scanAllPhases(projectRoot: string): Promise<PhaseScanEntry[]> {
  const dir = planningPhasesDir(projectRoot);

  let entries: DirEntry[];
  try {
    entries = await listPlanningDir(dir);
  } catch {
    // `.planning/phases/` não existe ou não pôde ser lido — nenhuma fase no disco.
    return [];
  }

  const results: PhaseScanEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const parsed = parsePhaseDirName(entry.name);
    if (!parsed) continue;

    try {
      const { signals, issues } = await scanPhaseDir(dir, entry.name);
      results.push({ dirName: entry.name, ...parsed, signals, issues });
    } catch (error) {
      results.push({
        dirName: entry.name,
        ...parsed,
        signals: emptySignals(),
        issues: [
          {
            path: `${dir}/${entry.name}`,
            reason: `Falha ao varrer diretório da fase: ${String(error)}`,
          },
        ],
      });
    }
  }

  return results;
}
