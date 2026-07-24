import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir } from "@tauri-apps/plugin-fs";

import { CreateProjectFlow } from "./CreateProjectFlow";
import { useBoardStore } from "../../stores/board-store";
import { useSessionStore } from "../../stores/session-store";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  exists: vi.fn(),
}));

const createProjectSessionMock = vi.fn();
const writeSessionMock = vi.fn();

vi.mock("../../pty/channel", () => ({
  writeSession: (...args: unknown[]) => writeSessionMock(...args),
}));

const initialSessionState = useSessionStore.getState();
const initialBoardState = useBoardStore.getState();

beforeEach(() => {
  useSessionStore.setState(initialSessionState, true);
  useBoardStore.setState(initialBoardState, true);
  vi.mocked(open).mockReset();
  vi.mocked(readDir).mockReset();
  vi.mocked(exists).mockReset().mockResolvedValue(false);
  writeSessionMock.mockReset().mockResolvedValue(undefined);
  createProjectSessionMock.mockReset();
  // `createProjectSession` is a real store action (not module-mocked) so
  // this suite exercises the real onBytes-forwarding contract end to end —
  // only its return value/behavior is stubbed via spying on the store.
  useSessionStore.setState({
    createProjectSession: createProjectSessionMock,
  });
});

describe("CreateProjectFlow — CR-02: mini-terminal visível/interativo", () => {
  it("passa um onBytes real (não um no-op descartando bytes) para createProjectSession", async () => {
    vi.mocked(open).mockResolvedValue("/nova-pasta");
    vi.mocked(readDir).mockResolvedValue([]);
    createProjectSessionMock.mockImplementation(async (_root: string, onBytes) => {
      expect(typeof onBytes).toBe("function");
      return "session-1";
    });

    render(<CreateProjectFlow onClose={vi.fn()} />);

    await waitFor(() => {
      expect(createProjectSessionMock).toHaveBeenCalled();
    });
    const [, onBytes] = createProjectSessionMock.mock.calls[0] as [string, ((data: Uint8Array) => void) | undefined];
    expect(onBytes).toBeInstanceOf(Function);
  });

  it("bytes recebidos via onBytes aparecem decodificados no output visível do painel", async () => {
    vi.mocked(open).mockResolvedValue("/nova-pasta");
    vi.mocked(readDir).mockResolvedValue([]);
    let capturedOnBytes: ((data: Uint8Array) => void) | undefined;
    createProjectSessionMock.mockImplementation(async (_root: string, onBytes) => {
      capturedOnBytes = onBytes;
      return "session-1";
    });

    render(<CreateProjectFlow onClose={vi.fn()} />);

    await waitFor(() => expect(capturedOnBytes).toBeInstanceOf(Function));

    const encoded = new TextEncoder().encode("Escolha um nome para o projeto: ");
    capturedOnBytes?.(encoded);

    await screen.findByText("Escolha um nome para o projeto:", { exact: false });
  });

  it("o campo de input do mini-terminal envia texto via writeSession com a sessão criada", async () => {
    vi.mocked(open).mockResolvedValue("/nova-pasta");
    vi.mocked(readDir).mockResolvedValue([]);
    createProjectSessionMock.mockResolvedValue("session-42");

    render(<CreateProjectFlow onClose={vi.fn()} />);

    const input = await screen.findByPlaceholderText("Digite e pressione Enter para responder");
    fireEvent.change(input, { target: { value: "meu-projeto" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(writeSessionMock).toHaveBeenCalledWith("session-42", "meu-projeto\r");
    });
  });
});
