# Fixtures de `phase-scan.ts`

Árvore sintética de diretórios de fase que cobre os estados possíveis da
regra de `disk_status` (ver `01-RESEARCH.md` → Pattern 1 e `src/planning/status.ts`).
`phase-scan.test.ts` lê estes diretórios diretamente do disco (mockando
`@tauri-apps/plugin-fs` para delegar a `node:fs/promises`), garantindo que os
testes exercitem uma árvore de arquivos real, não apenas dados fabricados em
memória.

Não existe um diretório fixture para o caso "fase sem diretório correspondente
em `.planning/phases/`" — esse caso é, por definição, a ausência do diretório,
e é coberto em `roadmap.test.ts`/testes de `board-store` (Plano 03, Task 3),
que comparam as fases do `ROADMAP.md` contra os diretórios realmente
encontrados no disco.

| Diretório | O que cobre | `disk_status` esperado |
|---|---|---|
| `10-apenas-contexto/` | Só `10-CONTEXT.md`, nenhum `RESEARCH.md`, nenhum `PLAN.md` | `discussed` |
| `11-contexto-mais-pesquisa/` | `11-CONTEXT.md` + `11-RESEARCH.md`, nenhum `PLAN.md` | `researched` (research tem precedência sobre context) |
| `12-planos-sem-summary/` | 2 `PLAN.md`, 0 `SUMMARY.md` | `planned` |
| `13-summary-parcial/` | 3 `PLAN.md`, 1 `SUMMARY.md` | `partial` (execução em andamento, nem todos os planos concluídos) |
| `14-executada-sem-verificacao/` | 2 `PLAN.md`, 2 `SUMMARY.md` (implementação completa), `VERIFICATION.md` com `status: gaps_found` | `executed` — **nunca** `complete` (D-05) |
| `15-verificada/` | 2 `PLAN.md`, 2 `SUMMARY.md`, `VERIFICATION.md` com `status: passed` | `complete` -> badge `verified` -> coluna "Concluída" |
| `16-contexto-com-ruido/` | `CONTEXT.md` + `RESEARCH.md` + `UI-SPEC.md` + `VALIDATION.md` + `DISCUSSION-LOG.md` + exatamente 1 `PLAN.md` | Trava que `planCount === 1` mesmo com 5 arquivos "parecidos" com plano/summary no mesmo diretório (nenhum deles casa o padrão `NN-NN-PLAN.md`/`NN-NN-SUMMARY.md`) |

Cada diretório segue a convenção real do gsd-core (`<numero>-<slug>/<numero>-{CONTEXT,RESEARCH,VERIFICATION}.md` e `<numero>-<NN>-{PLAN,SUMMARY}.md`), para que `parsePhaseDirName`/`scanPhaseDir` sejam exercitados exatamente como seriam contra um projeto real.
