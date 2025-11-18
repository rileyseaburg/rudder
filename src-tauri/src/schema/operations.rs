//! Chart operations module
//!
//! Utilities for pulling Helm charts and extracting their schemas

use crate::schema::schema_utils::create_empty_schema;
use tauri_plugin_shell::ShellExt;

/// Pull a chart and extract its schema
pub async fn pull_chart_and_extract_schema(
    app: &tauri::AppHandle,
    repo_name: &str,
    chart_name: &str,
    chart_version: &str,
) -> Result<serde_json::Value, String> {
    // Get the shell
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