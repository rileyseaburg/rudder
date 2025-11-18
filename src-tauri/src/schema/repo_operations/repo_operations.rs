//! Repo operations module
//!
//! This module was automatically extracted by Rusty Refactor.

use tauri_plugin_shell::ShellExt;

/// Check if a schema is cached in the database and return it if found.
///
/// Queries the provided database connection for a cached chart schema
/// matching `chart_name`, `chart_version` and `repo_name`. If a cached
/// schema is present it is serialized to a JSON string and returned as
/// `Some(Ok(String))`. If no cached schema exists the function returns
/// `None`. The function preserves the original call semantics and error
/// propagation of the underlying `schemas::get_chart_schema` call.
///
/// # Parameters
/// - `db`: reference to the database connection used to fetch cached schemas.
/// - `chart_name`: name of the chart to look up.
/// - `chart_version`: version of the chart to look up.
/// - `repo_name`: repository name where the chart is expected.
///
/// # Returns
/// `Option<Result<String, String>>` where:
/// - `Some(Ok(String))` contains the serialized schema content when found.
/// - `None` indicates no cached schema was present.
/// - `Some(Err(String))` may carry an error propagated from the underlying call.
pub fn check_for_cached_schema(
    db: &tauri::State<'_, crate::DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
) -> Option<Result<String, String>> {
    match crate::db::schemas::get_chart_schema(db, chart_name, chart_version, repo_name).ok()? {
        Some(cached_schema) => {
            println!("Found cached schema for {} {}", chart_name, chart_version);
            Some(Ok(
                serde_json::to_string(&cached_schema.schema_content).unwrap()
            ))
        }
        None => {
            println!(
                "No cached schema found for {} {}, fetching ...",
                chart_name, chart_version
            );
            None
        }
    }
}

/// Get list of available Helm repositories and check if the requested repo exists.
///
/// Runs `helm repo list` via the provided `shell` extension, parses the
/// command output, collects repository names into a vector and determines
/// whether `requested_repo` is present in that list. The function returns
/// the list of discovered repositories along with a boolean indicating
/// presence of the requested repository.
///
/// # Parameters
/// - `app`: Tauri AppHandle used to execute the `helm` command asynchronously.
/// - `requested_repo`: repository name to check for presence in the list.
///
/// # Returns
/// `(Vec<String>, bool)` where the first element is the list of repository
/// names and the second element is `true` if `requested_repo` was found.
pub async fn get_available_repos(
    app: &tauri::AppHandle,
    requested_repo: &str,
) -> (Vec<String>, bool) {
    let shell = app.shell();
    let repo_list_output = shell.command("helm").args(["repo", "list"]).output().await;

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
