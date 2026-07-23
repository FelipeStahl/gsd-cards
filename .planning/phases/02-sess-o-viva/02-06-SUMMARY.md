---
phase: 02-sess-o-viva
plan: 06
subsystem: ui
tags: [xterm.js, webgl, zustand, immer, tauri, pty, session-lifecycle]

requires:
  - phase: 02-sess-o-viva (Plano 01)
    provides: PTY tracer end-to-end (spawn_session/write_session/resize_session/kill_session, TreeGuard, Channel<Vec<u8>>)
  - phase: 02-sess-o-viva (Plano 04)
    provides: session-store (activeSessionId/sessions[]/focusSession), SessionSidebar/SessionRow, discoverSessions
  - phase: 02-sess-o-viva (Plano 05)
    provides: TerminalView com scrollback/copy-on-select/links clicáveis/busca (TERM-02/TERM-03)
provides:
  - focus-algorithm.ts — algoritmo puro dispose+serialize+restore+flush (Pattern 3) desacoplado do DOM/xterm.js real
  - liveSessions (module-level Map em session-store.ts) — snapshot serializado + backgroundBuffer + hasWebgl por sessão
  - TerminalView.tsx integrado ao algoritmo de foco — troca de sessão nunca mais mata o processo PTY
  - setSessionBytesHandler (channel.ts) — redirecionamento do onmessage do Channel sem recriar o processo
  - archiveSession (session-store.ts) — kill de árvore + remoção da lista, reusado por Arquivar/Excluir
  - ConfirmDialog.tsx — modal genérico pequeno reusável (heading/body/confirm/cancel + tone)
  - Botões Archive/Trash2 na SessionRow (hover-only, CSS-driven)
affects: [fase-3-plus, qualquer-fase-futura-que-precise-de-confirmacao-leve-ConfirmDialog]

tech-stack:
  added: []
  patterns:
    - "focus-algorithm.ts: funções puras (loseFocus/gainFocus) sobre um contrato mínimo estrutural (FocusTerminalHandle/DisposableAddon/SerializeAddonHandle), testável sem xterm.js real"
    - "liveSessions como Map de módulo FORA do shape zustand/immer gerenciado — imprescindível porque o autoFreeze do immer congela recursivamente TODO o estado produzido a cada set(), inclusive campos não tocados, quebrando permanentemente a mutação direta de um Map alcançável pelo estado"
    - "channel.ts bytesHandlers Map — indireção que permite trocar o destino dos bytes recebidos (write direto vs push em buffer) sem recriar o Channel/processo; spawnSession só roda uma vez por sessão"
    - "ConfirmDialog genérico (heading/body/confirm/cancel/tone) distinto do ArtifactModal — reusável por fases futuras"

key-files:
  created:
    - src/components/terminal/focus-algorithm.ts
    - src/components/terminal/focus-algorithm.test.ts
    - src/components/session/ConfirmDialog.tsx
    - src/components/session/ConfirmDialog.test.tsx
  modified:
    - src/components/terminal/TerminalView.tsx
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/pty/channel.ts
    - src/pty/channel.test.ts
    - src/components/session/SessionRow.tsx
    - src/components/session/SessionRow.test.tsx
    - src/components/session/SessionSidebar.test.tsx
    - src/locales/pt-BR/session.json
    - src/locales/en/session.json
    - src/styles/theme.css

key-decisions:
  - "liveSessions vive como Map de módulo fora do shape reativo do zustand/immer — o autoFreeze do immer congela o Map permanentemente na primeira set() de QUALQUER ação da store, confirmado experimentalmente"
  - "spawnSession só é chamado uma vez por sessão (checagem hasLiveSession); toda troca de foco depois disso só redireciona o handler de bytes via setSessionBytesHandler — isso também resolve o double-invoke do StrictMode sem precisar matar/recriar a sessão"
  - "Archive/Delete (SESS-06) restritos a rows não-históricas — uma sessão histórica não tem PtySession viva a matar, e escondê-la reapareceria no próximo discoverSessions já que o .jsonl é intocado"
  - "Fade+collapse de 150ms do UI-SPEC não implementado — exigiria estado de remoção pendente em SessionSidebar.tsx, fora do files_modified deste plano; registrado em WINDOWS.md"

patterns-established:
  - "Funções de algoritmo com contrato estrutural mínimo (não a classe real da lib) para permitir teste sem dependências pesadas de DOM/canvas — mesmo padrão já usado por TerminalSearchBar/SearchAddonHandle, agora replicado em focus-algorithm.ts"
  - "Estado de alta frequência que nunca precisa de reatividade React fica fora do shape zustand/immer, como Map/estrutura de módulo comum"

requirements-completed: [SESS-03, SESS-06]

coverage:
  - id: D1
    description: "Troca de foco entre sessões dispõe webgl -> serializa -> dispõe terminal -> redireciona bytes para backgroundBuffer (perder foco); ganhar foco restaura snapshot + drena buffer em ordem + recarrega webgl (SESS-03)"
    requirement: "SESS-03"
    verification:
      - kind: unit
        ref: "src/components/terminal/focus-algorithm.test.ts#loseFocus/gainFocus — ordem exata + round-trip sem lacunas"
        status: pass
    human_judgment: false
  - id: D2
    description: "No máximo um contexto WebGL vivo entre sessões simultâneas"
    requirement: "SESS-03"
    verification:
      - kind: unit
        ref: "src/components/terminal/focus-algorithm.test.ts#No máximo um contexto WebGL vivo entre sessões simultâneas"
        status: pass
    human_judgment: false
  - id: D3
    description: "Uma sessão real de background continua produzindo output e o usuário vê tudo sem lacunas ao voltar — só observável com processos reais ao longo do tempo"
    requirement: "SESS-03"
    verification: []
    human_judgment: true
    rationale: "Marcado verification: backstop no PLAN.md — exige processos PTY reais e passagem de tempo, não reproduzível de forma determinística em unit test; UAT manual explícito necessário antes de /gsd-verify-work"
  - id: D4
    description: "Arquivar mata a árvore de processos e remove a row sem confirmação; Excluir faz o mesmo após ConfirmDialog; nenhum toca o .jsonl de histórico"
    requirement: "SESS-06"
    verification:
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#Archive/Delete/Cancel — kill de árvore, confirmação, stopPropagation"
        status: pass
      - kind: unit
        ref: "src/stores/session-store.test.ts#archiveSession — kill+remove de sessions[]+liveSessions"
        status: pass
    human_judgment: false
  - id: D5
    description: "Encerramento real de árvore de processos (zero remanescentes no SO) ao arquivar/excluir/fechar o app"
    requirement: "SESS-06"
    verification: []
    human_judgment: true
    rationale: "Backstop já sinalizado em 02-RESEARCH.md/02-UI-SPEC.md — correção do TreeGuard/Job Object é verificável só inspecionando processos reais do SO, gate não-negociável antes de /gsd-verify-work"

duration: 25min
completed: 2026-07-23
status: complete
---

# Phase 2 Plan 06: Algoritmo de foco multi-sessão + affordances de ciclo de vida Summary

**Algoritmo dispose+serialize+restore+flush do xterm.js (webgl só no foco) implementado como funções puras testáveis, com TerminalView/session-store/channel.ts reescritos para nunca mais matar um processo PTY só por troca de foco; Arquivar/Excluir ganham botões de hover + ConfirmDialog genérico.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-23T18:07:33Z (primeiro commit — RED test)
- **Completed:** 2026-07-23T18:23:44Z
- **Tasks:** 2
- **Files modified:** 15 (4 criados, 11 modificados)

## Accomplishments

- `focus-algorithm.ts`: `loseFocus`/`gainFocus` implementam o Pattern 3 EXATO (dispose webgl → serialize → dispose terminal → redirecionar para buffer; nova instância → open → addons base → restaurar snapshot → drenar buffer em ordem → carregar webgl → redirecionar para write → fit+resize), sobre um contrato estrutural mínimo, com 12 testes cobrindo ordem exata, round-trip sem lacunas/duplicação, e "no máximo um webgl vivo"
- `session-store.ts`: `liveSessions` como `Map` de módulo (deliberadamente fora do shape zustand/immer — o `autoFreeze` do immer congelaria o Map permanentemente na primeira `set()` de qualquer ação da store), com `getOrCreateLiveSession`/`hasLiveSession`/`clearLiveSession`; `archiveSession` (SESS-06) mata a árvore + remove da lista + limpa o `LiveSessionState`
- `channel.ts`: `bytesHandlers` Map de módulo permite `setSessionBytesHandler` redirecionar onde os bytes recebidos vão parar sem recriar o `Channel`/processo — `spawnSession` só roda uma vez por sessão
- `TerminalView.tsx`: reescrito para nunca mais chamar `killSession` no cleanup — agora roda `loseFocus`/`gainFocus` a cada troca/desmonte, e só chama `spawnSession` na primeira vez que uma sessão é focada (`!hasLiveSession`). Isso também resolve o double-invoke do StrictMode do React 19 sem a colisão `AlreadyExists` que a versão anterior evitava matando a sessão
- `ConfirmDialog.tsx`: modal genérico pequeno (400px, heading/body/confirm/cancel + `tone`), reusável por fases futuras
- `SessionRow.tsx`: botões Archive/Trash2 (32×32, hover-only via CSS em `theme.css`) — Archive sem confirmação, Delete via `ConfirmDialog`; ambos chamam `archiveSession`

## Task Commits

Cada task foi commitada atomicamente (Task 1 seguiu TDD: RED → GREEN, mais 3 commits adicionais de wiring):

1. **Task 1a (RED):** `test(02-06): add failing test for focus-algorithm (SESS-03)` - `5356d74`
2. **Task 1b (GREEN):** `feat(02-06): implement focus-algorithm loseFocus/gainFocus (SESS-03)` - `d7f1545`
3. **Task 1c:** `feat(02-06): add setSessionBytesHandler to channel.ts (SESS-03)` - `19e840b`
4. **Task 1d:** `feat(02-06): add liveSessions and archiveSession to session-store (SESS-03/SESS-06)` - `e00941c`
5. **Task 1e:** `feat(02-06): wire TerminalView to the focus algorithm (SESS-03)` - `fc74fb9`
6. **Task 2:** `feat(02-06): add Archive/Delete lifecycle affordances to SessionRow (SESS-06)` - `ac39b72`

**Plan metadata:** commit pendente (docs: complete plan) — feito na etapa seguinte deste executor.

_Nota: Task 1 (`tdd="true"`) gerou 2 commits extras (channel.ts, session-store.ts) além do par RED/GREEN canônico porque o algoritmo puro (focus-algorithm.ts) precisou de wiring em módulos adjacentes para ficar utilizável fim-a-fim — cada wiring foi commitado separadamente para manter os commits pequenos e revisáveis, não porque o RED/GREEN do teste principal precisasse deles._

## Files Created/Modified

- `src/components/terminal/focus-algorithm.ts` - loseFocus/gainFocus puros (Pattern 3)
- `src/components/terminal/focus-algorithm.test.ts` - 12 testes (ordem exata, round-trip, webgl único)
- `src/components/terminal/TerminalView.tsx` - integra o algoritmo de foco; nunca mais mata o PTY só por troca de sessão
- `src/stores/session-store.ts` - `liveSessions` (Map de módulo) + `archiveSession`
- `src/stores/session-store.test.ts` - testes de liveSessions/archiveSession
- `src/pty/channel.ts` - `setSessionBytesHandler` (redirecionamento sem recriar Channel)
- `src/pty/channel.test.ts` - testes de redirecionamento + limpeza no killSession
- `src/components/session/ConfirmDialog.tsx` - modal genérico reusável
- `src/components/session/ConfirmDialog.test.tsx` - 6 testes
- `src/components/session/SessionRow.tsx` - botões Archive/Trash2 + wiring do ConfirmDialog
- `src/components/session/SessionRow.test.tsx` - testes de Archive/Delete/Cancel/stopPropagation
- `src/components/session/SessionSidebar.test.tsx` - corrigido seletor `[title]` amplo demais (pré-existente, quebrado pelos novos botões)
- `src/locales/pt-BR/session.json` / `src/locales/en/session.json` - `actions.archive/delete`, `confirmDelete.*`
- `src/styles/theme.css` - `.session-row`/`.session-row__actions`/`.session-row__action--delete` (hover CSS)

## Decisions Made

- `liveSessions` implementado como `Map` de módulo, fora do shape reativo gerenciado por zustand/immer — descoberto experimentalmente que o `autoFreeze` do immer congela recursivamente TODO o estado produzido a cada `set()` (mesmo campos nunca tocados por aquele produtor), o que tornaria qualquer `Map` alcançável a partir do estado permanentemente congelado (`Object.freeze` é irreversível) assim que qualquer outra ação da store chamasse `set()` uma única vez. Confirmado por um teste que falhou com "[Immer] This object has been frozen" antes da correção
- `spawnSession` chamado só uma vez por sessão (`!hasLiveSession`), com toda troca de foco subsequente redirecionando via `setSessionBytesHandler` — isso resolve de graça o double-invoke do StrictMode do React 19 sem precisar da estratégia anterior de "matar a sessão no cleanup", que agora contradiria SESS-03
- Archive/Delete restritos a rows não-históricas (`variant !== "historical"`) — uma sessão histórica não tem `PtySession` viva a matar, e "escondê-la" da lista reapareceria no próximo `discoverSessions` já que o `.jsonl` correspondente continua intacto no disco

## Deviations from Plan

### Auto-fixed Issues

Nenhuma das mudanças abaixo é um "auto-fix" de bug per as Regras 1-3 — são adaptações de design necessárias para o algoritmo funcionar corretamente, documentadas acima em `## Decisions Made` (liveSessions fora do shape immer, spawnSession único por sessão).

### Documented Simplifications (registradas em WINDOWS.md)

**1. Fade+collapse de 150ms ao Arquivar não implementado**
- **Por quê:** `02-UI-SPEC.md` pede uma animação transitória de saída da row; implementá-la exigiria um estado de "remoção pendente" em `SessionSidebar.tsx` (para não desmontar a row do DOM no mesmo tick em que `sessions[]` perde o item), mas `SessionSidebar.tsx` não está no `files_modified` deste plano
- **Impacto:** A remoção funciona corretamente (kill de árvore + remoção da lista), só sem a transição visual suave
- **Registrado:** WINDOWS.md #3

**2. Resize inicial pode não ser reaplicado após o double-invoke do StrictMode (dev only)**
- **Por quê:** No StrictMode (dev), o remount "sobrevivente" não registra sua própria `.then()` de retry de resize (só o primeiro mount o faz, e é suprimido pela flag `disposed`) — o terminal fica com o tamanho padrão do `portable-pty` até o próximo evento de resize real
- **Impacto:** Cosmético, só em `npm run dev`; builds de produção montam uma única vez e não são afetados
- **Registrado:** WINDOWS.md #4

---

**Total deviations:** 0 auto-fixes de bug; 2 simplificações documentadas (ambas fora do escopo de arquivos do plano ou cosméticas/dev-only)
**Impact on plan:** Nenhuma afeta os `must_haves.truths`/`acceptance_criteria` do plano — ambas são polimento visual/dev-mode, não correção funcional.

## Issues Encountered

- **Immer autoFreeze quebrando mutação direta de `liveSessions`:** a primeira implementação colocou `liveSessions: Map<...>` como campo comum do estado retornado por `create<SessionStoreState>()(immer(...))`. Testes revelaram `[Immer] This object has been frozen and should not be mutated` assim que qualquer OUTRA ação da store (ex.: `killSession`) chamava `set()` uma única vez — o `autoFreeze` padrão do immer congela recursivamente todo o estado produzido, inclusive campos não tocados por aquele produtor específico, e `Object.freeze` é irreversível. Resolvido movendo `liveSessions` para um `Map` de módulo genuinamente fora do shape gerenciado por `create()`, com `getOrCreateLiveSession`/`hasLiveSession`/`clearLiveSession` como pontos de acesso — o que por acaso também é exatamente o design que a doc do plano pedia ("não um `set()` por chunk")

## Next Phase Readiness

- SESS-03 e SESS-06 (UI) completos e testados via unit tests automatizados; os dois itens `verification: backstop` do PLAN (replay real sem lacunas ao longo do tempo, e zero processos remanescentes no SO real) exigem UAT manual explícito antes de `/gsd-verify-work` — nenhum dos dois foi verificado com processos reais nesta execução (ambiente sem GUI/terminal interativo disponível para o executor)
- Fase 2 (sessão viva) está com todos os 6 planos executados; próximo passo natural é `/gsd-verify-work` da fase inteira, cobrindo os backstops acumulados (incluindo os já sinalizados em WINDOWS.md #1/#2 de planos anteriores)

---
*Phase: 02-sess-o-viva*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 16 files claimed as created/modified were verified present on disk; all 6 task commit hashes (5356d74, d7f1545, 19e840b, e00941c, fc74fb9, ac39b72) were verified present in `git log --oneline --all`.
