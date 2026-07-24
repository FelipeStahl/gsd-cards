// Wrapper de persistência para `app-state.json` — a PRIMEIRA escrita em
// disco do app (04-01-PLAN.md, tracer da Fase 4). Metadados pequenos e
// frequentemente atualizados (recentes, índice/nome de sessão) ficam neste
// arquivo; snapshots grandes de scrollback (SESS-04, plano futuro) vivem em
// arquivos próprios `session-<id>.json` — nunca aqui — porque `save()` do
// `tauri-plugin-store` reserializa o documento inteiro a cada chamada
// (04-RESEARCH.md Pitfall 4): misturar os dois faria uma renomeação trivial
// de sessão pagar o custo de reserializar todos os snapshots carregados.
//
// Invariante inegociável (04-CONTEXT.md `## Phase Boundary`): este arquivo
// vive sob o `appDataDir` do próprio app — NUNCA sob o `.planning/` do
// usuário. O board continua read-only sobre `.planning/`; toda escrita desta
// fase é estado do app, não artefato GSD.

import { LazyStore } from "@tauri-apps/plugin-store";

/** Nome de arquivo plano diretamente sob `appDataDir` — sem subdiretório
 * (o `tauri-plugin-store` não cria diretórios pai para caminhos aninhados,
 * ver 04-RESEARCH.md Alternatives Considered). `autoSave: false` — I/O só
 * acontece nos pontos explícitos em que chamamos `.save()`, nunca num
 * debounce implícito cujo timing seria imprevisível para os testes. */
export const appStore = new LazyStore("app-state.json", { autoSave: false });

/** Um projeto recente — cache mínimo o suficiente para renderizar a home
 * sem re-derivar `deriveProjectName` nem re-validar o projeto até o clique. */
export interface RecentProjectEntry {
  root: string;
  /** Nome cacheado (`deriveProjectName(root)`) — evita re-derivar em todo render da home. */
  name: string;
  /** Timestamp ISO — `getRecents()` devolve a lista já ordenada por este
   * campo em ordem decrescente (mais recente primeiro), garantido pela
   * ordem de inserção de `upsertRecent`, nunca por um sort no leitor. */
  lastOpened: string;
}

const RECENTS_KEY = "recentProjects";

/**
 * Insere/atualiza um recente: remove qualquer entrada existente com o mesmo
 * `root` (nunca duplica) e prepende a nova entrada — o resultado já fica
 * ordenado por `lastOpened` desc pela própria posição de inserção. Grava com
 * `.save()` explícito logo em seguida (autoSave desabilitado acima).
 */
export async function upsertRecent(entry: RecentProjectEntry): Promise<void> {
  const recents = (await appStore.get<RecentProjectEntry[]>(RECENTS_KEY)) ?? [];
  const next = [entry, ...recents.filter((recent) => recent.root !== entry.root)];
  await appStore.set(RECENTS_KEY, next);
  await appStore.save();
}

/** Lê a lista de recentes persistida — `[]` quando não há nenhuma ainda
 * (primeira execução do app), nunca lança. */
export async function getRecents(): Promise<RecentProjectEntry[]> {
  return (await appStore.get<RecentProjectEntry[]>(RECENTS_KEY)) ?? [];
}

/**
 * Remove um recente da lista persistida (04-04-PLAN.md: ação "Remover da
 * lista" do card de erro, PROJ-06 — projeto movido/apagado). Idempotente e
 * nunca lança: remover um `root` que já não está na lista é um no-op.
 */
export async function removeRecent(root: string): Promise<void> {
  const recents = (await appStore.get<RecentProjectEntry[]>(RECENTS_KEY)) ?? [];
  const next = recents.filter((recent) => recent.root !== root);
  await appStore.set(RECENTS_KEY, next);
  await appStore.save();
}

const SESSION_NAMES_KEY = "sessionNames";

/**
 * Persiste (ou limpa) o nome customizado de uma sessão (SESS-05,
 * 04-05-PLAN.md) — pequeno metadado id->nome, nunca o snapshot de
 * scrollback (esse vive em arquivo próprio por sessão, ver o comentário de
 * topo). `name === ""` remove a entrada (equivalente a "sem nome
 * customizado" — o consumidor cai para o label derivado do id).
 */
export async function setSessionName(id: string, name: string): Promise<void> {
  const names = (await appStore.get<Record<string, string>>(SESSION_NAMES_KEY)) ?? {};
  const next = { ...names };
  if (name.length > 0) {
    next[id] = name;
  } else {
    delete next[id];
  }
  await appStore.set(SESSION_NAMES_KEY, next);
  await appStore.save();
}

/** Lê o mapa id->nome persistido — `{}` quando nenhuma sessão foi renomeada ainda, nunca lança. */
export async function getSessionNames(): Promise<Record<string, string>> {
  return (await appStore.get<Record<string, string>>(SESSION_NAMES_KEY)) ?? {};
}

const SESSIONS_KEY = "sessions";

/**
 * Metadado PEQUENO de uma sessão para restauração lazy (SESS-04,
 * 04-06-PLAN.md) — id, dono (`projectRoot`, load-bearing para o `cwd` do
 * `claude --resume`, Pitfall 2), nome customizado e `lastActive`. NUNCA o
 * snapshot do buffer em si — esse vive em `session-<id>.json`
 * (`persistence/session-snapshot.ts`), pelo mesmo motivo de
 * `RECENTS_KEY`/`SESSION_NAMES_KEY` viverem aqui (Pitfall 4).
 */
export interface PersistedSessionEntry {
  id: string;
  projectRoot: string;
  name?: string;
  /** Timestamp ISO da última vez que a sessão perdeu foco (gravado por `persistSnapshot`, session-store.ts). */
  lastActive: string;
}

/**
 * Insere/atualiza o metadado de uma sessão — mesmo padrão de
 * `upsertRecent` (remove qualquer entrada existente com o mesmo `id`,
 * prepende a nova, nunca duplica).
 */
export async function upsertPersistedSession(entry: PersistedSessionEntry): Promise<void> {
  const sessions = (await appStore.get<PersistedSessionEntry[]>(SESSIONS_KEY)) ?? [];
  const next = [entry, ...sessions.filter((session) => session.id !== entry.id)];
  await appStore.set(SESSIONS_KEY, next);
  await appStore.save();
}

/**
 * Lê os metadados de sessão persistidos, filtrados por `projectRoot` — a
 * restauração é sempre escopada por projeto (PROJ-05/04-05-PLAN.md), nunca
 * global. `[]` quando nenhuma sessão foi persistida ainda para esse root,
 * nunca lança.
 */
export async function getPersistedSessions(projectRoot: string): Promise<PersistedSessionEntry[]> {
  const sessions = (await appStore.get<PersistedSessionEntry[]>(SESSIONS_KEY)) ?? [];
  return sessions.filter((session) => session.projectRoot === projectRoot);
}
