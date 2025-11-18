//! Repository utilities module
//!
//! Functions for working with Helm repositories

use tauri_plugin_shell::ShellExt;

/// Get list of available Helm repositories and check if the requested repo exists
pub async fn get_available_repos(
    app: &tauri::AppHandle,
    requested_repo: &str,
) -> (Vec<String>, bool) {
    let shell = app.shell();
    let repo_list_output = shell
        .command("helm")
        .args(["repo", "list"])
        .output()
        .await;

    let mut available_repos = Vec::new();
    let mut requested_repo_exists = false;

    if let Ok(result) = repo_list_output {
        if result.status.success() {
            let output = String::from_utf8_lossy(&result.stdout);
            for line in output.lines().skip(1) {
                if line.trim().is_empty() {
                    continue;
                }
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 1 {
                    let repo_name_from_list = parts[0];
                    available_repos.push(repo_name_from_list.to_string());
                    if repo_name_from_list == requested_repo {
                        requested_repo_exists = true;
                    }
                }
            }
        }
    };

    (available_repos, requested_repo_exists)
}

/// Check if error message indicates a network issue
pub fn is_network_error(error_msg: &str) -> bool {
    error_msg.contains("timeout") || error_msg.contains("network") || error_msg.contains("connection")
}