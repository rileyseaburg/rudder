//! Run module
//!
//! This module was automatically extracted by Rusty Refactor.

use crate::*;

/// Starts and runs the Tauri application.
///
/// This function constructs the Tauri application builder, registers
/// the required plugins, sets up the invoke handler for commands
/// between the frontend and backend, and then runs the application
/// with the generated context. Any error while running the application
/// will cause a panic with an error message.
///
/// The listed commands in the invoke handler are:
/// - `greet`
/// - `list_helm_releases`
/// - `get_schema_for_chart`
/// - `set_kubeconfig`
/// - `helm_upgrade`
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the database
    let db_conn = db::connection::init_database()
        .expect("Failed to initialize database");
    
    // Wrap the connection in Arc<Mutex<>> for shared state
    let db_state: DbConnection = Arc::new(Mutex::new(db_conn));
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            list_helm_releases,
            get_schema_for_chart,
            set_kubeconfig,
            helm_upgrade,
            list_cached_schemas,
            clear_schema_cache,
            delete_schema_cache_entry,
            get_helm_history,
            helm_rollback,
            get_kube_context,
            list_kube_contexts,
            switch_kube_context,
            get_release_pods,
            get_pod_logs,
            diagnose_release,
            restart_deployment,
            delete_failed_pods,
            describe_pod,
            helm_dry_run,
            get_release_values,
            get_release_manifest,
            run_shell_command,
            exec_in_pod
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
