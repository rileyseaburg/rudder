use std::sync::{Arc, Mutex};
use tauri_plugin_shell::ShellExt;

pub mod db;
pub mod run;
pub mod schema;
use db::connection::DbConnection;
use db::schemas;

pub use run::run;
pub use schema::main::get_schema_for_chart;
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn list_helm_releases(app: tauri::AppHandle) -> Result<String, String> {
    // Get the shell plugin
    let shell = app.shell();

    // Run the helm command
    let output = shell
        .command("helm")
        .args(["ls", "-A", "-o", "json"]) // List all, all-namespaces, output as JSON
        .output()
        .await
        .map_err(|e| format!("Helm command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm command failed with non-UTF8 error".into()));
    }

    // Return the raw JSON string
    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}



// Helper function to flatten JSON into --set arguments
fn json_to_set_args(prefix: &str, value: &serde_json::Value, args: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map {
                let new_prefix = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", prefix, key)
                };
                json_to_set_args(&new_prefix, val, args);
            }
        }
        serde_json::Value::Array(arr) => {
            for (i, val) in arr.iter().enumerate() {
                let new_prefix = format!("{}[{}]", prefix, i);
                json_to_set_args(&new_prefix, val, args);
            }
        }
        serde_json::Value::String(s) => {
            args.push("--set".into());
            args.push(format!("{}={}", prefix, s));
        }
        serde_json::Value::Number(n) => {
            args.push("--set".into());
            args.push(format!("{}={}", prefix, n));
        }
        serde_json::Value::Bool(b) => {
            args.push("--set".into());
            args.push(format!("{}={}", prefix, b));
        }
        serde_json::Value::Null => {
            args.push("--set".into());
            args.push(format!("{}=null", prefix));
        }
    }
}

#[tauri::command]
async fn set_kubeconfig(config_text: String) -> Result<(), String> {
    use std::env;
    use std::fs;

    // Create kubeconfig directory if it doesn't exist
    let kube_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?
        .join(".kube");

    fs::create_dir_all(&kube_dir)
        .map_err(|e| format!("Failed to create .kube directory: {}", e))?;

    // Write kubeconfig file
    let kubeconfig_path = kube_dir.join("config");
    fs::write(&kubeconfig_path, config_text)
        .map_err(|e| format!("Failed to write kubeconfig: {}", e))?;

    // Set KUBECONFIG environment variable
    env::set_var(
        "KUBECONFIG",
        kubeconfig_path
            .to_str()
            .ok_or_else(|| "Invalid path".to_string())?,
    );

    Ok(())
}

#[tauri::command]
async fn helm_upgrade(
    app: tauri::AppHandle,
    release_name: String,
    chart_path: String,
    values_json: String,
) -> Result<String, String> {
    let shell = app.shell();

    // Parse the form data
    let values: serde_json::Value =
        serde_json::from_str(&values_json).map_err(|e| format!("Invalid JSON values: {}", e))?;

    // Build the --set arguments
    let mut set_args: Vec<String> = Vec::new();
    json_to_set_args("", &values, &mut set_args);

    // Build and run the command
    let mut args = vec![
        "upgrade".to_string(),
        "--install".to_string(),
        release_name,
        chart_path,
    ];
    args.extend(set_args);

    let output = shell
        .command("helm")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Helm command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm command failed with non-UTF8 error".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}


#[tauri::command]
async fn list_cached_schemas(db: tauri::State<'_, DbConnection>) -> Result<Vec<crate::db::schemas::ChartSchema>, String> {
    schemas::list_cached_schemas(&db)
}

#[tauri::command]
async fn clear_schema_cache(db: tauri::State<'_, DbConnection>) -> Result<String, String> {
    match schemas::clear_all_schemas(&db) {
        Ok(count) => Ok(format!("Cleared {} schema cache entries", count)),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn delete_schema_cache_entry(
    chart_name: String,
    chart_version: String,
    repo_name: String,
    db: tauri::State<'_, DbConnection>,
) -> Result<String, String> {
    match schemas::delete_chart_schema(&db, &chart_name, &chart_version, &repo_name) {
        Ok(_) => Ok(format!(
            "Cache entry removed for {}/{} from {}",
            chart_name, chart_version, repo_name
        )),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn get_helm_history(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("helm")
        .args(["history", &release_name, "-n", &namespace, "-o", "json"])
        .output()
        .await
        .map_err(|e| format!("Helm history command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm history command failed with non-UTF8 error".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[tauri::command]
async fn helm_rollback(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
    revision: u32,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("helm")
        .args([
            "rollback",
            &release_name,
            &revision.to_string(),
            "-n",
            &namespace,
        ])
        .output()
        .await
        .map_err(|e| format!("Helm rollback command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm rollback command failed with non-UTF8 error".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}
