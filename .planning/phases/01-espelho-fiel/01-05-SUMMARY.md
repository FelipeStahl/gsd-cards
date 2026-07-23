---
phase: 01-espelho-fiel
plan: 05
subsystem: board
tags: [gray-matter, remark-parse, remark-gfm, react-markdown, zustand, i18next, vitest]

# Dependency graph
requires:
  - phase: 01-03
    provides: "status.ts/phase-scan.ts/model.ts (PhaseModel), ui-store.ts (selectedPhaseId/openArtifactPath/selectPhase/openArtifact) já completo para este plano consumir sem editar, board.detail.viewArtifact já existente em board.json"
provides:
  - "parser/plan.ts, parser/summary.ts, parser/verification.ts — parsers tolerantes dos três artefatos de execução (PLAN/SUMMARY/VERIFICATION), cada um com fallback unrecognized explícito, nunca um default plausível e errado"
  - "artifact-tree.ts — buildPhaseArtifactTree monta a hierarquia fase→planos→tarefas com granularidade tudo-ou-nada por plano (TaskState ancorado só na presença do SUMMARY.md), e degrada localmente artefatos corrompidos sem derrubar os demais"
  - "detail-store.ts — carregamento preguiçoso e cacheado por fase/artefato, com invalidação de cache reativa a recentlyUpdatedPhaseIds do board-store"
  - "DetailPanel.tsx — painel de detalhe D-10 (overlay 480px, árvore de 3 níveis)"
  - "ArtifactModal.tsx — modal de artefato D-11 (render GFM fiel + modo raw D-15), namespace i18n artifact"
affects: ["01-06"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Região <tasks> de um PLAN.md é extraída por delimitação de região + varredura de blocos <task> com regex tolerante, nunca um parser XML estrito sobre o arquivo inteiro (o corpo é markdown livre, pode conter <>/soltos)"
    - "TaskState (pending/done) é derivado exclusivamente da presença do arquivo SUMMARY.md correspondente — nunca do conteúdo dele, nem de qualquer outro sinal (Pitfall 4/T-01-06d)"
    - "ArtifactModal nunca produz um elemento <a href> navegável nesta fase — o componente `a` customizado sempre renderiza <span>, mesmo para esquemas http/https, porque o app ainda não tem a capability de abrir URLs externas"
    - "detail-store.ts fica deliberadamente separado do board-store — carregamento sob demanda de artefatos de uma fase nunca re-renderiza o board inteiro"

key-files:
  created:
    - src/planning/parser/plan.ts
    - src/planning/parser/plan.test.ts
    - src/planning/parser/summary.ts
    - src/planning/parser/summary.test.ts
    - src/planning/parser/verification.ts
    - src/planning/parser/verification.test.ts
    - src/planning/parser/resilience.test.ts
    - src/planning/artifact-tree.ts
    - src/planning/__fixtures__/artifacts/01-01-PLAN.md
    - src/planning/__fixtures__/artifacts/01-01-SUMMARY.md
    - src/planning/__fixtures__/artifacts/01-VERIFICATION.md
    - src/planning/__fixtures__/artifacts/corrupted-01-02-PLAN.md
    - src/stores/detail-store.ts
    - src/components/DetailPanel.tsx
    - src/components/DetailPanel.test.tsx
    - src/components/ArtifactModal.tsx
    - src/components/ArtifactModal.test.tsx
    - src/locales/pt-BR/artifact.json
    - src/locales/en/artifact.json
  modified:
    - src/shell/AppShell.tsx
    - src/locales/pt-BR/board.json
    - src/locales/en/board.json
    - src/i18n.ts
    - src/styles/theme.css

key-decisions:
  - "PlanModel.frontmatter converte plan/phase numéricos vindos do YAML (ex.: `plan: 01` interpretado como número pelo parser YAML) de volta para string, seguindo o mesmo padrão já usado em parser/state.ts — evita perder o campo em vez de descartar por causa de um detalhe de serialização YAML"
  - "SummaryModel/VerificationModel normalizam campos de data (`completed`, `verified`) que o YAML interpreta como Date de volta para string ISO, pelo mesmo motivo"
  - "buildPhaseArtifactTree devolve a árvore diretamente (não um ParseResult) porque a montagem da árvore em si nunca falha — cada artefato individual degrada para unrecognized dentro de ArtifactRef/ArtifactTreePlan, e o detail-store é quem envolve o resultado inteiro em ParseResult para cobrir a falha de listar o próprio diretório da fase"
  - "ArtifactModal passa urlTransform identidade ao react-markdown em vez de confiar só no sanitizador default da lib — o componente `a` customizado é a única fonte de decisão sobre navegabilidade, e assim um esquema hostil ainda aparece como texto legível (nunca oculto), só nunca como âncora clicável"

patterns-established:
  - "Parsers de artefato (plan/summary/verification) seguem o mesmo esqueleto: matter() em try/catch → validação do campo estrutural mínimo (phase) → extração tolerante do corpo → unrecognized explícito em cada ponto de falha, nunca uma exceção não tratada"

requirements-completed: [BOARD-02, BOARD-05, BOARD-06]

coverage:
  - id: D1
    description: "parsePlanFile/parseSummaryFile/parseVerificationFile extraem frontmatter tipado e corpo estruturado dos três artefatos de execução a partir de fixtures reais deste repositório, com fallback unrecognized explícito (nunca uma lista vazia ou um status inventado) quando a extração falha"
    requirement: "BOARD-02"
    verification:
      - kind: unit
        ref: "src/planning/parser/plan.test.ts (7 testes) + summary.test.ts (4 testes) + verification.test.ts (5 testes) — vitest run exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildPhaseArtifactTree monta a árvore fase→planos→tarefas com granularidade tudo-ou-nada por plano (SUMMARY ausente → todas pending; SUMMARY presente → todas done), e um PLAN corrompido não impede a montagem dos demais artefatos/planos da mesma fase"
    requirement: "BOARD-02"
    verification:
      - kind: unit
        ref: "src/planning/parser/resilience.test.ts (4 testes: granularidade neutro/concluído, PLAN corrompido não derruba os demais, falha de I/O localizada) — vitest run exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Clicar em um card abre o DetailPanel com a árvore real da fase carregada sob demanda; nenhuma tarefa individual aparece marcada como concluída quando o SUMMARY do plano está ausente; artefato não reconhecido mostra o rótulo de aviso; fecha por botão X e por Esc"
    requirement: "BOARD-02"
    verification:
      - kind: unit
        ref: "src/components/DetailPanel.test.tsx (7 testes) — vitest run exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (tsc --noEmit) exits 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "ArtifactModal renderiza PLAN/SUMMARY/VERIFICATION com GFM fiel (tabelas, checklists com checkbox desabilitada) a partir de fixtures reais; artefato unrecognized abre em modo raw com o banner de motivo e sem tentar renderizar markdown; conteúdo hostil (script embutido, link de esquema javascript:) nunca produz elemento executável/navegável"
    requirement: "BOARD-06"
    verification:
      - kind: unit
        ref: "src/components/ArtifactModal.test.tsx (9 testes) — vitest run exit 0"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*//' src/components/ArtifactModal.tsx | grep -c dangerouslySetInnerHTML retorna 0; grep -c rehype-raw no componente e no package.json retorna 0 nos dois"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fim-a-fim visual: npm run tauri dev mostra o painel de detalhe deste próprio plano com planos/tarefas reais, o modal com tabelas/checklists renderizadas fielmente, e o comportamento de aviso ao corromper temporariamente um artefato de fase"
    verification: []
    human_judgment: true
    rationale: "Requer dirigir uma janela nativa Tauri real — não automatizável a partir deste shell. Deferido ao end-of-phase per .planning/config.json workflow.human_verify_mode: 'end-of-phase', mesmo precedente dos Planos 02/03 (D4 de ambos). A árvore de dados (parsers + buildPhaseArtifactTree) foi validada por unit tests contra os fixtures reais copiados deste repositório, dando alta confiança de que o resultado visual vai bater sem precisar da janela nativa nesta etapa."

duration: 30min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 05: Hierarquia de 3 Níveis e Visualizador de Artefatos Summary

**Parsers tolerantes de PLAN/SUMMARY/VERIFICATION, árvore fase→planos→tarefas com granularidade tudo-ou-nada por plano, painel de detalhe D-10 e modal de artefato D-11 com render GFM fiel via react-markdown+remark-gfm e degradação para modo raw quando o artefato não é parseável.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 (all complete, no checkpoints)
- **Files modified:** 19 created, 5 modified

## Accomplishments

- `parser/plan.ts`/`parser/summary.ts`/`parser/verification.ts` extraem os três artefatos de execução do gsd-core a partir de fixtures reais (uma cópia literal do `01-01-PLAN.md` deste próprio repositório, mais SUMMARY/VERIFICATION plausíveis a partir dos templates instalados) — cada parser degrada para `unrecognized` com motivo legível em vez de inventar um default plausível e errado; `parseVerificationFile` trava explicitamente que um `status` desconhecido nunca vira `passed`
- `artifact-tree.ts`'s `buildPhaseArtifactTree` monta a hierarquia de 3 níveis com a regra de granularidade da pesquisa (Pitfall 4/T-01-06d): `TaskState` é tudo-ou-nada por plano, ancorado só na presença do `SUMMARY.md` — nunca em conteúdo de commit ou qualquer outro sinal; um `PLAN.md` corrompido (fixture `corrupted-01-02-PLAN.md`, cópia real sem delimitador de frontmatter nem fechamento de `<tasks>`) degrada localmente sem impedir a montagem dos demais artefatos da fase (`resilience.test.ts`, BOARD-05)
- `detail-store.ts` carrega a árvore de uma fase sob demanda (nunca na abertura do projeto) e a mantém cacheada por fase/artefato, separado do `board-store` para que o custo do parse nunca force re-render do board inteiro; o cache de uma fase se invalida sozinho quando ela aparece em `recentlyUpdatedPhaseIds`, recarregando o painel aberto em tempo real
- `DetailPanel.tsx` (D-10): overlay lateral de 480px com a árvore fase→planos→tarefas real, estado de carregamento explícito (nunca uma árvore vazia disfarçada de "fase sem planos"), linha de artefato não reconhecida com aviso, fecha por `X` ou `Esc`
- `ArtifactModal.tsx` (D-11, BOARD-06): modal centrado 900px/85vh estilo GitHub preview — `react-markdown`+`remark-gfm` em modo renderizado (tabelas e checklists GFM fiéis, checkboxes desabilitadas), banner de aviso + texto cru em modo raw (D-15) quando o `ParseResult` do artefato é `unrecognized` OU quando a linha de origem no `DetailPanel` já sabia que o artefato era não reconhecido
- Postura de segurança (T-01-02) contra `.planning/` de repositório de terceiros: nenhum plugin de HTML bruto, nenhuma injeção de markup via inner-HTML em nenhum caminho; `urlTransform` passa a URL crua adiante e o componente `a` customizado decide sozinho — só esquemas `http`/`https` chegam perto de virar link, e mesmo assim renderizam só como texto (a capability de abrir URL externa não existe nesta fase); testes dedicados provam ausência de elemento `script` para conteúdo hostil embutido e ausência de âncora navegável para esquema `javascript:`
- Namespace i18n `artifact` (pt-BR/en, paridade de chaves) registrado em `i18n.ts`; novas chaves `board.detail.{breadcrumb,close,loading,plan}` com paridade

## Task Commits

Each task was committed atomically:

1. **Task 1: Parsers de PLAN, SUMMARY e VERIFICATION com tolerância a formato** - `9f70327` (feat)
2. **Task 2: Painel de detalhe com a árvore fase → planos → tarefas** - `e02e087` (feat)
3. **Task 3: Modal de artefato com render GFM fiel e modo raw** - `3121f02` (feat)

**Plan metadata:** _pending — created after this SUMMARY, in the final commit step_

## Files Created/Modified

- `src/planning/parser/plan.ts` / `plan.test.ts` - parser tolerante de PLAN.md, 7 testes
- `src/planning/parser/summary.ts` / `summary.test.ts` - parser de SUMMARY.md + Task Commits via AST, 4 testes
- `src/planning/parser/verification.ts` / `verification.test.ts` - parser de VERIFICATION.md, status nunca default passed, 5 testes
- `src/planning/parser/resilience.test.ts` - granularidade tudo-ou-nada + degradação local BOARD-05, 4 testes
- `src/planning/artifact-tree.ts` - `buildPhaseArtifactTree`, montagem da árvore de 3 níveis
- `src/planning/__fixtures__/artifacts/**` - PLAN real, SUMMARY/VERIFICATION plausíveis, PLAN corrompido
- `src/stores/detail-store.ts` - carregamento preguiçoso e cacheado, invalidação reativa
- `src/components/DetailPanel.tsx` / `DetailPanel.test.tsx` - painel D-10, 7 testes
- `src/components/ArtifactModal.tsx` / `ArtifactModal.test.tsx` - modal D-11, 9 testes
- `src/locales/pt-BR/artifact.json` / `en/artifact.json` - namespace `artifact`
- `src/i18n.ts` - registra o namespace `artifact`
- `src/styles/theme.css` - CSS `.artifact-markdown` (tabelas/checklists GFM)
- `src/shell/AppShell.tsx` - monta `DetailPanel` e `ArtifactModal`
- `src/locales/{pt-BR,en}/board.json` - chaves `detail.{breadcrumb,close,loading,plan}`

## Decisions Made

- Campos de frontmatter que o YAML interpreta como número (`plan: 01`) ou `Date` (`completed: 2026-07-22`) são normalizados de volta para string nos três parsers, seguindo o padrão já estabelecido em `parser/state.ts`, em vez de descartar o campo
- `buildPhaseArtifactTree` devolve a árvore diretamente (a montagem em si nunca falha); é o `detail-store` quem envolve o resultado em `ParseResult` para cobrir a falha de sequer listar o diretório da fase
- `ArtifactModal` nunca produz um `<a href>` navegável nesta fase, nem para esquemas seguros — decisão consciente documentada no UI-SPEC/RESEARCH: a capability de abrir URL externa fica para uma fase futura

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- A hierarquia de 3 níveis e o visualizador de artefatos estão completos e prontos para o Plano 06 (milestones) e para o encerramento da Fase 1
- D5 (verificação visual fim-a-fim com `npm run tauri dev`) deferida ao end-of-phase, mesmo precedente dos Planos 02/03 — alta confiança dado que toda a árvore de dados foi validada por unit test contra fixtures reais
- Nenhum bloqueio para o Plano 06

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 19 tracked deliverable files confirmed present on disk; all 3 commit hashes (`9f70327`, `e02e087`, `3121f02`) confirmed present in `git log`.
