//! Chart service module
//!
//! This module was automatically extracted by Rusty Refactor.
//!
//! Responsibilities:
//! - Locate a Helm chart across configured repositories.
//! - Pull chart archives to extract a JSON schema from `values.schema.json`.
//! - Cache retrieved schemas in the application's SQLite store to avoid repeated pulls.
//! - Provide a top-level Tauri command to request a chart schema from the frontend.

// Re-export all public items from get_schema_for_chart module
pub use super::get_schema_for_chart::*;

/// Try to find and pull a chart from a specific repository
///
/// Parameters:
/// - `app`: Tauri AppHandle used to run shell commands.
/// - `repo_name`: repository name to search and pull from.
/// - `chart_name`: name of the Helm chart.
/// - `chart_version`: desired chart version.
///
/// Returns:
/// - `Ok(serde_json::Value)` with the parsed JSON schema when found and extracted successfully.
/// - `Err(String)` with a human-readable error message on failure.
pub async fn try_repo_for_chart(
    app: &tauri::AppHandle,
    repo_name: &str,
    chart_name: &str,
    chart_version: &str,
) -> Result<serde_json::Value, String> {
    super::get_schema_for_chart::try_repo_for_chart(app, repo_name, chart_name, chart_version).await
}

/// Try all repositories to find a chart and its schema
///
/// This function iterates the provided list of repository names and attempts to locate the
/// requested chart/version in each by delegating to `try_repo_for_chart`.
///
/// Parameters:
/// - `app`: Tauri AppHandle used to run shell commands.
/// - `repos`: slice of repository names to try (in order).
/// - `chart_name`: name of the Helm chart.
/// - `chart_version`: desired chart version.
///
/// Returns:
/// - `Ok(serde_json::Value)` with the parsed JSON schema when any repository succeeds.
/// - `Err(String)` with the last non-network error encountered, or a network error immediately.
pub async fn try_all_repos_for_chart(
    app: &tauri::AppHandle,
    repos: &[String],
    chart_name: &str,
    chart_version: &str,
) -> Result<serde_json::Value, String> {
    super::get_schema_for_chart::try_all_repos_for_chart(app, repos, chart_name, chart_version).await
}

// This module now delegates to get_schema_for_chart module for all functionality
