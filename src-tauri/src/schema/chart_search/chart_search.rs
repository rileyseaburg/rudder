//! Chart search module
//!
//! This module was automatically extracted by Rusty Refactor.
//!
//! Utilities to locate a Helm chart in a repository, pull it to a temporary
//! location, and extract the chart's JSON schema (values.schema.json) if present.
//! The functions in this module rely on the Tauri AppHandle and return either the parsed JSON schema as
//! `serde_json::Value` or a human-readable `String` error.
//!
//! Temporary files are written to and cleaned up from the "temp-charts" folder.
//! If a schema file is missing or cannot be parsed, `create_empty_schema()` is
//! used to provide a fallback empty schema value.

use crate::schema::schema_utils::create_empty_schema;
use tauri_plugin_shell::ShellExt;

/// Pull a chart and extract its schema
///
/// Attempts to pull a chart by invoking `helm pull` via the provided `shell`
/// interface, untarring the chart into the local "temp-charts" directory, and
/// reading the `values.schema.json` file from the pulled chart directory.
///
/// Behavior:
/// - On success, returns the parsed JSON schema as `serde_json::Value`.
/// - If the schema file is missing or cannot be parsed, the function returns
///   the result of `create_empty_schema()`.
/// - The temporary "temp-charts" directory is removed before returning in both
///   success and expected failure cases to avoid leaving artifacts on disk.
/// - If the `helm pull` command fails or cannot be executed, an `Err(String)`
///   describing the failure is returned.
///
/// Parameters:
/// - `shell`: an executor implementing `tauri_plugin_shell::ShellExt` used to
///   run the `helm` command.
/// - `repo_name`: name of the helm repository containing the chart.
/// - `chart_name`: name of the chart to pull.
/// - `chart_version`: specific chart version to pull.
///
/// Returns:
/// - `Ok(serde_json::Value)` containing the chart schema or an empty schema
///   fallback produced by `create_empty_schema()`.
/// - `Err(String)` with a descriptive message if the helm command failed or
///   could not be executed.
pub async fn pull_chart_and_extract_schema(
    app: &tauri::AppHandle,
    repo_name: &str,
    chart_name: &str,
    chart_version: &str,
) -> Result<serde_json::Value, String> {
    let shell = app.shell();
    // Pull the chart
    let pull_output = shell
        .command("helm")
        .args([
            "pull",
            &format!("{}/{}", repo_name, chart_name),
            "--version",
            chart_version,
            "--untar",
            "--destination",
            "temp-charts",
        ])
        .output()
        .await;

    match pull_output {
        Ok(pull_result) if pull_result.status.success() => {
            // Chart pulled, now read the values.schema.json file
            use std::fs;
            use std::path::Path;

            let schema_path = Path::new("temp-charts")
                .join(chart_name)
                .join("values.schema.json");

            match fs::read_to_string(&schema_path) {
                Ok(schema_content) => {
                    // Parse and validate the schema
                    let schema: serde_json::Value = serde_json::from_str(&schema_content)
                        .unwrap_or_else(|_| create_empty_schema());

                    // Clean up the temporary chart directory
                    let _ = fs::remove_dir_all("temp-charts");

                    Ok(schema)
                }
                Err(_) => {
                    // No schema file found, return empty schema
                    // Clean up the temporary chart directory
                    let _ = fs::remove_dir_all("temp-charts");
                    Ok(create_empty_schema())
                }
            }
        }
        Ok(pull_result) => {
            let stderr = String::from_utf8_lossy(&pull_result.stderr);
            Err(format!(
                "Failed to pull chart {}/{} version {}: {}",
                repo_name, chart_name, chart_version, stderr
            ))
        }
        Err(e) => Err(format!("Failed to execute helm pull: {}", e)),
    }
}

/// Try to find and pull a chart from a specific repository
///
/// Uses `helm search repo` to determine whether the specified chart and version
/// exist in the given repository. If the chart is present, this function
/// delegates to `pull_chart_and_extract_schema` to retrieve and parse the
/// chart's `values.schema.json`.
///
/// Behavior:
/// - If the chart is found in the repository, returns the parsed schema or the
///   empty schema fallback.
/// - If the chart is not found or the `helm search` invocation fails, returns
///   an `Err(String)` describing the failure.
///
/// Parameters:
/// - `app`: Tauri AppHandle used to run the `helm` command.
/// - `repo_name`: name of the helm repository to search.
/// - `chart_name`: name of the chart to look for.
/// - `chart_version`: specific chart version to search for.
///
/// Returns:
/// - `Ok(serde_json::Value)` with the chart schema when found.
/// - `Err(String)` when the chart is not found or when command execution fails.
#[allow(dead_code)]
async fn try_repo_for_chart(
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
