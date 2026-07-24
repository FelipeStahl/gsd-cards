mod dependencies;
mod planning_watcher;
// `pub` (não `mod` privado) porque `tests/tree_kill.rs` — um crate externo
// que depende de `gsd_cards_lib` como biblioteca — precisa exercitar
// `TreeGuard::attach`/`kill_tree` diretamente (key_link do 02-02-PLAN.md);
// itens não-`pub` de um módulo não-`pub` são invisíveis fora do crate.
pub mod process_guard;
mod project;
// `pub` (não `mod` privado) pelo MESMO motivo de `process_guard` acima:
// `tests/write_session_rejects.rs` — um crate externo — precisa exercitar
// `PtyManager::write`/`PtyError` diretamente para provar a rejeição real do
// backend (`PtyError::NotFound`, serde-serializável) sem depender de um
// `tauri::State`/`Channel` reais (03-01-PLAN.md Task 3, T-03-02).
pub mod pty;
mod sessions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Só usado para abrir URLs clicáveis do output do terminal no
        // navegador padrão do SO (`@xterm/addon-web-links`, TERM-02) — a
        // capability concedida em capabilities/default.json é
        // `opener:allow-open-url` apenas, nunca `allow-open-path`/
        // `allow-reveal-item-in-dir` (T-02-08).
        .plugin(tauri_plugin_opener::init())
        // Primeira escrita em disco do app (04-01-PLAN.md) — SEMPRE
        // appDataDir via este plugin, NUNCA o `.planning/` do usuário
        // (invariante de produto, 04-CONTEXT.md `## Phase Boundary`).
        .plugin(tauri_plugin_store::Builder::new().build())
        // Notificações do SO (TERM-04, plano futuro desta fase) — registrado
        // já neste plano-tracer junto com o store para não reabrir o gate de
        // legitimidade de pacote duas vezes.
        .plugin(tauri_plugin_notification::init())
        .manage(planning_watcher::WatcherState::default())
        .manage(pty::PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            project::validate_project_root,
            planning_watcher::start_planning_watch,
            planning_watcher::stop_planning_watch,
            pty::spawn_session,
            pty::write_session,
            pty::resize_session,
            pty::kill_session,
            dependencies::check_claude_on_path,
            sessions::register_sessions_scope,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Fechar a janela com sessões ainda vivas não deve deixar
            // zumbis: mata a árvore de processos de TODA sessão viva antes
            // de o app efetivamente sair (SESS-06, critério de fundação).
            if let tauri::RunEvent::ExitRequested { .. } = event {
                use tauri::Manager;
                app_handle.state::<pty::PtyManager>().kill_all();
            }
        });
}
