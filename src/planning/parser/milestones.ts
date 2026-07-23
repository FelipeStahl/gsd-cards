// Leitura do histórico de milestones enviados — o índice `.planning/MILESTONES.md`
// e os roadmaps arquivados em `.planning/milestones/{version}-ROADMAP.md`.
//
// Correção factual herdada de `01-RESEARCH.md` (Pitfall 3): o caminho real de
// arquivamento de milestones enviados é `.planning/milestones/` — um outro
// diretório interno do gsd-core, mencionado só na pesquisa desta fase, é
// caminho morto e nunca escrito por nenhum workflow. Nenhuma função deste
// módulo consulta esse diretório morto; usa exclusivamente
// `milestonesDir`/`milestonesIndexPath` de `../paths` (D-08).
//
// Granularidade deliberadamente mínima (D-08): nome/número da fase e o status
// coarse registrado no momento do arquivamento — nunca o `DiskStatus`
// granular do board ativo, porque uma fase arquivada não tem mais diretório
// vivo para inspecionar. Por isso — e SOMENTE aqui — a coluna `Status` da
// tabela `## Progress` do roadmap arquivado é uma fonte aceitável (ao
// contrário de `parser/roadmap.ts`, que nunca a lê, ver seu Anti-Pattern).

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Content, Heading, Root, Table } from "mdast";

import { ok, unrecognized, type ParseIssue, type ParseResult } from "../parse-result";
import { listPlanningDir, readPlanningText } from "../read";
import { milestonesDir } from "../paths";
import { parseRoadmap } from "./roadmap";

/** Uma entrada do índice `.planning/MILESTONES.md` — um milestone enviado. */
export interface MilestoneIndexEntry {
  version: ParseResult<string>;
  name: ParseResult<string>;
  shippedDate: ParseResult<string>;
  phaseCount: ParseResult<number>;
  planCount: ParseResult<number>;
  taskCount: ParseResult<number>;
}

/**
 * Uma fase de um milestone arquivado — granularidade mínima de D-08. `status`
 * é o vocabulário coarse da tabela `## Progress` do roadmap arquivado
 * (`Not started|In progress|Complete|Deferred`, texto literal preservado),
 * DIFERENTE do `DiskStatus` granular do board ativo — não confundir os dois.
 */
export interface ArchivedPhaseRef {
  number: number;
  name: string;
  status: string;
}

/**
 * Um milestone arquivado (`{version}-ROADMAP.md` em `.planning/milestones/`).
 * `issues` fica não-vazio quando a leitura/parse degradou (D-15) — a
 * varredura de outros milestones continua normalmente mesmo assim.
 */
export interface ArchivedMilestone {
  version: string;
  phases: ArchivedPhaseRef[];
  issues: ParseIssue[];
}

// Helpers de AST duplicados intencionalmente de `parser/roadmap.ts` (não
// exportados de lá) — mantém este módulo autocontido sem reabrir o arquivo do
// Plano 03 só para expor utilitários internos. Assinatura deliberadamente
// mais genérica que a de `roadmap.ts` (aceita qualquer nó com `value`/
// `children`, não só `Content | Root`) porque este módulo também extrai texto
// de nós de tabela (`TableCell`), que não fazem parte da união `Content`.
function mdastToText(node: unknown): string {
  if (typeof node !== "object" || node === null) return "";
  const candidate = node as { value?: unknown; children?: unknown[] };
  if (typeof candidate.value === "string") {
    return candidate.value;
  }
  if (Array.isArray(candidate.children)) {
    return candidate.children.map((child) => mdastToText(child)).join("");
  }
  return "";
}

function headingDepth(node: Content): number | null {
  return node.type === "heading" ? (node as Heading).depth : null;
}

function headingText(node: Content): string {
  return mdastToText(node).trim();
}

const MILESTONE_HEADING_PATTERN = /^(\S+)\s+(.+?)\s*\(Shipped:\s*([^)]+)\)$/i;
const PHASES_COMPLETED_PATTERN =
  /Phases completed:\s*(\d+)\s*phases,\s*(\d+)\s*plans,\s*(\d+)\s*tasks/i;

function unrecognizedEntry(sourcePath: string, headingRaw: string): MilestoneIndexEntry {
  const issue: ParseIssue = {
    path: sourcePath,
    reason: `Heading de milestone não casa o padrão "{versao} {nome} (Shipped: {data})" (recebido: "${headingRaw}")`,
  };
  return {
    version: unrecognized([issue]),
    name: unrecognized([issue]),
    shippedDate: unrecognized([issue]),
    phaseCount: unrecognized([issue]),
    planCount: unrecognized([issue]),
    taskCount: unrecognized([issue]),
  };
}

/**
 * Parseia `.planning/MILESTONES.md` — índice de milestones enviados, mais
 * recente primeiro (ordem em que o gsd-core escreve, ver `bin/lib/milestone.cjs`).
 * Cada heading `## {version} {name} (Shipped: {date})` vira uma entrada; um
 * heading que não casa o padrão vira uma entrada isolada `unrecognized`, sem
 * derrubar as demais (T-01-06a). Um arquivo vazio ou sem nenhum heading de
 * nível 2 devolve `ok([])` — ausência de conteúdo não é erro.
 */
export function parseMilestonesIndex(
  rawText: string,
  sourcePath: string,
): ParseResult<MilestoneIndexEntry[]> {
  let tree: Root;
  try {
    tree = unified().use(remarkParse).parse(rawText) as Root;
  } catch (error) {
    return unrecognized(
      [
        {
          path: sourcePath,
          reason: `Falha ao parsear markdown: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      rawText,
    );
  }

  const children = tree.children as Content[];
  const entries: MilestoneIndexEntry[] = [];

  let currentMatch: RegExpExecArray | null = null;
  let currentBody: Content[] = [];

  function flush() {
    if (!currentMatch) return;
    const [, versionRaw, nameRaw, dateRaw] = currentMatch;

    let phaseCount: ParseResult<number> = unrecognized([
      { path: sourcePath, field: "phaseCount", reason: '"Phases completed" não encontrado no corpo da entrada' },
    ]);
    let planCount: ParseResult<number> = unrecognized([
      { path: sourcePath, field: "planCount", reason: '"Phases completed" não encontrado no corpo da entrada' },
    ]);
    let taskCount: ParseResult<number> = unrecognized([
      { path: sourcePath, field: "taskCount", reason: '"Phases completed" não encontrado no corpo da entrada' },
    ]);

    for (const node of currentBody) {
      const match = PHASES_COMPLETED_PATTERN.exec(mdastToText(node));
      if (match) {
        phaseCount = ok(Number.parseInt(match[1], 10));
        planCount = ok(Number.parseInt(match[2], 10));
        taskCount = ok(Number.parseInt(match[3], 10));
        break;
      }
    }

    entries.push({
      version: ok(versionRaw.trim()),
      name: ok(nameRaw.trim()),
      shippedDate: ok(dateRaw.trim()),
      phaseCount,
      planCount,
      taskCount,
    });
  }

  for (const node of children) {
    if (headingDepth(node) === 2) {
      flush();
      const text = headingText(node);
      currentMatch = MILESTONE_HEADING_PATTERN.exec(text);
      currentBody = [];
      if (!currentMatch) {
        entries.push(unrecognizedEntry(sourcePath, text));
      }
      continue;
    }
    currentBody.push(node);
  }
  flush();

  return ok(entries);
}

const ROADMAP_ARCHIVE_PATTERN = /^(.+)-ROADMAP\.md$/;

/** Extrai o número de fase de uma célula "N. Nome" ou "N.N. Nome" da tabela `## Progress`. */
const PROGRESS_PHASE_CELL_PATTERN = /^(\d+(?:\.\d+)?)\.?\s*(.*)$/;

/**
 * Extrai o mapa `número da fase -> status coarse` da tabela `## Progress` de
 * um roadmap arquivado. Único lugar do produto que lê essa tabela como fonte
 * de status (ver docstring do módulo) — só é seguro aqui porque a fase
 * arquivada não tem mais diretório vivo para a fonte granular inspecionar.
 */
function extractProgressStatuses(
  rawText: string,
  sourcePath: string,
): { statuses: Map<number, string>; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  let tree: Root;
  try {
    tree = unified().use(remarkParse).use(remarkGfm).parse(rawText) as Root;
  } catch (error) {
    issues.push({
      path: sourcePath,
      reason: `Falha ao parsear tabela "## Progress": ${error instanceof Error ? error.message : String(error)}`,
    });
    return { statuses: new Map(), issues };
  }

  const children = tree.children as Content[];
  const progressHeadingIndex = children.findIndex(
    (node) => headingDepth(node) === 2 && headingText(node).toLowerCase() === "progress",
  );
  if (progressHeadingIndex === -1) {
    issues.push({ path: sourcePath, reason: 'Heading "## Progress" não encontrado' });
    return { statuses: new Map(), issues };
  }

  let tableNode: Table | null = null;
  for (let i = progressHeadingIndex + 1; i < children.length; i += 1) {
    const node = children[i];
    const depth = headingDepth(node);
    if (depth !== null && depth <= 2) break;
    if (node.type === "table") {
      // Narrowing via discriminante `type: "table"` — `Table` já faz parte
      // da união `Content` em `@types/mdast` (tabelas GFM registradas em
      // `RootContentMap`), sem necessidade de cast.
      tableNode = node;
      break;
    }
  }
  if (!tableNode) {
    issues.push({ path: sourcePath, reason: 'Tabela da seção "## Progress" não encontrada' });
    return { statuses: new Map(), issues };
  }

  const statuses = new Map<number, string>();
  for (const row of tableNode.children.slice(1)) {
    const cells = row.children;
    if (cells.length < 3) continue;
    const phaseCellText = mdastToText(cells[0]).trim();
    const statusCellText = mdastToText(cells[2]).trim();
    const match = PROGRESS_PHASE_CELL_PATTERN.exec(phaseCellText);
    if (!match) continue;
    const number = Number.parseFloat(match[1]);
    if (Number.isFinite(number)) {
      statuses.set(number, statusCellText);
    }
  }

  return { statuses, issues };
}

/** Ordena versões em ordem decrescente, tolerando prefixos não numéricos (`v0.9` < `v1.0` < `v10.2`). */
function parseVersionSortKey(version: string): number[] {
  const digitsOnly = version.replace(/^[^\d]*/, "");
  return digitsOnly.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersionsDesc(a: string, b: string): number {
  const av = parseVersionSortKey(a);
  const bv = parseVersionSortKey(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (bv[i] ?? 0) - (av[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Varre `.planning/milestones/`, identifica os arquivos `{version}-ROADMAP.md`
 * e, para cada um, reaproveita `parseRoadmap` (Plano 03) para extrair as
 * fases arquivadas, cruzando com a tabela `## Progress` para o status coarse.
 *
 * Ausência total do diretório (projeto sem nenhum milestone enviado — o caso
 * deste próprio repositório) devolve lista vazia, nunca lança exceção (D-15).
 * Um arquivo individual ilegível vira uma `ArchivedMilestone` com `phases: []`
 * e `issues` preenchido, sem impedir os demais milestones de aparecer.
 */
export async function scanArchivedMilestones(projectRoot: string): Promise<ArchivedMilestone[]> {
  const dir = milestonesDir(projectRoot);

  let entries: Awaited<ReturnType<typeof listPlanningDir>>;
  try {
    entries = await listPlanningDir(dir);
  } catch {
    return [];
  }

  const results: ArchivedMilestone[] = [];

  for (const entry of entries) {
    if (!entry.isFile) continue;
    const match = ROADMAP_ARCHIVE_PATTERN.exec(entry.name);
    if (!match) continue;

    const version = match[1];
    const filePath = `${dir}/${entry.name}`;

    let raw: string;
    try {
      raw = await readPlanningText(filePath);
    } catch (error) {
      results.push({
        version,
        phases: [],
        issues: [
          { path: filePath, reason: `Falha ao ler roadmap arquivado: ${String(error)}` },
        ],
      });
      continue;
    }

    const roadmapResult = parseRoadmap(raw, filePath);
    if (roadmapResult.kind !== "ok") {
      results.push({ version, phases: [], issues: roadmapResult.issues });
      continue;
    }

    const { statuses, issues: progressIssues } = extractProgressStatuses(raw, filePath);
    const issues = [...progressIssues];

    const phases: ArchivedPhaseRef[] = [];
    for (const phase of roadmapResult.value.phases) {
      if (phase.number.kind !== "ok") continue;
      const number = phase.number.value;
      const name = phase.name.kind === "ok" ? phase.name.value : `Fase ${number}`;
      const status = statuses.get(number);
      if (status === undefined) {
        issues.push({
          path: filePath,
          field: "status",
          reason: `Fase ${number} não encontrada na tabela "## Progress" — status desconhecido`,
        });
      }
      phases.push({ number, name, status: status ?? "unknown" });
    }

    results.push({ version, phases, issues });
  }

  results.sort((a, b) => compareVersionsDesc(a.version, b.version));
  return results;
}
