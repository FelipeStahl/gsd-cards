// Watcher nativo de `.planning/**` — único trabalho genuinamente Rust desta
// fase (D-01 mantém a superfície Rust pequena). Observa estritamente o
// diretório `.planning/` de um projeto validado (nunca a raiz do repositório
// inteiro — evita a tempestade de eventos que o `.git/` geraria durante um
// `git commit` do GSD, ver Pitfall 1 / T-01-05c), com debounce nativo via
// `notify-debouncer-full`.
//
// O backend NUNCA lê nem envia o conteúdo dos arquivos alterados — só a lista
// de caminhos relevantes de cada lote estável (Pattern 3, two-speed IPC). O
// frontend é quem decide o que reler e como reprocessar (`src/planning/watch.ts`).

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Janela de debounce — ponto de partida dentro da faixa de 150-300ms
/// recomendada por `.planning/research/PITFALLS.md` (Pitfall 4). Tunar
/// empiricamente contra rajadas reais de `/gsd-execute-phase`; qualquer
/// ajuste feito durante a verificação da fase deve ser registrado no SUMMARY.
pub const DEBOUNCE_MS: u64 = 250;

type PlanningDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

/// Handle único do watcher ativo, guardado em estado gerenciado do Tauri.
/// Abrir um novo projeto substitui o watcher anterior (via `Mutex`) em vez de
/// acumular watchers (T-01-11).
#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<PlanningDebouncer>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatcherDegradedPayload {
    reason: String,
}

/// Decide se um caminho alterado é relevante o suficiente para entrar no
/// payload emitido ao frontend. Retorna verdadeiro apenas para caminhos
/// contidos em `planning_root` (por componentes de caminho, nunca por
/// prefixo textual — mesma regra de `project.rs::is_contained`, cobrindo o
/// caso de um diretório irmão com prefixo textual comum) e cujo nome de
/// arquivo termine em `.md` ou seja `config.json`. Retorna falso para
/// arquivos temporários de editor/escrita atômica.
pub fn is_relevant_change(path: &Path, planning_root: &Path) -> bool {
    if !path.starts_with(planning_root) {
        return false;
    }

    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    if file_name.starts_with('.') || file_name.starts_with('~') {
        return false;
    }
    if file_name.ends_with(".tmp") || file_name.ends_with(".swp") || file_name.ends_with(".swx") {
        return false;
    }

    file_name.ends_with(".md") || file_name == "config.json"
}

#[tauri::command]
pub fn start_planning_watch(
    app: AppHandle,
    state: State<'_, WatcherState>,
    planning_root: String,
) -> Result<(), String> {
    let root = PathBuf::from(&planning_root);

    let app_for_events = app.clone();
    let root_for_filter = root.clone();
    let app_for_errors = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let mut paths: Vec<String> = events
                    .iter()
                    .flat_map(|event| event.paths.iter())
                    .filter(|path| is_relevant_change(path, &root_for_filter))
                    .map(|path| path.to_string_lossy().replace('\\', "/"))
                    .collect();
                paths.sort();
                paths.dedup();

                // Se o lote inteiro foi filtrado (ex.: só arquivos temporários
                // de escrita atômica), nenhum evento é emitido — o frontend
                // nunca reprocessa um lote vazio.
                if !paths.is_empty() {
                    let _ = app_for_events.emit("planning:changed", paths);
                }
            }
            Err(errors) => {
                let reason = errors
                    .iter()
                    .map(|error| error.to_string())
                    .collect::<Vec<_>>()
                    .join("; ");
                let _ = app_for_errors.emit(
                    "planning:watcher-degraded",
                    WatcherDegradedPayload { reason },
                );
            }
        },
    )
    .map_err(|error| format!("Não foi possível criar o watcher: {error}"))?;

    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("Não foi possível observar {planning_root}: {error}"))?;

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "Estado do watcher corrompido (mutex poisoned)".to_string())?;
    // Substitui o watcher anterior (se houver) em vez de acumular — o
    // `Debouncer` antigo é dropado aqui, o que dispara seu `Drop` (stop).
    *guard = Some(debouncer);

    Ok(())
}

#[tauri::command]
pub fn stop_planning_watch(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "Estado do watcher corrompido (mutex poisoned)".to_string())?;
    *guard = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_file_inside_root_is_relevant() {
        assert!(is_relevant_change(
            Path::new("/root/.planning/STATE.md"),
            Path::new("/root/.planning")
        ));
    }

    #[test]
    fn config_json_inside_root_is_relevant() {
        assert!(is_relevant_change(
            Path::new("/root/.planning/config.json"),
            Path::new("/root/.planning")
        ));
    }

    #[test]
    fn atomic_write_temp_file_is_not_relevant() {
        assert!(!is_relevant_change(
            Path::new("/root/.planning/STATE.md.tmp"),
            Path::new("/root/.planning")
        ));
        assert!(!is_relevant_change(
            Path::new("/root/.planning/.STATE.md.swp"),
            Path::new("/root/.planning")
        ));
        assert!(!is_relevant_change(
            Path::new("/root/.planning/~STATE.md"),
            Path::new("/root/.planning")
        ));
    }

    #[test]
    fn path_outside_root_is_not_relevant() {
        assert!(!is_relevant_change(
            Path::new("/other/STATE.md"),
            Path::new("/root/.planning")
        ));
    }

    #[test]
    fn sibling_path_with_common_text_prefix_is_not_relevant() {
        // /root/.planning-backup partilha o prefixo textual "/root/.planning"
        // com a raiz observada, mas NÃO é um descendente dela — uma
        // comparação de string ingênua erraria aqui (mesma regra de
        // `project.rs::is_contained`).
        assert!(!is_relevant_change(
            Path::new("/root/.planning-backup/STATE.md"),
            Path::new("/root/.planning")
        ));
    }
}
