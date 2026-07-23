// Stub RED temporário (TDD) — implementação real vem no próximo commit.
export interface FocusTerminalHandle {
  open(container: HTMLElement): void;
  write(data: string | Uint8Array): void;
  dispose(): void;
}

export interface DisposableAddon {
  dispose(): void;
}

export interface SerializeAddonHandle {
  serialize(): string;
}

export interface LiveSessionState {
  serializedSnapshot: string | null;
  backgroundBuffer: Uint8Array[];
  hasWebgl: boolean;
}

export function createLiveSessionState(): LiveSessionState {
  return { serializedSnapshot: null, backgroundBuffer: [], hasWebgl: false };
}

export interface LoseFocusParams {
  liveSession: LiveSessionState;
  terminal: FocusTerminalHandle;
  serializeAddon: SerializeAddonHandle;
  webglAddon: DisposableAddon | null;
  redirectToBackground: (push: (bytes: Uint8Array) => void) => void;
}

export function loseFocus(_params: LoseFocusParams): void {
  throw new Error("not implemented");
}

export interface GainFocusResult<T extends FocusTerminalHandle> {
  terminal: T;
  webglAddon: DisposableAddon;
}

export interface GainFocusParams<T extends FocusTerminalHandle> {
  liveSession: LiveSessionState;
  container: HTMLElement;
  createTerminal: () => T;
  loadBaseAddons: (terminal: T) => void;
  loadWebglAddon: (terminal: T) => DisposableAddon;
  redirectToTerminal: (write: (bytes: Uint8Array) => void) => void;
  fitAndResize: (terminal: T) => void;
}

export function gainFocus<T extends FocusTerminalHandle>(
  _params: GainFocusParams<T>,
): GainFocusResult<T> {
  throw new Error("not implemented");
}
