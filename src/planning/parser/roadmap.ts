// Parser de `.planning/ROADMAP.md` — fases, goal, requisitos, dependências,
// critérios de sucesso e a ordem de fase declarada na checklist `## Phases`.
//
// Percorre a AST com `unified` + `remark-parse` (não casa headings por regex
// sobre texto cru — o formato evolui na branch `next` do gsd-core, ver
// `01-RESEARCH.md` → `## Don't Hand-Roll`). Cada campo ausente vira
// `unrecognized` naquele campo, sem derrubar a fase inteira nem o roadmap
// inteiro (T-01-06a).
//
// Regra estrutural (Anti-Pattern do Pattern 1): este parser NUNCA extrai
// status de fase da tabela coarse `## Progress` nem dos checkboxes de
// `## Phases` — esses vocabulários são coarse/humanos. A fonte de verdade
// granular do board é sempre `phase-scan.ts` + `status.ts`.

import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Content, Heading, List, Root } from "mdast";

import { ok, unrecognized, type ParseIssue, type ParseResult } from "../parse-result";

export interface RoadmapPhase {
  number: ParseResult<number>;
  name: ParseResult<string>;
  goal: ParseResult<string>;
  mode: ParseResult<string>;
  dependsOn: ParseResult<string>;
  requirementIds: ParseResult<string[]>;
  plans: ParseResult<string>;
  successCriteria: ParseResult<string[]>;
}

export interface RoadmapModel {
  phases: RoadmapPhase[];
  /** Ordem de fases extraída da checklist `## Phases` — usada como desempate de ordenação, nunca como fonte de status. */
  phaseOrder: number[];
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

function headingDepth(node: Content): number | null {
  return node.type === "heading" ? (node as Heading).depth : null;
}

function headingText(node: Content): string {
  return mdastToText(node).trim();
}

const PHASE_HEADING_PATTERN = /^Phase\s+(\d+(?:\.\d+)?)\s*:\s*(.*)$/i;
const PHASES_CHECKLIST_ITEM_PATTERN = /Phase\s+(\d+(?:\.\d+)?)/i;

function parseList(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  return withoutBrackets
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function emptyPhaseResult(number: ParseResult<number>, sourcePath: string): RoadmapPhase {
  const issue: ParseIssue = { path: sourcePath, reason: "Campo ausente no bloco da fase" };
  return {
    number,
    name: unrecognized([issue]),
    goal: unrecognized([issue]),
    mode: unrecognized([issue]),
    dependsOn: unrecognized([issue]),
    requirementIds: unrecognized([issue]),
    plans: unrecognized([issue]),
    successCriteria: unrecognized([issue]),
  };
}

function parsePhaseBlock(
  headingNode: Heading,
  bodyNodes: Content[],
  sourcePath: string,
): RoadmapPhase {
  const rawHeadingText = headingText(headingNode);
  const headingMatch = PHASE_HEADING_PATTERN.exec(rawHeadingText);

  const number: ParseResult<number> = headingMatch
    ? ok(Number.parseFloat(headingMatch[1]))
    : unrecognized([
        {
          path: sourcePath,
          field: "number",
          reason: `Heading de fase não casa o padrão "Phase N: Nome" (recebido: "${rawHeadingText}")`,
        },
      ]);

  const name: ParseResult<string> = headingMatch
    ? ok(headingMatch[2].trim())
    : unrecognized([
        {
          path: sourcePath,
          field: "name",
          reason: `Heading de fase não casa o padrão "Phase N: Nome" (recebido: "${rawHeadingText}")`,
        },
      ]);

  const phase = emptyPhaseResult(number, sourcePath);
  phase.name = name;

  let successCriteriaHeadingSeen = false;

  function processLine(rawLine: string) {
    const text = rawLine.trim();
    if (text.length === 0) return;
    const lower = text.toLowerCase();

    // Um único "**Label**: valor" pode aparecer como uma entre várias linhas
    // dentro do MESMO parágrafo (o gsd-core não separa Goal/Mode/Depends
    // on/Requirements/Success Criteria por linhas em branco — remark-parse
    // trata isso como quebras de linha suaves dentro de um único nó
    // `paragraph`, não como parágrafos separados). Por isso cada linha é
    // processada individualmente aqui, em vez de tratar o parágrafo inteiro
    // como um único campo.
    if (lower.startsWith("goal:") && phase.goal.kind !== "ok") {
      phase.goal = ok(text.slice(text.indexOf(":") + 1).trim());
    } else if (lower.startsWith("mode:") && phase.mode.kind !== "ok") {
      phase.mode = ok(text.slice(text.indexOf(":") + 1).trim());
    } else if (lower.startsWith("depends on:") && phase.dependsOn.kind !== "ok") {
      phase.dependsOn = ok(text.slice(text.indexOf(":") + 1).trim());
    } else if (lower.startsWith("requirements:") && phase.requirementIds.kind !== "ok") {
      phase.requirementIds = ok(parseList(text.slice(text.indexOf(":") + 1)));
    } else if (lower.startsWith("plans:") && phase.plans.kind !== "ok") {
      const value = text.slice(text.indexOf(":") + 1).trim();
      if (value.length > 0) {
        phase.plans = ok(value);
      }
    } else if (lower.startsWith("success criteria")) {
      successCriteriaHeadingSeen = true;
    }
  }

  for (const node of bodyNodes) {
    if (node.type === "paragraph") {
      const text = mdastToText(node);
      for (const line of text.split("\n")) {
        processLine(line);
      }
      continue;
    }

    if (node.type === "list" && successCriteriaHeadingSeen && phase.successCriteria.kind !== "ok") {
      const list = node as List;
      phase.successCriteria = ok(
        list.children.map((item) => mdastToText(item).trim()),
      );
    }
  }

  return phase;
}

function extractPhaseOrder(children: Content[]): number[] {
  const phasesHeadingIndex = children.findIndex(
    (node) => headingDepth(node) === 2 && headingText(node).toLowerCase() === "phases",
  );
  if (phasesHeadingIndex === -1) return [];

  // A seção `## Phases` pode conter mais de uma lista antes da checklist real
  // de fases (ex.: uma lista explicativa sobre a convenção de numeração de
  // fases). Por isso percorremos TODAS as listas da seção, não só a
  // primeira, e filtramos pelos itens que efetivamente casam "Phase N" — a
  // lista explicativa não produz nenhum match e é naturalmente ignorada.
  const order: number[] = [];
  for (let i = phasesHeadingIndex + 1; i < children.length; i += 1) {
    const node = children[i];
    const depth = headingDepth(node);
    if (depth !== null && depth <= 2) break;
    if (node.type !== "list") continue;

    for (const item of (node as List).children) {
      const match = PHASES_CHECKLIST_ITEM_PATTERN.exec(mdastToText(item));
      if (match) {
        order.push(Number.parseFloat(match[1]));
      }
    }
  }
  return order;
}

export function parseRoadmap(rawText: string, sourcePath: string): ParseResult<RoadmapModel> {
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

  const detailsHeadingIndex = children.findIndex(
    (node) =>
      headingDepth(node) === 2 &&
      headingText(node).toLowerCase() === "phase details",
  );

  if (detailsHeadingIndex === -1) {
    return unrecognized(
      [
        {
          path: sourcePath,
          reason: 'Heading "## Phase Details" não encontrado — nenhuma fase pôde ser extraída',
        },
      ],
      rawText,
    );
  }

  // Delimita o fim da seção `## Phase Details`: o próximo heading de
  // profundidade <= 2 (ex.: `## Progress`), ou o fim do documento.
  let detailsEndIndex = children.length;
  for (let i = detailsHeadingIndex + 1; i < children.length; i += 1) {
    const depth = headingDepth(children[i]);
    if (depth !== null && depth <= 2) {
      detailsEndIndex = i;
      break;
    }
  }
  const detailsNodes = children.slice(detailsHeadingIndex + 1, detailsEndIndex);

  // Segmenta por heading de profundidade 3 (`### Phase N: Nome`).
  const phases: RoadmapPhase[] = [];
  let currentHeading: Heading | null = null;
  let currentBody: Content[] = [];

  function flushCurrentPhase() {
    if (currentHeading) {
      phases.push(parsePhaseBlock(currentHeading, currentBody, sourcePath));
    }
  }

  for (const node of detailsNodes) {
    if (headingDepth(node) === 3) {
      flushCurrentPhase();
      currentHeading = node as Heading;
      currentBody = [];
    } else {
      currentBody.push(node);
    }
  }
  flushCurrentPhase();

  const phaseOrder = extractPhaseOrder(children);

  return ok({ phases, phaseOrder });
}
