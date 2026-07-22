# Pitfalls Research

**Domain:** App desktop de orquestração (Electron/Tauri) para CLI interativa + file watching + parsing de artefatos markdown como API — caso: GSD Cards (Claude CLI + gsd-core)
**Researched:** 2026-07-22
**Confidence:** MEDIUM (fontes: issue trackers oficiais — microsoft/node-pty, electron/electron, anthropics/claude-code, paulmillr/chokidar, nodejs/node — cruzadas via busca web; sem acesso a Context7/Exa/Tavily pagos neste projeto)

## Critical Pitfalls

### Pitfall 1: Processos zombie do PTY/Claude CLI sobrevivem ao fechamento do app

**What goes wrong:**
Fechar a janela, a sessão ou o app inteiro não mata de fato a árvore de processos do terminal embutido. O processo `claude.exe`/shell continua rodando em background, acumulando a cada reabertura, consumindo RAM/CPU e — no caso específico do Claude CLI — múltiplos processos concorrentes acessando o mesmo diretório de sessão (`~/.claude/projects/...`) podem corromper o índice de mensagens JSONL ("No message found with message.uuid"), um bug documentado no próprio `anthropics/claude-code` (#54130) que atinge exatamente apps desktop que envolvem o Claude Code. Há também relato de vazamento da variável `ELECTRON_RUN_AS_NODE=1` do processo pai para os filhos, quebrando spawns aninhados de Electron (#34836), e de processos renderer órfãos no Windows mesmo após o processo pai "encerrar com sucesso" (#15423).

**Why it happens:**
O padrão comum é dar `spawn(..., { detached: true })` e `unref()` no processo do PTY para ele sobreviver a navegações internas do app — mas o código de "fechar sessão"/"sair do app" só fecha o socket/pipe de I/O ou destrói a janela, nunca envia SIGKILL/SIGTERM recursivo para toda a árvore de processos (PTY → shell → claude.exe → subprocessos que o Claude spawna, como git). No Windows isso é agravado porque não existe SIGKILL nativo — é preciso usar `taskkill /T /F` ou `tree-kill` para matar a árvore inteira.

**How to avoid:**
- Rastrear PID de cada PTY spawnado em um registro central do processo principal (main process), nunca depender só de referência de objeto.
- No shutdown do app e no fechamento individual de sessão, matar a árvore inteira (`taskkill /pid <pid> /T /F` no Windows; `process.kill(-pid, 'SIGKILL')` em grupo de processo no Unix), não apenas o processo raiz.
- Registrar handlers para `before-quit`, `will-quit` e `SIGINT/SIGTERM` do próprio Electron para garantir cleanup mesmo em crash controlado.
- Nunca herdar `ELECTRON_RUN_AS_NODE` (ou outras env vars específicas do Electron) para o processo do PTY — sanitizar `env` explicitamente ao spawnar.
- Detectar e reportar (não silenciar) processos órfãos remanescentes de uma sessão anterior ao reabrir o app (varrer PIDs salvos e verificar se ainda apontam para o processo esperado antes de reusar).

**Warning signs:**
Task Manager acumulando `node.exe`/`claude.exe`/`conhost.exe` extras a cada ciclo abrir→fechar o app; erros "No message found with message.uuid" nos logs do Claude CLI; app não consegue reiniciar porque uma porta/lock file antigo ainda está detido.

**Phase to address:**
Fase de fundação do gerenciador de sessões/PTY (antes de qualquer terminal "persistir em background" ser uma feature exposta ao usuário) — é a base de tudo que depende de múltiplos terminais vivos.

---

### Pitfall 2: "Sessão persistida" é uma ilusão de UX se não for honesta sobre o que realmente sobrevive

**What goes wrong:**
`claude --resume` restaura o **histórico da conversa** (lido do `.jsonl` em `~/.claude/projects/<dir-hash>/`), não o processo PTY em si. Ao reabrir o app, não existe "o mesmo terminal retomando de onde parou" — existe um novo processo PTY, um novo `claude` invocado com `--resume <uuid>`, que relê o histórico do disco e imprime um resumo/replay. Se a UI apresentar isso como "sua sessão continuou rodando", o usuário vai eventualmente perceber a mentira (ex.: um comando de longa duração que estava rodando quando o app fechou simplesmente sumiu, sem erro, sem log do que aconteceu).

**Why it happens:**
O modelo mental "sessão = processo vivo" (como uma aba de navegador com estado) é o que a sidebar do app sugere visualmente, mas a mecânica real é "sessão = arquivo de histórico no disco + processo efêmero". É fácil programar a ilusão (reabrir com `--resume`) sem programar a honestidade (avisar que o processo anterior morreu e nada que estava "em andamento" continuou).

**How to avoid:**
- Modelar sessão desde o design como duas entidades distintas: **histórico de conversa** (persistente, pertence ao Claude CLI) e **processo de terminal** (efêmero, pertence ao app). O board/sidebar deve deixar isso explícito.
- Ao restaurar uma sessão após reabrir o app, marcar visualmente que é uma retomada (ex.: "sessão restaurada — retomando histórico") e não fingir continuidade de processo.
- Se o app fechar com uma sessão em meio a uma tarefa longa (ex.: `/gsd-execute-phase` rodando), deixar isso registrado no estado da sessão ("interrompida abruptamente enquanto executava X") em vez de simplesmente sumir com a saída.
- Nunca prometer que trabalho "em andamento" sobrevive ao fechamento do app sem um mecanismo real de continuidade (isso pertenceria ao gsd-core/Claude CLI, não ao app).

**Warning signs:**
Usuário relata "minha tarefa desapareceu" ou "o Claude parou de responder e não sei se ainda está rodando"; testes manuais de fechar o app com um comando `/gsd-execute-phase` ativo e reabrir revelam comportamento inconsistente.

**Phase to address:**
Fase de sessões/restauração — deve ser tratada junto com a definição do modelo de dados de "sessão" (persistente vs. efêmero), não como polimento posterior.

---

### Pitfall 3: node-pty native/ConPTY — rebuild hell e comportamento inconsistente no Windows

**What goes wrong:**
`node-pty` é um módulo nativo (addon C++) que precisa ser recompilado contra a ABI exata da versão do Electron usada (não do Node.js do sistema) — divergências causam erros de `NODE_MODULE_VERSION mismatch` ou "Could not detect abi for version X and runtime electron", frequentemente a cada bump de versão do Electron. Além disso, `node-pty` não pode viver dentro do ASAR (precisa ser `asarUnpack`ado), o que é fácil de esquecer ao empacotar o instalador — funciona em dev, quebra no build de produção. No Windows especificamente, o backend ConPTY tem bugs conhecidos e documentados de flow control: sinais PAUSE/RESUME não são propagados corretamente ao pseudo-terminal quando `handleFlowControl` está ativado, o que pode travar a saída do terminal sob certas condições de output rápido.

**Why it happens:**
Electron empacota sua própria versão do V8/Node, diferente do Node.js instalado no sistema do desenvolvedor; qualquer módulo nativo precisa ser recompilado especificamente para essa combinação. É um problema estrutural do ecossistema Electron + addons nativos, agravado pelo fato de ConPTY ser uma API relativamente jovem (Windows 10 1809+) com comportamento ainda não 100% uniforme entre versões do Windows.

**How to avoid:**
- Usar `@electron/rebuild` (ou `electron-builder`'s `node-gyp-rebuild` automático) no pipeline de build/CI, travado à versão exata do Electron do `package.json` — nunca assumir que "funcionou local" significa "vai funcionar empacotado".
- Configurar `asarUnpack: ["**/node_modules/node-pty/**"]` (ou equivalente) explicitamente na config do empacotador desde o primeiro build de instalador, com teste automatizado que abre um terminal no binário empacotado (não só em `electron .`).
- Não habilitar `handleFlowControl` a menos que haja uma necessidade concreta comprovada; se precisar, testar explicitamente cenários de output em rajada (ex.: `git log` grande, build verboso) no Windows antes de confiar nele.
- Fixar a versão do `node-pty` e do Electron juntas (lockfile + CI matrix), e testar em Windows real (não só WSL) a cada bump de versão do Electron.

**Warning signs:**
Erro só aparece no instalador empacotado, nunca em dev (`asarUnpack` esquecido); terminal "trava" silenciosamente após output muito rápido no Windows; erro de ABI aparece após `npm install` de dependência não relacionada que forçou reinstall.

**Phase to address:**
Fase de fundação do terminal embutido — deve incluir, desde o início, um build de instalador real (não apenas dev) como critério de "pronto".

---

### Pitfall 4: Enchente de eventos do file watcher durante operações do próprio GSD (auto-inflicted event storm)

**What goes wrong:**
O GSD escreve/reescreve múltiplos arquivos markdown em sequência rápida durante um único comando (`/gsd-execute-phase` grava PLAN.md, depois vários arquivos de código, depois SUMMARY.md, depois faz `git commit`). Um watcher ingênuo (`chokidar` ou `fs.watch` recursivo apontando para a raiz do projeto) dispara uma rajada de eventos por essa sequência — e cada `git commit`/`git add` internamente também toca arquivos dentro de `.git/` (index, objects, logs) se o watcher não estiver escopado. Isso causa: (a) o board re-renderizando dezenas de vezes por segundo, piscando; (b) leitura de arquivos **no meio da escrita** (parse de um `PLAN.md` truncado, gerando erro ou card quebrado); (c) em repositórios grandes, CPU/memória do watcher crescendo com o número total de arquivos observados, não com a taxa de mudança.

**Why it happens:**
`fs.watch`/`chokidar` reportam eventos por escrita bruta, não por "unidade lógica de mudança" — não existe transação atômica visível para quem observa de fora. Watchers recursivos sobre diretórios grandes (especialmente incluindo `.git/` e `node_modules/` do próprio projeto do usuário, se for um repo de código) escalam mal.

**How to avoid:**
- Escopar o watcher estritamente a `.planning/**` (nunca a raiz do repositório inteiro), e ignorar explicitamente `.git/`, `node_modules/`, `dist/`, etc.
- Debounce/coalescing: agrupar rajadas de eventos numa janela curta (150–300ms) antes de re-parsear e re-renderizar, em vez de reagir a cada evento individual.
- Ler arquivos com uma estratégia resiliente a leitura parcial: tentar parse, se falhar (YAML/markdown malformado, JSON truncado) manter o card no último estado válido conhecido e tentar de novo no próximo evento estável — nunca quebrar a UI por causa de um "flash" de escrita incompleta.
- Preferir detectar estabilidade do arquivo (ex.: tamanho/mtime parado por N ms) antes de considerar a escrita "concluída", em vez de reagir ao primeiro evento de change.
- Ao observar múltiplos projetos simultaneamente (app multi-projeto), criar/destruir watchers por projeto sob demanda (só o projeto ativo/visível precisa de watch "quente"; os demais podem usar polling leve ou re-scan ao focar).

**Warning signs:**
Board "piscando" ou mostrando estados intermediários estranhos durante execução de fases; CPU do processo de watch subindo com o tamanho do repositório do usuário, não com a atividade real; cards temporariamente quebrados logo após um commit do GSD.

**Phase to address:**
Fase do motor de sincronização board↔`.planning/` (a "fonte da verdade em tempo real") — é o requisito central do projeto ("se tudo mais falhar, isso tem que funcionar"), então merece tratamento robusto já na primeira versão, não como otimização tardia.

---

### Pitfall 5: Parser de markdown do GSD como API implícita — quebra silenciosa quando o formato evolui

**What goes wrong:**
O board deriva cards/hierarquia/status fazendo parse de `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `PLAN.md`, etc. — arquivos markdown feitos para humanos lerem, tratados como se fossem uma API estruturada. Quando o `gsd-core` (que evolui na branch `next`, fora do controle deste app) muda uma convenção de formatação (um heading, uma tabela, uma marcação de status), o parser pode falhar de duas formas ruins: (a) lança exceção e quebra a tela inteira; ou (b) pior — não lança exceção, mas interpreta errado silenciosamente, mostrando um board **plausível mas incorreto** (fase marcada como "done" quando não está, card sumindo, ordem errada) — e o usuário só descobre quando a divergência já causou confusão.
Note: markdown como formato de dados é estruturalmente frágil para parsing programático (ambiguidades de gramática são uma fonte conhecida de bugs mesmo em parsers maduros como `marked`/`markdown-it`) — isso é ainda mais verdadeiro para um dialeto específico de um projeto (GSD) que não tem gramática formal nem versionamento semântico do formato.

**Why it happens:**
Não existe contrato formal entre gsd-core e o app — o "schema" é implícito na forma como os templates do gsd-core são escritos hoje. Qualquer refactor de wording, reordenação de seção ou mudança de convenção de status quebra silenciosamente premissas do parser.

**How to avoid:**
- Parsing defensivo por padrão: cada extração (status de fase, contagem de tasks, etc.) deve ter um fallback explícito para "desconhecido/não reconhecido" em vez de assumir um valor default enganoso (nunca inferir "done" por ausência de sinal — o padrão seguro é "não sei, mostra raw").
- Fixar (pin) a versão/branch do gsd-core que o parser suporta oficialmente e checar isso ativamente (ex.: ler config.json ou uma marca de versão, se existir) — alertar visualmente se o projeto aberto usa uma versão de artefatos não reconhecida, em vez de tentar adivinhar.
- Degradação graciosa: quando o parser não reconhece uma estrutura, cair para exibir o arquivo raw (ou uma versão simplificada/genérica do card) em vez de quebrar a tela ou omitir a fase inteira.
- Testes de regressão do parser rodando contra uma amostra real de artefatos gsd-core (fixtures versionadas), rodados em CI, para pegar quebras assim que o gsd-core mudar — não esperar o usuário reportar.
- Tratar o parser como uma camada isolada e testável (parse puro: string → modelo de dados), separada do código de renderização, para poder testá-lo exaustivamente sem precisar do Electron.

**Warning signs:**
Board mostra fase como concluída mas o diretório da fase não tem `SUMMARY.md`; contagens de tasks/planos não batem com o que está no disco; usuários da comunidade (rodando gsd-core em versão diferente da testada) reportam boards "errados" sem erro visível.

**Phase to address:**
Fase de definição do parser/modelo de dados do board — deve incluir desde o início testes contra fixtures reais e uma estratégia explícita de fallback, antes de qualquer feature de "cards interativos" ser construída em cima dele.

---

### Pitfall 6: Injetar comandos no CLI interativo sem saber se ele está ocioso, ocupado ou esperando permissão

**What goes wrong:**
Um card do board dispara `/gsd-plan-phase` (por exemplo) escrevendo no stdin do PTY onde o `claude` está rodando. Se o Claude estiver no meio de uma resposta, aguardando confirmação de permissão (ex.: "Allow this command? y/n"), ou já processando outro prompt, a injeção pode: colar o comando dentro do texto de uma pergunta ativa, ser interpretada como resposta a um prompt de permissão sem o usuário perceber, ou simplesmente ser ignorada/perdida porque o processo não estava realmente pronto para receber input de linha.

**Why it happens:**
Um PTY não expõe um "estado semântico" (ocioso vs. ocupado vs. aguardando input) — é só um fluxo de bytes de terminal (sequências ANSI). Sem uma camada de detecção, o app não tem como saber com segurança se é seguro enviar um comando.

**How to avoid:**
- Detectar estabilidade da tela (nenhuma escrita nova por uma janela curta, ex. 300–500ms) como sinal de "provavelmente ocioso", em vez de assumir estado por temporização fixa arbitrária.
- Reconhecer o prompt idle conhecido do Claude CLI (padrão de prompt na última linha da tela) via regex/parse do buffer renderizado do xterm, para diferenciar "aguardando comando" de "aguardando confirmação y/n" de "gerando resposta".
- Ao disparar um comando `/gsd-*` a partir de um card, sempre focar/exibir o terminal de destino e mostrar visualmente que o comando foi enviado (eco), nunca injetar "silenciosamente" em background sem o usuário ver o que aconteceu.
- Usar bracketed paste mode ao colar comandos multi-linha (evita autoindentação/autocomplete do shell interpretando cada caractere como digitação).
- Se detectar que a sessão está claramente ocupada (saída ativa nos últimos ms), enfileirar a ação e avisar o usuário ("comando será enviado quando a sessão estiver livre") em vez de forçar o envio.

**Warning signs:**
Comandos aparecendo colados no meio de outro texto na tela; confirmações de permissão sendo respondidas errado; usuário reporta "cliquei no botão e nada aconteceu" (comando engolido silenciosamente).

**Phase to address:**
Fase de "cards interativos disparam comando no terminal" — é o requisito mais arriscado tecnicamente do roadmap; deve ter uma fase própria dedicada à camada de detecção de estado do PTY, não ser tratado como trivial "escrever no stdin".

---

## Technical Debt Patterns

Atalhos que parecem razoáveis mas criam problemas de longo prazo.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Watcher recursivo na raiz do repo (não escopado a `.planning/`) | Menos código no dia 1 | Event storms, CPU alta em repos grandes de código, parse de arquivos irrelevantes | Nunca em produção; talvez em protótipo local descartável |
| Assumir prompt sempre idle após N ms fixos (sem checar conteúdo da tela) | Simples de implementar | Injeção de comando no momento errado, comandos perdidos, prompts de permissão respondidos errado | Só em protótipo interno sem usuários reais |
| Parser de markdown sem fallback (assume formato atual do gsd-core para sempre) | Entrega mais rápida no MVP | Board quebra silenciosamente a cada mudança de formato upstream; viola a promessa central do projeto ("espelho confiável") | Nunca — é o core value do produto |
| `spawn(detached:true)` sem tracking central de PID/cleanup no shutdown | Terminal sobrevive a navegação sem esforço extra | Zombie processes acumulando, corrupção de sessão do Claude CLI | Nunca em build distribuído; aceitável só durante spike/dev local |
| Empacotar sem `asarUnpack` para `node-pty` e sem testar o instalador | Build de dev funciona igual | App empacotado quebra o terminal para todo usuário final (bug crítico só descoberto pós-release) | Nunca |

## Integration Gotchas

Erros comuns ao integrar com serviços/ferramentas externas.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| Claude CLI (`claude --resume`) | Tratar resume como continuidade de processo real | Modelar como "novo processo relendo histórico"; comunicar isso na UI |
| gsd-core (`.planning/` markdown) | Tratar os arquivos como schema estável/versionado | Fixar branch/versão suportada, validar contra fixtures, degradar graciosamente |
| Git (operações do próprio GSD) | Watcher reagindo a cada arquivo tocado por `git commit`/`git add` | Ignorar `.git/` no watcher; observar só os artefatos finais relevantes |
| node-pty / ConPTY (Windows) | Assumir que funciona igual entre versões de Electron sem rebuild | Pipeline de rebuild automatizado + teste do instalador empacotado a cada bump |
| Electron auto-update (open source, sem certificado pago) | Assumir que `autoUpdater` funciona "de graça" como em apps comerciais | Aceitar SmartScreen/warnings sem assinatura, ou usar assinatura barata (ex. Azure Trusted Signing) + documentar isso claramente para a comunidade |

## Performance Traps

Padrões que funcionam em pequena escala mas falham conforme o uso cresce.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Scrollback ilimitado por terminal xterm.js | RAM crescendo com o tempo de uso de cada sessão | Limitar scrollback por sessão (ex. 2000–5000 linhas); liberar buffer de sessões fechadas | ~5–10 terminais persistentes com scrollback alto simultâneo |
| Manter renderer DOM/WebGL de xterm.js ativo para terminais fora de tela | Uso de CPU/GPU alto com várias sessões em background | Pausar/desmontar renderer de terminais não visíveis; manter só o buffer lógico | A partir de poucas sessões simultâneas (3–5) já é perceptível em hardware modesto |
| Watcher recursivo sem escopo em projeto multi-projeto (vários `.planning/` abertos) | CPU do processo de watch cresce com número de projetos "conhecidos", não só o ativo | Watch ativo só no projeto em foco; demais projetos usam re-scan sob demanda | A partir de ~5-10 projetos listados na tela principal |
| Re-parse completo de todos os artefatos a cada evento de watcher | Latência de atualização do board cresce com tamanho do projeto | Parse incremental por arquivo tocado + cache do modelo já parseado | Projetos com muitas fases/planos acumulados (dezenas de arquivos) |

## Security Mistakes

Questões de segurança específicas do domínio, além do básico de segurança web.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `nodeIntegration: true` / `contextIsolation: false` para "facilitar" acesso a filesystem/PTY do renderer | Renderer (que pode carregar conteúdo/markdown de projetos abertos pelo usuário) ganha acesso direto a Node.js — RCE se algum conteúdo malicioso escapar para o DOM | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; expor só uma API mínima via `contextBridge` (abrir projeto, criar sessão, ler artefato — nunca `exec` genérico) |
| Renderizar markdown de `.planning/` (potencialmente vindo de um repo compartilhado/clonado) sem sanitização | Markdown/HTML malicioso embutido em um repositório clonado pode injetar script na UI do app | Sanitizar sempre o HTML resultante do parser de markdown antes de renderizar, mesmo confiando na "própria" fonte (defesa em profundidade) |
| Injeção de comando no PTY sem escapar entrada do usuário (ex. paths com espaços/aspas vindos de nomes de projeto) | Comando malformado ou, em casos extremos, injeção de comando shell não intencional | Tratar toda string enviada ao PTY como dado a ser corretamente escapado/quotado para o shell alvo (cmd.exe vs PowerShell vs bash têm regras de quoting diferentes) |
| Distribuir instalador sem assinatura e sem checksum público | Usuário não tem como verificar integridade do binário baixado; abre superfície para builds falsificados em releases de terceiros | Publicar checksums (SHA256) nas releases do GitHub mesmo sem assinatura paga; documentar claramente que builds não são assinados |

## UX Pitfalls

Erros comuns de experiência do usuário neste domínio.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Apresentar "sessão restaurada" de forma idêntica a "sessão nunca fechada" | Usuário perde confiança quando percebe que algo "sumiu" no meio | Indicar visualmente sempre que uma sessão foi restaurada de histórico (não continuidade de processo) |
| Board "piscando"/re-renderizando a cada escrita intermediária do GSD | Sensação de instabilidade, dificuldade de ler o estado real | Debounce de atualização + só re-renderizar após estabilidade do conjunto de arquivos tocados |
| Botão de ação de card dispara comando sem feedback visível no terminal | Usuário não sabe se o clique funcionou | Sempre trazer o terminal de destino ao foco (ou destacar) e ecoar o comando enviado |
| Falhas de parsing do markdown quebrando a tela inteira do board | Usuário perde visão de todos os projetos por causa de um arquivo malformado | Isolar falha por card/fase; nunca deixar um artefato malformado derrubar a tela inteira |
| Fingir que o app funciona igual sem Claude CLI/gsd-core instalados | Erros confusos de "comando não encontrado" no terminal, sem explicação | Detectar dependências ausentes na abertura do app/projeto e comunicar claramente o que falta instalar |

## "Looks Done But Isn't" Checklist

Coisas que parecem completas mas estão faltando peças críticas.

- [ ] **Fechar terminal/sessão:** Parece "funcionar" (janela some) — verificar se o processo (e toda a sua árvore de filhos) realmente morreu no Task Manager/`ps`, não só a UI.
- [ ] **Terminal embutido no instalador empacotado:** Funciona em `electron .` — verificar explicitamente no build de instalador final (ASAR unpack, rebuild de módulo nativo).
- [ ] **Board "em tempo real":** Funciona bem com poucos arquivos de teste — verificar contra um projeto GSD real com múltiplas fases, planos e um `git commit` do GSD acontecendo durante o teste.
- [ ] **Restaurar sessões ao reabrir o app:** Funciona no caminho feliz (fechar limpo) — verificar restauração após crash do app / kill forçado / máquina desligada no meio de uma tarefa longa.
- [ ] **Múltiplos projetos abertos simultaneamente:** Funciona com 1-2 projetos de teste — verificar uso de CPU/memória com 10+ projetos listados e watchers ativos.
- [ ] **i18n pt-BR/en:** Strings principais traduzidas — verificar se toda saída bruta do terminal/CLI (que não é traduzível) está claramente diferenciada da UI traduzida, e se não há strings hardcoded coladas em templates de comando.

## Recovery Strategies

Quando os pitfalls ocorrem apesar da prevenção, como se recuperar.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Zombie processes acumulados | LOW | Botão "Encerrar todos os processos órfãos" no app (varre PIDs registrados, mata árvore); documentar `taskkill`/`kill` manual como fallback |
| Board mostrando estado incorreto por bug de parser | LOW | Botão "recarregar/reparsear projeto" manual + fallback para exibir arquivo raw daquela fase |
| Watcher travado/CPU alta após operação git grande | MEDIUM | Reiniciar watcher do projeto (destruir e recriar instância) sem precisar reiniciar o app inteiro |
| Terminal "travado" por bug de flow control do ConPTY | MEDIUM | Opção de "reiniciar terminal desta sessão" (mata e recria o PTY, mantendo o histórico da conversa via `--resume`) |
| Instalador sem assinatura bloqueado por SmartScreen | HIGH (não corrigível só com código) | Documentar claramente o passo "Mais informações → Executar assim mesmo"; considerar assinatura barata (Azure Trusted Signing) em versão futura |

## Pitfall-to-Phase Mapping

Como as fases do roadmap devem endereçar esses pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|---------------|
| Zombie processes / cleanup de PTY | Fase de fundação de sessões/terminal (PTY manager) | Teste manual: abrir N sessões, fechar app, checar processos remanescentes no SO |
| Ilusão de sessão restaurada | Fase de sessões/restauração (`claude --resume`) | UAT: fechar app com tarefa em andamento, reabrir, confirmar que UI comunica corretamente o que foi restaurado |
| node-pty rebuild / ConPTY no Windows | Fase de fundação do terminal embutido | Build de instalador real no CI + smoke test de terminal funcionando no binário empacotado |
| Event storm do file watcher | Fase do motor de sincronização board↔`.planning/` | Teste com projeto real rodando `/gsd-execute-phase` completo observando estabilidade do board |
| Parser de markdown frágil | Fase de definição do parser/modelo de dados do board | Suite de fixtures versionadas do gsd-core + teste de degradação graciosa com artefato malformado |
| Injeção de comando sem detecção de estado do PTY | Fase de "cards interativos disparam comando" | UAT: disparar comando com Claude ocupado/aguardando permissão e confirmar comportamento seguro |
| Segurança do Electron (contextIsolation etc.) | Fase de fundação da shell do app (setup inicial do Electron) | Checklist de `electronjs.org/docs/tutorial/security` auditado antes do primeiro release público |
| Distribuição sem assinatura / auto-update OSS | Fase de empacotamento/distribuição (v1+) | Documentação clara para o usuário + checksums publicados nas releases |

## Sources

- [microsoft/node-pty README — ConPTY integration](https://github.com/microsoft/node-pty/blob/main/README.md)
- [microsoft/node-pty #457 — Non-ConPTY PTYs fail on node 14](https://github.com/microsoft/node-pty/issues/457)
- [electron/rebuild #845, #1073 — ABI detection failures](https://github.com/electron/rebuild/issues/1073)
- [Electron docs — Using Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [anthropics/claude-code #54130 — zombie subprocesses corrompendo sessão](https://github.com/anthropics/claude-code/issues/54130)
- [anthropics/claude-code #15423 — renderer processes órfãos no Windows](https://github.com/anthropics/claude-code/issues/15423)
- [anthropics/claude-code #34836 — ELECTRON_RUN_AS_NODE vazando para filhos](https://github.com/anthropics/claude-code/issues/34836)
- [AndyMik90/Auto-Claude #1252 — processo cleanup quebrado no Windows](https://github.com/AndyMik90/Auto-Claude/issues/1252)
- [xtermjs/xterm.js #791 — Buffer performance improvements](https://github.com/xtermjs/xterm.js/issues/791)
- [paulmillr/chokidar #922, #501, #447 — high CPU/memory em watch de diretórios grandes](https://github.com/paulmillr/chokidar/issues/922)
- [nodejs/node #3042 — fs.watch double change events](https://github.com/nodejs/node/issues/3042)
- [nodejs/node #61398 — fs.watch endless file events](https://github.com/nodejs/node/issues/61398)
- [nodejs/node #53903 — recursive fs.watch inconsistente em junctions no Windows](https://github.com/nodejs/node/issues/53903)
- [onesuper/tui-use — detecção de idle via estabilidade de tela de PTY](https://github.com/onesuper/tui-use)
- [Claude Code Docs — Manage sessions (`--resume`/`--continue`)](https://code.claude.com/docs/en/sessions)
- [Electron docs — Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron docs — Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [electron/update-electron-app #145 — auto-update sem builds assinados no Windows](https://github.com/electron/update-electron-app/issues/145)
- [Tauri vs Electron — bundle size/RAM (gethopp.app, pkgpulse.com)](https://www.gethopp.app/blog/tauri-vs-electron)
- [generalaction/emdash — ADE open-source similar em Electron orquestrando múltiplos CLIs de agente](https://github.com/generalaction/emdash)

---
*Pitfalls research for: app desktop de orquestração Claude CLI + gsd-core (GSD Cards)*
*Researched: 2026-07-22*
