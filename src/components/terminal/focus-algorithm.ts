// Algoritmo puro de troca de foco entre sessões de terminal (SESS-03,
// `02-RESEARCH.md` Pattern 3, prescrito literalmente pelo `CLAUDE.md` ##
// Stack Patterns by Variant): perder foco dispõe o addon-webgl (contexto
// WebGL é um recurso finito do processo, limitado pelo Chromium) ANTES de
// qualquer outra coisa, serializa o estado visual via addon-serialize,
// dispõe a instância inteira do xterm.js (não há reattach oficial — só
// `dispose()`, definitivo) e redireciona os bytes recebidos do Channel do
// PTY para um buffer em memória — o processo PTY nunca para, só a UI que o
// exibe. Ganhar foco monta uma instância nova, restaura o snapshot + drena
// o buffer acumulado em ordem (sem lacuna nem duplicação), e só então
// carrega o addon-webgl — garantindo no máximo um contexto WebGL vivo por
// vez em todo o app.
//
// Funções puras deliberadamente desacopladas do DOM/xterm.js reais: operam
// sobre um contrato mínimo (`FocusTerminalHandle`/`DisposableAddon`/
// `SerializeAddonHandle`) que `Terminal`/`WebglAddon`/`SerializeAddon` reais
// satisfazem estruturalmente, mas que `focus-algorithm.test.ts` pode mockar
// sem instanciar xterm.js de verdade — mesmo padrão de `TerminalSearchBar`'s
// `SearchAddonHandle` (`02-RESEARCH.md` Assumptions Log A4).

/** Contrato mínimo de uma instância de terminal — `@xterm/xterm`'s `Terminal` o satisfaz estruturalmente. */
export interface FocusTerminalHandle {
  open(container: HTMLElement): void;
  write(data: string | Uint8Array): void;
  dispose(): void;
}

/** Contrato mínimo de um addon descartável (`WebglAddon`, `FitAddon`, etc.). */
export interface DisposableAddon {
  dispose(): void;
}

/** Contrato mínimo do `SerializeAddon` — só o método que o algoritmo usa. */
export interface SerializeAddonHandle {
  serialize(): string;
}

/**
 * Estado por sessão vivo em `session-store.liveSessions` — mutado
 * diretamente por `loseFocus`/`gainFocus`, nunca reconstruído por inteiro.
 * Mutações de alta frequência (bytes de background chegando enquanto a
 * sessão não está em foco) nunca passam por um `set()` reativo do zustand —
 * ver `session-store.ts::getOrCreateLiveSession` — para que uma rajada de
 * output do PTY numa sessão em background nunca dispare re-render.
 */
export interface LiveSessionState {
  /** Último snapshot de `serialize()` guardado ao perder foco; `null` antes da primeira vez que a sessão perde foco. */
  serializedSnapshot: string | null;
  /** Bytes recebidos enquanto nenhuma instância de terminal está montada — drenados em ordem ao ganhar foco, depois limpos. */
  backgroundBuffer: Uint8Array[];
  /** `true` só na sessão que tem o addon-webgl carregado agora — no máximo uma verdadeira em todo o app (limite de contextos WebGL do Chromium). */
  hasWebgl: boolean;
}

export function createLiveSessionState(): LiveSessionState {
  return { serializedSnapshot: null, backgroundBuffer: [], hasWebgl: false };
}

export interface LoseFocusParams {
  liveSession: LiveSessionState;
  terminal: FocusTerminalHandle;
  serializeAddon: SerializeAddonHandle;
  /** `null` quando a sessão nunca teve/já não tem webgl carregado — dispose é pulado, não é erro. */
  webglAddon: DisposableAddon | null;
  /** Redireciona o Channel do PTY: a partir de agora, bytes recebidos empilham no `backgroundBuffer` em vez de escrever num terminal que não existe mais. */
  redirectToBackground: (push: (bytes: Uint8Array) => void) => void;
}

/**
 * Algoritmo EXATO de perder foco (`02-RESEARCH.md` Pattern 3, "ao perder
 * foco", sessão A deixa de ser a ativa):
 * 1. dispose do webgl PRIMEIRO (recurso finito do processo)
 * 2. `serialize()` guarda o snapshot visual + scrollback
 * 3. dispose da instância inteira do terminal
 * 4. redireciona o onmessage do Channel para empilhar no `backgroundBuffer`
 *    — o processo PTY continua vivo e produzindo output.
 */
export function loseFocus(params: LoseFocusParams): void {
  const { liveSession, terminal, serializeAddon, webglAddon, redirectToBackground } = params;

  if (webglAddon) {
    webglAddon.dispose();
  }
  liveSession.hasWebgl = false;

  liveSession.serializedSnapshot = serializeAddon.serialize();

  terminal.dispose();

  redirectToBackground((bytes) => {
    liveSession.backgroundBuffer.push(bytes);
  });
}

export interface GainFocusResult<T extends FocusTerminalHandle> {
  terminal: T;
  webglAddon: DisposableAddon;
}

export interface GainFocusParams<T extends FocusTerminalHandle> {
  liveSession: LiveSessionState;
  container: HTMLElement;
  /** Constrói a instância nova (passo 1) — `open`/addons são wireados pelos callbacks abaixo, não aqui. */
  createTerminal: () => T;
  /** Addons sempre carregados (fit/search/web-links, passo 3) — recebe a instância já aberta no container. */
  loadBaseAddons: (terminal: T) => void;
  /** Carrega o addon-webgl só agora (passo 6) — a única instância em foco no momento. */
  loadWebglAddon: (terminal: T) => DisposableAddon;
  /** Redireciona o onmessage do Channel de volta para `terminal.write()` direto (passo 7). */
  redirectToTerminal: (write: (bytes: Uint8Array) => void) => void;
  /** `fitAddon.fit()` + `resize_session` (passo 8) — o container pode ter mudado de tamanho desde a última vez que a sessão esteve visível. */
  fitAndResize: (terminal: T) => void;
}

/**
 * Algoritmo EXATO de ganhar foco (`02-RESEARCH.md` Pattern 3, "ao ganhar
 * foco", sessão B se torna a ativa):
 * 1. nova instância
 * 2. `open(container)`
 * 3. addons base sempre carregados (fit/search/web-links)
 * 4. restaura o snapshot serializado, se existir
 * 5. drena o `backgroundBuffer` em ordem (sem lacuna nem duplicação), depois limpa
 * 6. carrega o webgl agora (só nesta instância)
 * 7. redireciona o onmessage de volta para `terminal.write`
 * 8. fit + resize_session
 */
export function gainFocus<T extends FocusTerminalHandle>(
  params: GainFocusParams<T>,
): GainFocusResult<T> {
  const {
    liveSession,
    container,
    createTerminal,
    loadBaseAddons,
    loadWebglAddon,
    redirectToTerminal,
    fitAndResize,
  } = params;

  const terminal = createTerminal();
  terminal.open(container);
  loadBaseAddons(terminal);

  if (liveSession.serializedSnapshot !== null) {
    terminal.write(liveSession.serializedSnapshot);
  }

  for (const chunk of liveSession.backgroundBuffer) {
    terminal.write(chunk);
  }
  liveSession.backgroundBuffer = [];

  const webglAddon = loadWebglAddon(terminal);
  liveSession.hasWebgl = true;

  redirectToTerminal((bytes) => terminal.write(bytes));

  fitAndResize(terminal);

  return { terminal, webglAddon };
}
