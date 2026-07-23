mod dependencies;
mod planning_watcher;
// `pub` (não `mod` privado) porque `tests/tree_kill.rs` — um crate externo
// que depende de `gsd_cards_lib` como biblioteca — precisa exercitar
// `TreeGuard::attach`/`kill_tree` diretamente (key_link do 02-02-PLAN.md);
// itens não-`pub` de um módulo não-`pub` são invisíveis fora do crate.
pub mod process_guard;
mod project;
mod pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
