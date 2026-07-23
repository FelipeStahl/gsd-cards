#!/usr/bin/env node
// Regenera o snapshot-oráculo `src/planning/__fixtures__/oracle/gsd-tools-manager.json`
// a partir do `gsd-tools` instalado LOCALMENTE com o gsd-core.
//
// Rodado manualmente por um desenvolvedor — NUNCA pelo app GSD Cards em
// runtime, NUNCA em CI. O usuário final do app distribuído não terá Node nem
// o gsd-core instalados; o `gsd-tools` serve aqui só como oráculo de teste em
// desenvolvimento (ver `01-RESEARCH.md` → `## Don't Hand-Roll`).
//
// Uso:
//   node scripts/refresh-fixtures.mjs [caminho-do-projeto-gsd]
//   npm run fixtures:refresh
//
// Sem argumento, usa este próprio repositório como projeto-alvo — ele mesmo
// é um projeto GSD com `.planning/` real.
//
// Depois de rodar: inspecione o diff do snapshot. Uma mudança estrutural
// (campo novo/removido, vocabulário de `disk_status` diferente) é o gsd-core
// tendo evoluído de formato — atualize `src/planning/status.ts` antes de
// commitar (ver `CONTRIBUTING.md`).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const targetProjectRoot = resolve(process.argv[2] ?? REPO_ROOT);

/**
 * Localiza o `gsd-tools.cjs` instalado localmente — mesma convenção de
 * resolução usada pelos workflows do GSD (`.claude/gsd-core/bin/`, `PATH`,
 * `$HOME/.claude/gsd-core/bin/`). Este script NUNCA baixa nem instala nada —
 * se nenhuma instalação local for encontrada, falha explicitamente.
 */
function resolveGsdTools() {
  const candidates = [
    join(targetProjectRoot, ".claude", "gsd-core", "bin", "gsd-tools.cjs"),
    join(REPO_ROOT, ".claude", "gsd-core", "bin", "gsd-tools.cjs"),
    join(homedir(), ".claude", "gsd-core", "bin", "gsd-tools.cjs"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { kind: "node-script", path: candidate };
    }
  }

  try {
    execFileSync("gsd-tools", ["--version"], { stdio: "ignore" });
    return { kind: "path-binary", path: "gsd-tools" };
  } catch {
    // Não encontrado no PATH — cai para o erro explícito abaixo.
  }

  return null;
}

function fail(message) {
  console.error(`\nERRO: ${message}\n`);
  console.error(
    "Este script depende de uma instalação LOCAL do gsd-core (o `gsd-tools` " +
      "CLI usado como oráculo de teste em desenvolvimento) — isso é " +
      "intencional (ver docstring deste arquivo e `CONTRIBUTING.md`). " +
      "Instale o gsd-core (ex.: `npx -y @opengsd/gsd-core@latest --claude " +
      "--local`) e rode este script de novo.\n",
  );
  process.exit(1);
}

const tool = resolveGsdTools();
if (!tool) {
  fail("`gsd-tools` não encontrado (nem em .claude/gsd-core/bin/, nem no PATH).");
}

let rawStdout;
try {
  const args = tool.kind === "node-script" ? [tool.path, "init", "manager", "--raw"] : ["init", "manager", "--raw"];
  const command = tool.kind === "node-script" ? process.execPath : tool.path;
  rawStdout = execFileSync(command, args, {
    cwd: targetProjectRoot,
    encoding: "utf-8",
  });
} catch (error) {
  fail(`Falha ao executar \`gsd-tools init manager --raw\` contra ${targetProjectRoot}: ${error.message}`);
}

let raw;
try {
  raw = JSON.parse(rawStdout);
} catch (error) {
  fail(`Saída de \`gsd-tools init manager --raw\` não é JSON válido: ${error.message}`);
}

if (!Array.isArray(raw.phases)) {
  fail('Saída de `gsd-tools init manager --raw` não contém um array "phases" — formato inesperado.');
}

// Normalização (T-01-13): remove campos voláteis que mudariam a cada
// execução sem indicar drift de formato real —
//   - timestamps absolutos (`last_activity`)
//   - caminhos absolutos da máquina do desenvolvedor (`project_root`,
//     `agents_dir`) — nunca gravar estrutura de diretórios pessoais no
//     repositório open-source
//   - sinais dependentes de mtime (`is_active`, o indicador de "fase ativa")
// Preserva os campos ESTRUTURAIS por fase: identificador (`number`),
// contagem de planos/summaries, sinais de contexto/pesquisa, status de
// verificação e o `disk_status` derivado — exatamente o que
// `oracle-drift.test.ts` compara contra `deriveDiskStatus`.
const normalized = {
  milestone_version: raw.milestone_version ?? null,
  phase_count: raw.phase_count ?? raw.phases.length,
  phases: raw.phases.map((phase) => ({
    number: phase.number,
    plan_count: phase.plan_count,
    summary_count: phase.summary_count,
    has_context: phase.has_context,
    has_research: phase.has_research,
    verification_status: phase.verification_status,
    disk_status: phase.disk_status,
  })),
};

const outputPath = join(REPO_ROOT, "src", "planning", "__fixtures__", "oracle", "gsd-tools-manager.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");

console.log(`Snapshot do oráculo regenerado: ${outputPath}`);
console.log(`Projeto-alvo: ${targetProjectRoot}`);
console.log(`Fases: ${normalized.phases.length}`);
console.log("\nInspecione o diff (git diff) — mudança estrutural = gsd-core mudou de formato.");
