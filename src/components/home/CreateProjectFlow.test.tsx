import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir } from "@tauri-apps/plugin-fs";

import { CreateProjectFlow, CreateProjectTimeoutError, waitForPlanningDir } from "./CreateProjectFlow";
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

describe("CreateProjectFlow — CR-03: nunca trava o usuário num spinner permanente", () => {
  it("um cancel/close explícito durante 'progress' fecha o diálogo (onClose) e nunca navega para o board depois", async () => {
    vi.mocked(open).mockResolvedValue("/nova-pasta");
    vi.mocked(readDir).mockResolvedValue([]);
    createProjectSessionMock.mockResolvedValue("session-1");
    // `.planning/` nunca aparece — sem o cancel, o poll giraria para
    // sempre (real timers, POLL_INTERVAL_MS === 1000ms).
    vi.mocked(exists).mockResolvedValue(false);
    const onClose = vi.fn();
    const openProjectMock = vi.fn();
    useBoardStore.setState({ openProject: openProjectMock, setView: vi.fn() });

    render(<CreateProjectFlow onClose={onClose} />);

    const cancelButton = await screen.findByRole("button", { name: "Cancelar" });
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    // Dá tempo para qualquer poll pendente resolver e checar `isCancelled` —
    // openProject nunca deve ser alcançado depois do cancel.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(openProjectMock).not.toHaveBeenCalled();
  });

  it("uma rejeição de createProjectSession (ex.: spawn falhou) cai no estado de erro genérico em vez de deixar uma promise rejeitada sem handler", async () => {
    vi.mocked(open).mockResolvedValue("/nova-pasta");
    vi.mocked(readDir).mockResolvedValue([]);
    createProjectSessionMock.mockRejectedValue(new Error("PtyError::Spawn"));

    render(<CreateProjectFlow onClose={vi.fn()} />);

    expect(await screen.findByText("Não foi possível criar o projeto")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Algo deu errado ao conduzir /gsd-new-project — a sessão pode ter travado ou falhado ao iniciar. Tente novamente.",
      ),
    ).toBeInTheDocument();
  });

  it("o botão de dismiss do estado de erro genérico fecha o diálogo", async () => {
    vi.mocked(open).mockResolvedValue("/nova-pasta");
    vi.mocked(readDir).mockResolvedValue([]);
    createProjectSessionMock.mockRejectedValue(new Error("PtyError::Spawn"));
    const onClose = vi.fn();

    render(<CreateProjectFlow onClose={onClose} />);

    const dismissButton = await screen.findByRole("button", { name: "OK" });
    fireEvent.click(dismissButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("waitForPlanningDir — CR-03: teto de espera, sem bloquear o poll para sempre", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lança CreateProjectTimeoutError quando isTimedOut() vira true antes de .planning/ aparecer", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    let timedOut = false;

    const promise = waitForPlanningDir(
      "/nova-pasta",
      () => false,
      () => timedOut,
    );

    // Primeira volta do loop já observa isTimedOut() === false (exists()
    // resolve false, timeout ainda não vencido) e agenda o próximo poll —
    // liga o timeout só depois disso, simulando "60s se passaram sem
    // nenhuma atividade".
    timedOut = true;

    await expect(promise).rejects.toBeInstanceOf(CreateProjectTimeoutError);
  });

  it("resolve normalmente quando .planning/ aparece antes do timeout", async () => {
    vi.mocked(exists).mockResolvedValue(true);

    await expect(waitForPlanningDir("/nova-pasta", () => false, () => false)).resolves.toBeUndefined();
  });

  it("nunca lança/resolve enquanto isCancelled()/isTimedOut() permanecem false e exists() false — poll segue girando até ser cancelado", async () => {
    vi.useFakeTimers();
    vi.mocked(exists).mockResolvedValue(false);
    let cancelled = false;
    let settled = false;

    const promise = waitForPlanningDir(
      "/nova-pasta",
      () => cancelled,
      () => false,
    ).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // Deixa a primeira checagem de `exists()` (mock, resolve via microtask)
    // assentar — a promise não deve ter se decidido ainda neste ponto.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    // Cancela e avança exatamente um intervalo de poll (1000ms, mesmo valor
    // de `POLL_INTERVAL_MS` no módulo) — só então o loop reavalia
    // `isCancelled()`, vê `true`, e sai normalmente (resolve, nunca lança).
    cancelled = true;
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(settled).toBe(true);
  });
});

describe("CreateProjectFlow — WR-03: falha de leitura da pasta nunca vira 'pasta não está vazia'", () => {
  it("readDir rejeitando (pasta ilegível) mostra a copy de leitura, nunca a de pasta não-vazia", async () => {
    vi.mocked(open).mockResolvedValue("/pasta-sem-permissao");
    vi.mocked(readDir).mockRejectedValue(new Error("EACCES"));

    render(<CreateProjectFlow onClose={vi.fn()} />);

    expect(await screen.findByText("Não foi possível ler essa pasta")).toBeInTheDocument();
    expect(screen.queryByText("Pasta não está vazia")).not.toBeInTheDocument();
    expect(createProjectSessionMock).not.toHaveBeenCalled();
  });
});
