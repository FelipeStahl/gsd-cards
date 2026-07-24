// Store de snapshot POR SESSÃO (SESS-04, 04-06-PLAN.md) — um arquivo
// `session-<id>.json` plano por sessão, diretamente sob `appDataDir`, SEM
// subdiretório (o `tauri-plugin-store` não cria diretórios pai para
// caminhos aninhados — 04-RESEARCH.md Alternatives Considered) e NUNCA no
// mesmo arquivo que `app-store.ts` (`app-state.json`).
//
// Por quê um arquivo próprio por sessão, nunca junto com os metadados
// pequenos/frequentes (recentes, nomes de sessão): `save()` do
// `tauri-plugin-store` reserializa o documento INTEIRO a cada chamada
// (04-RESEARCH.md Pitfall 4). Snapshots de scrollback podem chegar a
// algumas centenas de KB — misturá-los com `app-state.json` faria toda
// renomeação trivial de sessão pagar o custo de reserializar todo snapshot
// carregado. `Store.load(..., { autoSave: false })` + `.close()` explícito
// ao fim de cada save/load garante que o snapshot NUNCA fique residente em
// memória além do ponto de uso (perder foco / retomar), diferente de
// `appStore` (`app-store.ts`), que é um `LazyStore` de vida longa.

import { Store } from "@tauri-apps/plugin-store";

function snapshotFileName(sessionId: string): string {
  return `session-${sessionId}.json`;
}

/**
 * Grava o snapshot serializado (via `@xterm/addon-serialize`) da sessão em
 * disco, no PRÓPRIO arquivo dela — nunca em `app-state.json`. `.close()` ao
 * fim libera a cópia em memória do `Store` (04-RESEARCH.md Pitfall 4/
 * Assumptions Log A3): sem isso, cada sessão persistida ao longo de uma
 * execução longa deixaria seu `Store` residente indefinidamente.
 */
export async function saveSnapshot(sessionId: string, snapshot: string): Promise<void> {
  const store = await Store.load(snapshotFileName(sessionId), { autoSave: false });
  await store.set("snapshot", snapshot);
  await store.set("savedAt", new Date().toISOString());
  await store.save();
  await store.close();
}

/**
 * Lê o snapshot persistido da sessão — `null` quando nunca foi persistido
 * (id desconhecido/nunca perdeu foco/nunca foi retomada nesta máquina),
 * nunca lança. Mesma disciplina de `.close()` do save acima.
 */
export async function loadSnapshot(sessionId: string): Promise<string | null> {
  const store = await Store.load(snapshotFileName(sessionId), { autoSave: false });
  const snapshot = (await store.get<string>("snapshot")) ?? null;
  await store.close();
  return snapshot;
}
