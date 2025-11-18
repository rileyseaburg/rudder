//! Chart search module
//!
//! Utilities to locate a Helm chart in a repository, pull it to a temporary
//! location, and extract the chart's JSON schema (values.schema.json) if present.

use crate::schema::chart_operations::pull_chart_and_extract_schema;
use crate::schema::utils::is_network_error;
use tauri_plugin_shell::ShellExt;

/// Try all repositories to find a chart and its schema
pub async fn try_all_repos_for_chart(
    app: &tauri::AppHandle,
    repos: &[String],
    chart_name: &str,
    chart_version: &str,
) -> Result<serde_json::Value, String> {
    let mut last_error = String::new();

    for current_repo in repos {
        match try_repo_for_chart(app, current_repo, chart_name, chart_version).await {
            Ok(schema) => return Ok(schema),
            Err(e) => {
                if is_network_error(&e) {
                    return Err(e);
                }
                last_error = e;
            }
        }
    }

    Err(last_error)
}

/// Try to find and pull a chart from a specific repository
pub async fn try_repo_for_chart(
    app: &tauri::AppHandle,
    repo_name: &str,
    chart_name: &str,
    chart_version: &str,
) -> Result<serde_json::Value, String> {
    let shell = app.shell();
    // First, check if the chart is available in this repo
    let search_output = shell
        .command("helm")
        .args([
            "search",
            "repo",
            &format!("{}/{}", repo_name, chart_name),
            "--version",
            chart_version,
            "-o",
            "json",
        ])
        .output()
        .await;

    match search_output {
        Ok(result) if result.status.success() => {
            // Chart found in repo, now try to pull it to get the schema
            pull_chart_and_extract_schema(app, repo_name, chart_name, chart_version).await
        }
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            Err(format!(
                "Chart {}/{} version {} not found in repository: {}",
                repo_name, chart_name, chart_version, stderr
            ))
        }
        Err(e) => Err(format!("Failed to execute helm search: {}", e)),
    }
}