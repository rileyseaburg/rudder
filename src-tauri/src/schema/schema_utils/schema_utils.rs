//! Schema utils module
//!
//! This module was automatically extracted by Rusty Refactor.
//!
//! Utility helpers for working with chart schemas, including discovering
//! available Helm repositories, creating an empty JSON schema object, and
//! caching an empty schema for a chart.

use crate::{DbConnection, db::schemas};
use tauri_plugin_shell::ShellExt;

/// Get list of available Helm repositories and check if the requested repo exists
///
/// This function runs `helm repo list` via the provided shell interface,
/// parses the output, and returns a tuple:
/// - A vector of repository names discovered in the helm repo list output.
/// - A boolean indicating whether `requested_repo` was found among them.
///
/// Parameters:
/// - `app`: Tauri AppHandle used to run the `helm` command.
/// - `requested_repo`: The repository name to check for existence.
///
/// Returns:
/// - `(Vec<String>, bool)` where the vector contains the discovered repo names and
///   the boolean is true if `requested_repo` was present.
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

/// Create an empty schema JSON object
///
/// Returns a `serde_json::Value` representing an empty object schema with
/// an empty `properties` object and `type` set to `"object"`.
pub fn create_empty_schema() -> serde_json::Value {
    serde_json::json!({
        "properties": {},
        "type": "object"
    })
}

/// Cache and return an empty schema
///
/// This helper constructs an empty schema, stores it using
/// `schemas::store_chart_schema`, and returns the serialized JSON string on
/// success.
///
/// Parameters:
/// - `db`: Database connection reference used by the storage function.
/// - `chart_name`: The chart name to associate the schema with.
/// - `chart_version`: The chart version to associate the schema with.
/// - `repo_name`: The repository name to associate the schema with.
/// - `namespace`: Optional namespace to associate the schema with.
///
/// Returns:
/// - `Ok(String)` containing the serialized empty schema on success.
/// - `Err(String)` forwarded from the storage function on failure.
fn cache_and_return_empty_schema(
    db: &tauri::State<'_, DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
    namespace: Option<&str>,
) -> Result<String, String> {
    let empty_schema = create_empty_schema();

    schemas::store_chart_schema(
        db,
        chart_name,
        chart_version,
        repo_name,
        namespace,
        &empty_schema,
    )?;

    Ok(serde_json::to_string(&empty_schema).unwrap())
}
