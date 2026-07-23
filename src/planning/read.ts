// Camada de leitura de `.planning/` — todo caminho de filesystem que entra no
// frontend passa primeiro por `validateProjectRoot` (que invoca o comando
// Rust `validate_project_root`, o único portão de entrada do app). Depois de
// validado, `readPlanningText`/`listPlanningDir`/`planningFileExists`
// encapsulam as chamadas ao `@tauri-apps/plugin-fs`.

import { invoke } from "@tauri-apps/api/core";
import {
  readTextFile,
  readDir,
  exists,
  size as fileSize,
  stat as fileStat,
  type DirEntry,
  type FileInfo,
} from "@tauri-apps/plugin-fs";

/** Teto de tamanho por arquivo lido — mitiga T-01-05 (DoS via arquivo gigante travando o webview). */
export const MAX_PLANNING_FILE_BYTES = 2 * 1024 * 1024;

export interface ValidatedProject {
  root: string;
  planningDir: string;
  hasRoadmap: boolean;
  hasState: boolean;
  /** Aditivo (Fase 2, PROJ-04) — ver `has_gsd_core` em `project.rs`. */
  hasGsdCore: boolean;
}

export type ProjectOpenErrorKind = "NotAGsdProject" | "OutsideScope" | "IoError";

/** Erro tipado de domínio para a validação de um projeto GSD. */
export class ProjectOpenError extends Error {
  readonly kind: ProjectOpenErrorKind;

  constructor(kind: ProjectOpenErrorKind, message: string) {
    super(message);
    this.name = "ProjectOpenError";
    this.kind = kind;
  }
}

interface RustProjectError {
  kind: "NotAGsdProject" | "OutsideScope" | "Io";
  message: string;
}

function isRustProjectError(value: unknown): value is RustProjectError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.kind === "string" && typeof candidate.message === "string"
  );
}

/**
 * Único ponto onde um caminho de filesystem escolhido pelo usuário entra no
 * app. Invoca `validate_project_root` (Rust), que canonicaliza a raiz,
 * confirma a contenção de `.planning/` e concede escopo mínimo de leitura.
 */
export async function validateProjectRoot(root: string): Promise<ValidatedProject> {
  try {
    return await invoke<ValidatedProject>("validate_project_root", { root });
  } catch (error) {
    if (isRustProjectError(error)) {
      const kind: ProjectOpenErrorKind =
        error.kind === "Io" ? "IoError" : error.kind;
      throw new ProjectOpenError(kind, error.message);
    }
    throw new ProjectOpenError("IoError", String(error));
  }
}

export type ReadTextErrorKind = "TooLarge" | "IoError";

/** Erro tipado de domínio para leitura de texto de `.planning/`. */
export class ReadTextError extends Error {
  readonly kind: ReadTextErrorKind;

  constructor(kind: ReadTextErrorKind, message: string) {
    super(message);
    this.name = "ReadTextError";
    this.kind = kind;
  }
}

/**
 * Lê um arquivo de texto de `.planning/`, recusando arquivos acima de
 * `MAX_PLANNING_FILE_BYTES` (T-01-05) — o tamanho é checado via `size()`
 * antes de carregar o conteúdo, para nunca trazer um arquivo gigante para o
 * webview só para descobrir depois que ele era grande demais.
 */
export async function readPlanningText(path: string): Promise<string> {
  let bytes: number;
  try {
    bytes = await fileSize(path);
  } catch (error) {
    throw new ReadTextError("IoError", String(error));
  }

  if (bytes > MAX_PLANNING_FILE_BYTES) {
    throw new ReadTextError(
      "TooLarge",
      `Arquivo excede o teto de ${MAX_PLANNING_FILE_BYTES} bytes (${bytes} bytes): ${path}`,
    );
  }

  try {
    return await readTextFile(path);
  } catch (error) {
    throw new ReadTextError("IoError", String(error));
  }
}

export async function listPlanningDir(path: string): Promise<DirEntry[]> {
  return readDir(path);
}

export async function planningFileExists(path: string): Promise<boolean> {
  return exists(path);
}

/**
 * Metadados de arquivo (mtime, entre outros) — necessário para o sinal
 * `isActive` da varredura de fase (Plano 03, `phase-scan.ts`): a heurística
 * "fase ativa" do gsd-core observa o mtime dos arquivos do diretório da fase.
 * Read-only (`fs:allow-stat`), sem novo escopo de escrita.
 */
export async function statPlanningPath(path: string): Promise<FileInfo> {
  return fileStat(path);
}
