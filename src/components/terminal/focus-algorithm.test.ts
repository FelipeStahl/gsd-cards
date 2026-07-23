// Cobre o algoritmo de foco puro (SESS-03, `02-RESEARCH.md` Pattern 3) com
// `Terminal`/`SerializeAddon`/`WebglAddon` mockados — nenhum xterm.js real é
// instanciado (sem DOM/canvas real necessário, ver `focus-algorithm.ts`).
//
// Cobre os `must_haves.truths` do plano: ordem exata de dispose em
// `loseFocus` (webgl -> serialize -> terminal), drenagem ordenada do
// `backgroundBuffer` sem lacuna nem duplicação em `gainFocus`, e no máximo
// um `hasWebgl` verdadeiro entre sessões simultâneas.

import { describe, expect, it, vi } from "vitest";

import {
  createLiveSessionState,
  gainFocus,
  loseFocus,
  type DisposableAddon,
  type FocusTerminalHandle,
  type GainFocusParams,
} from "./focus-algorithm";

/** Terminal mockado que registra cada `open`/`write`/`dispose` num log compartilhado. */
function createOrderedTerminal(log: unknown[]): FocusTerminalHandle {
  return {
    open: vi.fn(() => log.push("open")),
    write: vi.fn((data: string | Uint8Array) => log.push({ write: data })),
    dispose: vi.fn(() => log.push("dispose")),
  };
}

function createOrderedAddon(log: unknown[], name: string): DisposableAddon {
  return { dispose: vi.fn(() => log.push(`${name}.dispose`)) };
}

/** Parâmetros mínimos de `gainFocus` com todos os hooks registrando no log compartilhado, exceto os já explicitamente sobrescritos pelo chamador. */
function baseGainFocusParams(
  log: unknown[],
  overrides: Partial<GainFocusParams<FocusTerminalHandle>> = {},
): GainFocusParams<FocusTerminalHandle> {
  return {
    liveSession: createLiveSessionState(),
    container: document.createElement("div"),
    createTerminal: () => {
      log.push("createTerminal");
      return createOrderedTerminal(log);
    },
    loadBaseAddons: () => log.push("loadBaseAddons"),
    loadWebglAddon: () => {
      log.push("loadWebglAddon");
      return createOrderedAddon(log, "webgl");
    },
    redirectToTerminal: () => log.push("redirectToTerminal"),
    fitAndResize: () => log.push("fitAndResize"),
    ...overrides,
  };
}

describe("loseFocus — ordem exata do algoritmo (Pattern 3, 'ao perder foco')", () => {
  it("dispõe o webgl ANTES de serialize, que vem ANTES do dispose do terminal", () => {
    const order: string[] = [];
    const liveSession = createLiveSessionState();
    const webglAddon: DisposableAddon = { dispose: vi.fn(() => order.push("webgl.dispose")) };
    const terminal: FocusTerminalHandle = {
      open: vi.fn(),
      write: vi.fn(),
      dispose: vi.fn(() => order.push("terminal.dispose")),
    };
    const serializeAddon = { serialize: vi.fn(() => { order.push("serialize"); return "SNAPSHOT"; }) };

    loseFocus({
      liveSession,
      terminal,
      serializeAddon,
      webglAddon,
      redirectToBackground: () => {},
    });

    expect(order).toEqual(["webgl.dispose", "serialize", "terminal.dispose"]);
  });

  it("guarda o retorno de serialize() em liveSession.serializedSnapshot", () => {
    const liveSession = createLiveSessionState();

    loseFocus({
      liveSession,
      terminal: { open: vi.fn(), write: vi.fn(), dispose: vi.fn() },
      serializeAddon: { serialize: () => "ESTADO-VISUAL-E-SCROLLBACK" },
      webglAddon: null,
      redirectToBackground: () => {},
    });

    expect(liveSession.serializedSnapshot).toBe("ESTADO-VISUAL-E-SCROLLBACK");
  });

  it("não lança quando webglAddon é null (sessão nunca teve webgl carregado) — dispose é pulado, não é erro", () => {
    const liveSession = createLiveSessionState();

    expect(() =>
      loseFocus({
        liveSession,
        terminal: { open: vi.fn(), write: vi.fn(), dispose: vi.fn() },
        serializeAddon: { serialize: () => "" },
        webglAddon: null,
        redirectToBackground: () => {},
      }),
    ).not.toThrow();
  });

  it("sempre marca hasWebgl como false ao final, mesmo partindo de um estado (hipotético) inconsistente", () => {
    const liveSession = createLiveSessionState();
    liveSession.hasWebgl = true;

    loseFocus({
      liveSession,
      terminal: { open: vi.fn(), write: vi.fn(), dispose: vi.fn() },
      serializeAddon: { serialize: () => "" },
      webglAddon: null,
      redirectToBackground: () => {},
    });

    expect(liveSession.hasWebgl).toBe(false);
  });

  it("redireciona o Channel: bytes recebidos depois de loseFocus empilham no backgroundBuffer, em ordem", () => {
    const liveSession = createLiveSessionState();
    let capturedPush: ((bytes: Uint8Array) => void) | null = null;

    loseFocus({
      liveSession,
      terminal: { open: vi.fn(), write: vi.fn(), dispose: vi.fn() },
      serializeAddon: { serialize: () => "" },
      webglAddon: null,
      redirectToBackground: (push) => {
        capturedPush = push;
      },
    });

    expect(capturedPush).not.toBeNull();
    const chunkA = new Uint8Array([1, 2, 3]);
    const chunkB = new Uint8Array([4, 5]);
    capturedPush!(chunkA);
    capturedPush!(chunkB);

    expect(liveSession.backgroundBuffer).toEqual([chunkA, chunkB]);
  });
});

describe("gainFocus — ordem exata do algoritmo (Pattern 3, 'ao ganhar foco')", () => {
  it("segue create -> open -> loadBaseAddons -> write(snapshot) -> drenar buffer em ordem -> loadWebgl -> redirectToTerminal -> fitAndResize", () => {
    const log: unknown[] = [];
    const liveSession = createLiveSessionState();
    liveSession.serializedSnapshot = "SNAPSHOT-A";
    const chunk1 = new Uint8Array([9]);
    const chunk2 = new Uint8Array([10, 11]);
    liveSession.backgroundBuffer = [chunk1, chunk2];

    gainFocus(baseGainFocusParams(log, { liveSession }));

    expect(log).toEqual([
      "createTerminal",
      "open",
      "loadBaseAddons",
      { write: "SNAPSHOT-A" },
      { write: chunk1 },
      { write: chunk2 },
      "loadWebglAddon",
      "redirectToTerminal",
      "fitAndResize",
    ]);
  });

  it("não escreve nada quando não há snapshot nem backgroundBuffer (primeira vez que a sessão é focada)", () => {
    const log: unknown[] = [];
    gainFocus(baseGainFocusParams(log));

    expect(log.filter((entry) => typeof entry === "object" && entry !== null && "write" in entry)).toEqual([]);
  });

  it("limpa o backgroundBuffer após drená-lo — nenhuma duplicação num gainFocus subsequente", () => {
    const liveSession = createLiveSessionState();
    liveSession.backgroundBuffer = [new Uint8Array([1])];
    const log: unknown[] = [];

    gainFocus(baseGainFocusParams(log, { liveSession }));

    expect(liveSession.backgroundBuffer).toEqual([]);
  });

  it("marca liveSession.hasWebgl como true após carregar o webgl", () => {
    const liveSession = createLiveSessionState();
    const log: unknown[] = [];

    gainFocus(baseGainFocusParams(log, { liveSession }));

    expect(liveSession.hasWebgl).toBe(true);
  });

  it("retorna a instância de terminal criada e o addon webgl carregado", () => {
    const log: unknown[] = [];
    const result = gainFocus(baseGainFocusParams(log));

    expect(result.terminal).toBeDefined();
    expect(result.webglAddon).toBeDefined();
    expect(result.webglAddon.dispose).toBeTypeOf("function");
  });
});

describe("Round-trip loseFocus -> produção em background -> gainFocus (backstop automatizado de SESS-03)", () => {
  it("replay sem lacunas: uma sessão que produz bytes em background é totalmente restaurada ao reganhar foco", () => {
    const liveSession = createLiveSessionState();

    // Um "Channel" de PTY simplificado — só o suficiente para o teste
    // simular o redirecionamento real que `channel.ts::setSessionBytesHandler`
    // faz em produção, sem depender do Tauri.
    let currentHandler: (bytes: Uint8Array) => void = () => {};
    function ptyEmits(bytes: Uint8Array) {
      currentHandler(bytes);
    }

    // Foco inicial (primeira vez, sem snapshot nem buffer).
    const written1: unknown[] = [];
    const terminal1: FocusTerminalHandle = {
      open: vi.fn(),
      write: vi.fn((data) => written1.push(data)),
      dispose: vi.fn(),
    };
    const webglAddon1: DisposableAddon = { dispose: vi.fn() };

    gainFocus({
      liveSession,
      container: document.createElement("div"),
      createTerminal: () => terminal1,
      loadBaseAddons: () => {},
      loadWebglAddon: () => webglAddon1,
      redirectToTerminal: (write) => {
        currentHandler = write;
      },
      fitAndResize: () => {},
    });

    expect(liveSession.hasWebgl).toBe(true);

    // Perde foco — o PTY continua rodando (em produção); a UI só troca de sessão.
    loseFocus({
      liveSession,
      terminal: terminal1,
      serializeAddon: { serialize: () => "SNAPSHOT-APOS-PERDER-FOCO" },
      webglAddon: webglAddon1,
      redirectToBackground: (push) => {
        currentHandler = push;
      },
    });

    expect(liveSession.hasWebgl).toBe(false);
    expect(webglAddon1.dispose).toHaveBeenCalledTimes(1);

    // Processo em background produz output enquanto ninguém está olhando.
    const bgChunk1 = new Uint8Array([1]);
    const bgChunk2 = new Uint8Array([2, 3]);
    ptyEmits(bgChunk1);
    ptyEmits(bgChunk2);

    expect(liveSession.backgroundBuffer).toEqual([bgChunk1, bgChunk2]);
    expect(written1).toEqual([]); // terminal1 nunca recebeu esses bytes — já estava disposto

    // Ganha foco de novo — nova instância.
    const written2: unknown[] = [];
    const terminal2: FocusTerminalHandle = {
      open: vi.fn(),
      write: vi.fn((data) => written2.push(data)),
      dispose: vi.fn(),
    };
    const webglAddon2: DisposableAddon = { dispose: vi.fn() };

    gainFocus({
      liveSession,
      container: document.createElement("div"),
      createTerminal: () => terminal2,
      loadBaseAddons: () => {},
      loadWebglAddon: () => webglAddon2,
      redirectToTerminal: (write) => {
        currentHandler = write;
      },
      fitAndResize: () => {},
    });

    // Snapshot restaurado primeiro, depois o buffer drenado em ordem — sem lacuna, sem duplicação.
    expect(written2).toEqual(["SNAPSHOT-APOS-PERDER-FOCO", bgChunk1, bgChunk2]);
    expect(liveSession.backgroundBuffer).toEqual([]);
    expect(liveSession.hasWebgl).toBe(true);

    // Bytes recebidos depois de reganhar foco vão direto pro terminal atual, nunca mais pro buffer.
    const liveChunk = new Uint8Array([9, 9]);
    ptyEmits(liveChunk);
    expect(written2).toContainEqual(liveChunk);
    expect(liveSession.backgroundBuffer).toEqual([]);
  });
});

describe("No máximo um contexto WebGL vivo entre sessões simultâneas (SESS-03)", () => {
  it("perder foco de A e ganhar foco de B nunca deixa ambos hasWebgl=true ao mesmo tempo", () => {
    const sessionA = createLiveSessionState();
    const sessionB = createLiveSessionState();
    const logA: unknown[] = [];
    const logB: unknown[] = [];

    const resultA = gainFocus(baseGainFocusParams(logA, { liveSession: sessionA }));
    expect(sessionA.hasWebgl).toBe(true);
    expect(sessionB.hasWebgl).toBe(false);

    loseFocus({
      liveSession: sessionA,
      terminal: resultA.terminal,
      serializeAddon: { serialize: () => "A-SNAPSHOT" },
      webglAddon: resultA.webglAddon,
      redirectToBackground: () => {},
    });

    gainFocus(baseGainFocusParams(logB, { liveSession: sessionB }));

    expect([sessionA.hasWebgl, sessionB.hasWebgl].filter(Boolean)).toHaveLength(1);
    expect(sessionA.hasWebgl).toBe(false);
    expect(sessionB.hasWebgl).toBe(true);
  });
});
