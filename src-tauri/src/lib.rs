mod planning_watcher;
mod process_guard;
mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(planning_watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            project::validate_project_root,
            planning_watcher::start_planning_watch,
            planning_watcher::stop_planning_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
