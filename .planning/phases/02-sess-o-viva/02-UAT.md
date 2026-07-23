---
status: testing
phase: 02-sess-o-viva
source: [02-VERIFICATION.md]
started: 2026-07-23T18:45:00Z
updated: 2026-07-23T18:45:00Z
---

## Current Test

number: 1
name: Encerramento limpo da árvore de processos no Windows (SESS-06 — critério de fundação)
expected: |
  Abrir N sessões reais do `claude`, matar cada uma (botão Excluir) e depois fechar o app;
  no Gerenciador de Tarefas do Windows, zero processos remanescentes da árvore original
  (claude + subprocessos/netos) após cada kill individual e após o fechamento do app.
awaiting: user response

## Tests

### 1. Encerramento limpo da árvore de processos no Windows (SESS-06)
expected: Após Arquivar/Excluir cada sessão e após fechar o app inteiro, o Gerenciador de Tarefas (Windows) / `ps -ef` (Unix) mostra zero processos remanescentes da árvore original do `claude` (incluindo netos). O caminho `#[cfg(windows)]` (`win32job::Job::assign_process` + `limit_kill_on_job_close`) só roda numa máquina Windows real — o CI Linux só exercita o mecanismo genérico via `tree_kill_leaves_no_zombies` (passa).
result: [pending]

### 2. Links clicáveis abrem no navegador do SO (TERM-02)
expected: Com `npm run tauri dev`, criar uma sessão e fazer o `claude` imprimir uma URL http(s). A URL fica destacada como link e, ao clicar, abre no navegador padrão do SO (via `@tauri-apps/plugin-opener`). A validação de esquema (`isSafeUrl`) e o wiring estão code-verified; o comportamento real do navegador exige um SO real.
result: [pending]

### 3. Replay de sessão em background sem lacunas (SESS-03)
expected: Abrir 2+ sessões reais, iniciar algo de execução longa numa delas, trocar para outra sessão, esperar um tempo real, e voltar. O buffer restaurado mostra TODO o output produzido enquanto estava em background — sem lacunas nem duplicação (o PTY nunca parou). O algoritmo puro (`focus-algorithm.test.ts`) está 100% coberto; o processo real ao longo do tempo é o que precisa de UAT.
result: [pending]

### 4. Fidelidade do `claude` interativo real no terminal embutido (SESS-02, TERM-01)
expected: Digitar uma pergunta ao `claude` interativo, ver a resposta em streaming, copiar/colar texto, confirmar scrollback limitado a 5000 linhas. Interação fluida, sem truncagem/corrupção de multibyte; `copyOnSelect` copia a seleção automaticamente.
result: [pending]

### 5. Descoberta de sessões reais + estado tool-missing (SESS-01, PROJ-04)
expected: Abrir um projeto real com `.jsonl` existentes em `~/.claude/projects/<encoded>/` e confirmar a lista agrupada Ativas/Histórico ordenada; depois simular `claude` ausente do PATH e confirmar que o `ToolMissingState` substitui o corpo da sidebar sem o CTA "Nova sessão" (instrução de instalação, nunca auto-install).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

Overridden (não é item de UAT, registrado para contexto): o ícone de busca no chrome do terminal (TERM-03) foi descopado por decisão do usuário — Ctrl+F/Cmd+F satisfaz a busca funcionalmente. Ver 02-VERIFICATION.md (status: overridden).
