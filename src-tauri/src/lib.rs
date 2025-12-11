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

#[tauri::command]
async fn get_kube_context(app: tauri::AppHandle) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("kubectl")
        .args(["config", "current-context"])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "kubectl command failed with non-UTF8 error".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[tauri::command]
async fn list_kube_contexts(app: tauri::AppHandle) -> Result<String, String> {
    let shell = app.shell();

    // Get all contexts as JSON-like output
    let output = shell
        .command("kubectl")
        .args(["config", "get-contexts", "-o", "name"])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "kubectl command failed".into()));
    }

    let contexts_str = String::from_utf8(output.stdout).unwrap_or_default();
    let contexts: Vec<&str> = contexts_str.lines().filter(|s| !s.is_empty()).collect();
    
    // Get current context
    let current_output = shell
        .command("kubectl")
        .args(["config", "current-context"])
        .output()
        .await
        .ok();
    
    let current_context = current_output
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    // Build JSON response
    let result = serde_json::json!({
        "contexts": contexts,
        "current": current_context,
    });

    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

#[tauri::command]
async fn switch_kube_context(app: tauri::AppHandle, context_name: String) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("kubectl")
        .args(["config", "use-context", &context_name])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Failed to switch context".into()));
    }

    Ok(format!("Switched to context: {}", context_name))
}

#[tauri::command]
async fn get_release_pods(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    // Get pods with the helm release label
    let output = shell
        .command("kubectl")
        .args([
            "get", "pods",
            "-n", &namespace,
            "-l", &format!("app.kubernetes.io/instance={}", release_name),
            "-o", "json",
        ])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        // Try alternative label selector (some charts use different labels)
        let output2 = shell
            .command("kubectl")
            .args([
                "get", "pods",
                "-n", &namespace,
                "-l", &format!("release={}", release_name),
                "-o", "json",
            ])
            .output()
            .await
            .map_err(|e| format!("kubectl command failed: {}", e))?;

        if !output2.status.success() {
            return Err(String::from_utf8(output.stderr)
                .unwrap_or_else(|_| "kubectl command failed".into()));
        }

        return parse_pods_json(&String::from_utf8(output2.stdout).unwrap_or_default());
    }

    parse_pods_json(&String::from_utf8(output.stdout).unwrap_or_default())
}

fn parse_pods_json(json_str: &str) -> Result<String, String> {
    let pods_data: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse pods JSON: {}", e))?;

    let mut pods = Vec::new();
    
    if let Some(items) = pods_data["items"].as_array() {
        for item in items {
            let name = item["metadata"]["name"].as_str().unwrap_or("").to_string();
            let namespace = item["metadata"]["namespace"].as_str().unwrap_or("").to_string();
            let phase = item["status"]["phase"].as_str().unwrap_or("Unknown").to_string();
            
            // Get creation timestamp
            let created = item["metadata"]["creationTimestamp"].as_str().unwrap_or("").to_string();
            
            // Get node name
            let node = item["spec"]["nodeName"].as_str().unwrap_or("").to_string();
            
            // Get pod IP
            let pod_ip = item["status"]["podIP"].as_str().unwrap_or("").to_string();
            
            // Get restart count and ready status from container statuses
            let mut total_restarts = 0;
            let mut ready_containers = 0;
            let mut total_containers = 0;
            let mut container_statuses = Vec::new();
            
            if let Some(statuses) = item["status"]["containerStatuses"].as_array() {
                for status in statuses {
                    total_containers += 1;
                    let container_name = status["name"].as_str().unwrap_or("").to_string();
                    let restart_count = status["restartCount"].as_i64().unwrap_or(0);
                    total_restarts += restart_count;
                    let ready = status["ready"].as_bool().unwrap_or(false);
                    if ready {
                        ready_containers += 1;
                    }
                    
                    // Determine container state
                    let state = if status["state"]["running"].is_object() {
                        "Running".to_string()
                    } else if let Some(waiting) = status["state"]["waiting"].as_object() {
                        let reason = waiting.get("reason")
                            .and_then(|r| r.as_str())
                            .unwrap_or("Waiting");
                        reason.to_string()
                    } else if let Some(terminated) = status["state"]["terminated"].as_object() {
                        let reason = terminated.get("reason")
                            .and_then(|r| r.as_str())
                            .unwrap_or("Terminated");
                        reason.to_string()
                    } else {
                        "Unknown".to_string()
                    };
                    
                    container_statuses.push(serde_json::json!({
                        "name": container_name,
                        "ready": ready,
                        "restartCount": restart_count,
                        "state": state,
                    }));
                }
            }
            
            // Collect container names from spec
            let mut containers = Vec::new();
            if let Some(container_specs) = item["spec"]["containers"].as_array() {
                for container in container_specs {
                    if let Some(container_name) = container["name"].as_str() {
                        containers.push(container_name.to_string());
                    }
                }
            }
            
            // Get conditions
            let mut conditions = Vec::new();
            if let Some(conds) = item["status"]["conditions"].as_array() {
                for cond in conds {
                    let cond_type = cond["type"].as_str().unwrap_or("").to_string();
                    let cond_status = cond["status"].as_str().unwrap_or("").to_string();
                    let reason = cond["reason"].as_str().unwrap_or("").to_string();
                    let message = cond["message"].as_str().unwrap_or("").to_string();
                    let last_transition = cond["lastTransitionTime"].as_str().unwrap_or("").to_string();
                    
                    conditions.push(serde_json::json!({
                        "type": cond_type,
                        "status": cond_status,
                        "reason": reason,
                        "message": message,
                        "lastTransitionTime": last_transition,
                    }));
                }
            }
            
            // Determine overall status string (more detailed than phase)
            let status = if phase == "Running" && ready_containers == total_containers && total_containers > 0 {
                "Running".to_string()
            } else if phase == "Running" && ready_containers < total_containers {
                format!("Running ({}/{})", ready_containers, total_containers)
            } else if phase == "Pending" {
                // Check for specific pending reasons from container statuses
                let mut pending_reason = phase.clone();
                if let Some(statuses) = item["status"]["containerStatuses"].as_array() {
                    if let Some(first_status) = statuses.first() {
                        if let Some(waiting) = first_status["state"]["waiting"].as_object() {
                            if let Some(reason) = waiting.get("reason").and_then(|r| r.as_str()) {
                                pending_reason = reason.to_string();
                            }
                        }
                    }
                }
                pending_reason
            } else {
                phase.clone()
            };
            
            pods.push(serde_json::json!({
                "name": name,
                "namespace": namespace,
                "status": status,
                "phase": phase,
                "containers": containers,
                "containerStatuses": container_statuses,
                "readyContainers": ready_containers,
                "totalContainers": total_containers,
                "restarts": total_restarts,
                "created": created,
                "node": node,
                "podIP": pod_ip,
                "conditions": conditions,
            }));
        }
    }

    Ok(serde_json::to_string(&pods).unwrap_or_else(|_| "[]".to_string()))
}

#[tauri::command]
async fn get_pod_logs(
    app: tauri::AppHandle,
    pod_name: String,
    namespace: String,
    container: Option<String>,
    tail_lines: Option<u32>,
    timestamps: Option<bool>,
) -> Result<String, String> {
    let shell = app.shell();

    let mut args = vec![
        "logs".to_string(),
        pod_name,
        "-n".to_string(),
        namespace,
    ];

    if let Some(c) = container {
        args.push("-c".to_string());
        args.push(c);
    }

    if let Some(lines) = tail_lines {
        args.push("--tail".to_string());
        args.push(lines.to_string());
    }

    if timestamps.unwrap_or(false) {
        args.push("--timestamps".to_string());
    }

    let output = shell
        .command("kubectl")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("kubectl logs command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "kubectl logs command failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[tauri::command]
async fn diagnose_release(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();
    
    // Get pods for the release
    let pods_output = shell
        .command("kubectl")
        .args([
            "get", "pods",
            "-n", &namespace,
            "-l", &format!("app.kubernetes.io/instance={}", release_name),
            "-o", "json",
        ])
        .output()
        .await;

    let pods_json = match pods_output {
        Ok(output) if output.status.success() => {
            String::from_utf8(output.stdout).unwrap_or_default()
        }
        _ => {
            // Try alternative label
            let output2 = shell
                .command("kubectl")
                .args([
                    "get", "pods",
                    "-n", &namespace,
                    "-l", &format!("release={}", release_name),
                    "-o", "json",
                ])
                .output()
                .await
                .map_err(|e| format!("kubectl command failed: {}", e))?;
            
            String::from_utf8(output2.stdout).unwrap_or_default()
        }
    };

    let pods_data: serde_json::Value = serde_json::from_str(&pods_json)
        .unwrap_or(serde_json::json!({"items": []}));

    let mut pod_diagnostics = Vec::new();
    let mut release_issues: Vec<serde_json::Value> = Vec::new();

    if let Some(items) = pods_data["items"].as_array() {
        for item in items {
            let pod_name = item["metadata"]["name"].as_str().unwrap_or("").to_string();
            let phase = item["status"]["phase"].as_str().unwrap_or("Unknown").to_string();
            
            // Get container statuses
            let container_statuses = item["status"]["containerStatuses"].as_array();
            let mut ready_count = 0;
            let mut total_count = 0;
            let mut restarts = 0;
            let mut issues: Vec<serde_json::Value> = Vec::new();

            if let Some(statuses) = container_statuses {
                total_count = statuses.len();
                for status in statuses {
                    if status["ready"].as_bool().unwrap_or(false) {
                        ready_count += 1;
                    }
                    restarts += status["restartCount"].as_i64().unwrap_or(0);

                    // Check for waiting state issues
                    if let Some(waiting) = status["state"]["waiting"].as_object() {
                        let reason = waiting.get("reason").and_then(|r| r.as_str()).unwrap_or("");
                        let message = waiting.get("message").and_then(|m| m.as_str()).unwrap_or("");
                        
                        let issue = diagnose_waiting_state(reason, message);
                        if let Some(i) = issue {
                            issues.push(i);
                        }
                    }

                    // Check for terminated state issues
                    if let Some(terminated) = status["state"]["terminated"].as_object() {
                        let reason = terminated.get("reason").and_then(|r| r.as_str()).unwrap_or("");
                        let exit_code = terminated.get("exitCode").and_then(|e| e.as_i64()).unwrap_or(0);
                        
                        let issue = diagnose_terminated_state(reason, exit_code);
                        if let Some(i) = issue {
                            issues.push(i);
                        }
                    }

                    // Check last terminated state for crash loops
                    if let Some(last_state) = status["lastState"]["terminated"].as_object() {
                        let reason = last_state.get("reason").and_then(|r| r.as_str()).unwrap_or("");
                        if reason == "OOMKilled" {
                            issues.push(serde_json::json!({
                                "severity": "error",
                                "title": "Container was OOMKilled",
                                "description": "The container was terminated because it exceeded its memory limit.",
                                "solutions": [
                                    {
                                        "title": "Increase memory limits",
                                        "description": "Update Helm values to increase container memory limit",
                                        "command": "helm upgrade {release} <chart> --set resources.limits.memory=512Mi -n {namespace}"
                                    },
                                    {
                                        "title": "Check memory usage",
                                        "description": "Monitor actual memory usage to set appropriate limits",
                                        "command": "kubectl top pod {pod} -n {namespace}"
                                    }
                                ]
                            }));
                        }
                    }
                }
            }

            // Check for high restart count
            if restarts > 5 {
                issues.push(serde_json::json!({
                    "severity": "warning",
                    "title": format!("High restart count: {}", restarts),
                    "description": "This pod has restarted many times, indicating instability.",
                    "solutions": [
                        {
                            "title": "Check pod logs",
                            "description": "Review logs to identify crash causes",
                            "action": "describe"
                        },
                        {
                            "title": "Check previous logs",
                            "description": "View logs from previous container instance",
                            "command": "kubectl logs {pod} -n {namespace} --previous"
                        }
                    ]
                }));
            }

            // Check pending state
            if phase == "Pending" {
                // Get events for more context
                let events_output = shell
                    .command("kubectl")
                    .args([
                        "get", "events",
                        "-n", &namespace,
                        "--field-selector", &format!("involvedObject.name={}", pod_name),
                        "-o", "json",
                    ])
                    .output()
                    .await;

                if let Ok(output) = events_output {
                    if output.status.success() {
                        let events_json = String::from_utf8(output.stdout).unwrap_or_default();
                        if let Ok(events) = serde_json::from_str::<serde_json::Value>(&events_json) {
                            if let Some(event_items) = events["items"].as_array() {
                                for event in event_items {
                                    let reason = event["reason"].as_str().unwrap_or("");
                                    let message = event["message"].as_str().unwrap_or("");
                                    
                                    if reason.contains("FailedScheduling") {
                                        issues.push(serde_json::json!({
                                            "severity": "error",
                                            "title": "Pod cannot be scheduled",
                                            "description": message,
                                            "solutions": [
                                                {
                                                    "title": "Check node resources",
                                                    "description": "Verify nodes have enough CPU/memory",
                                                    "command": "kubectl describe nodes | grep -A5 \"Allocated resources\""
                                                },
                                                {
                                                    "title": "Check PVCs",
                                                    "description": "Verify PersistentVolumeClaims are bound",
                                                    "command": "kubectl get pvc -n {namespace}"
                                                }
                                            ]
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Calculate age
            let creation_time = item["metadata"]["creationTimestamp"].as_str().unwrap_or("");
            let age = calculate_age(creation_time);

            pod_diagnostics.push(serde_json::json!({
                "name": pod_name,
                "status": phase,
                "ready": format!("{}/{}", ready_count, total_count),
                "restarts": restarts,
                "age": age,
                "issues": issues,
            }));
        }
    }

    // Check for missing pods (no replicas)
    if pod_diagnostics.is_empty() {
        release_issues.push(serde_json::json!({
            "severity": "warning",
            "title": "No pods found for this release",
            "description": "The release may have 0 replicas or incorrect labels.",
            "solutions": [
                {
                    "title": "Check deployment",
                    "description": "Verify the deployment exists and has replicas",
                    "command": "kubectl get deployments -n {namespace} -l app.kubernetes.io/instance={release}"
                },
                {
                    "title": "Check Helm values",
                    "description": "Ensure replicaCount is set correctly",
                    "command": "helm get values {release} -n {namespace}"
                }
            ]
        }));
    }

    Ok(serde_json::to_string(&serde_json::json!({
        "pods": pod_diagnostics,
        "releaseIssues": release_issues,
    })).unwrap())
}

fn diagnose_waiting_state(reason: &str, message: &str) -> Option<serde_json::Value> {
    match reason {
        "CrashLoopBackOff" => Some(serde_json::json!({
            "severity": "error",
            "title": "Container is crash-looping",
            "description": "The container keeps crashing and Kubernetes is backing off restart attempts.",
            "solutions": [
                {
                    "title": "Check container logs",
                    "description": "View logs to see what error is causing the crash",
                    "action": "describe"
                },
                {
                    "title": "Check previous container logs",
                    "description": "View logs from the previous crashed instance",
                    "command": "kubectl logs {pod} -n {namespace} --previous"
                },
                {
                    "title": "Check resource limits",
                    "description": "Container might be OOMKilled due to memory limits",
                    "command": "kubectl describe pod {pod} -n {namespace} | grep -A5 \"Last State\""
                }
            ]
        })),
        "ImagePullBackOff" | "ErrImagePull" => Some(serde_json::json!({
            "severity": "error",
            "title": "Cannot pull container image",
            "description": format!("Failed to pull image: {}", message),
            "solutions": [
                {
                    "title": "Check image name",
                    "description": "Verify the image name and tag are correct",
                    "command": "kubectl get pod {pod} -n {namespace} -o jsonpath='{.spec.containers[*].image}'"
                },
                {
                    "title": "Check pull secrets",
                    "description": "Verify imagePullSecrets for private registries",
                    "command": "kubectl get pod {pod} -n {namespace} -o jsonpath='{.spec.imagePullSecrets}'"
                }
            ]
        })),
        "CreateContainerConfigError" => Some(serde_json::json!({
            "severity": "error",
            "title": "Container configuration error",
            "description": format!("Config error: {}", message),
            "solutions": [
                {
                    "title": "Check ConfigMaps",
                    "description": "Verify referenced ConfigMaps exist",
                    "command": "kubectl get configmaps -n {namespace}"
                },
                {
                    "title": "Check Secrets",
                    "description": "Verify referenced Secrets exist",
                    "command": "kubectl get secrets -n {namespace}"
                }
            ]
        })),
        "ContainerCreating" => Some(serde_json::json!({
            "severity": "info",
            "title": "Container is being created",
            "description": "This may take a moment, especially for large images.",
            "solutions": [
                {
                    "title": "Check events",
                    "description": "View pod events for more details",
                    "command": "kubectl describe pod {pod} -n {namespace} | grep -A10 Events"
                }
            ]
        })),
        _ => None,
    }
}

fn diagnose_terminated_state(reason: &str, exit_code: i64) -> Option<serde_json::Value> {
    match reason {
        "OOMKilled" => Some(serde_json::json!({
            "severity": "error",
            "title": "Container killed: Out of Memory",
            "description": "The container exceeded its memory limit.",
            "solutions": [
                {
                    "title": "Increase memory limits",
                    "description": "Update Helm values to increase memory",
                    "command": "helm upgrade {release} <chart> --set resources.limits.memory=1Gi -n {namespace}"
                }
            ]
        })),
        "Error" if exit_code != 0 => Some(serde_json::json!({
            "severity": "error",
            "title": format!("Container exited with code {}", exit_code),
            "description": "The container terminated with an error.",
            "solutions": [
                {
                    "title": "Check logs",
                    "description": "View container logs for error details",
                    "command": "kubectl logs {pod} -n {namespace} --previous"
                }
            ]
        })),
        _ => None,
    }
}

fn calculate_age(timestamp: &str) -> String {
    // Parse ISO 8601 timestamp
    if timestamp.is_empty() {
        return "Unknown".to_string();
    }

    // Simplified age display - in production use chrono crate for accuracy
    "Recently".to_string()
}

#[tauri::command]
async fn restart_deployment(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("kubectl")
        .args([
            "rollout", "restart",
            "deployment",
            "-n", &namespace,
            "-l", &format!("app.kubernetes.io/instance={}", release_name),
        ])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Restart failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_else(|_| "Deployment restarted".into()))
}

#[tauri::command]
async fn delete_failed_pods(
    app: tauri::AppHandle,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("kubectl")
        .args([
            "delete", "pods",
            "-n", &namespace,
            "--field-selector=status.phase=Failed",
        ])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Delete failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_else(|_| "Failed pods deleted".into()))
}

#[tauri::command]
async fn describe_pod(
    app: tauri::AppHandle,
    pod_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("kubectl")
        .args(["describe", "pod", &pod_name, "-n", &namespace])
        .output()
        .await
        .map_err(|e| format!("kubectl command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Describe failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[tauri::command]
async fn helm_dry_run(
    app: tauri::AppHandle,
    release_name: String,
    chart_path: String,
    namespace: String,
    values_json: String,
) -> Result<String, String> {
    let shell = app.shell();

    // Parse the form data
    let values: serde_json::Value =
        serde_json::from_str(&values_json).map_err(|e| format!("Invalid JSON values: {}", e))?;

    // Build the --set arguments
    let mut set_args: Vec<String> = Vec::new();
    json_to_set_args("", &values, &mut set_args);

    // Build and run the command with --dry-run flag
    let mut args = vec![
        "upgrade".to_string(),
        "--install".to_string(),
        release_name,
        chart_path,
        "-n".to_string(),
        namespace,
        "--dry-run".to_string(),
    ];
    args.extend(set_args);

    let output = shell
        .command("helm")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Helm dry-run command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm dry-run command failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[tauri::command]
async fn get_release_values(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("helm")
        .args(["get", "values", &release_name, "-n", &namespace, "-o", "yaml"])
        .output()
        .await
        .map_err(|e| format!("Helm get values command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm get values command failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[tauri::command]
async fn get_release_manifest(
    app: tauri::AppHandle,
    release_name: String,
    namespace: String,
) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("helm")
        .args(["get", "manifest", &release_name, "-n", &namespace])
        .output()
        .await
        .map_err(|e| format!("Helm get manifest command failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "Helm get manifest command failed".into()));
    }

    Ok(String::from_utf8(output.stdout).unwrap_or_default())
}

#[derive(serde::Serialize)]
struct ShellCommandResult {
    output: String,
    exit_code: i32,
}

#[tauri::command]
async fn run_shell_command(
    app: tauri::AppHandle,
    command: String,
    context: Option<String>,
) -> Result<ShellCommandResult, String> {
    let shell = app.shell();

    // Security: Only allow kubectl and helm commands
    let trimmed = command.trim();
    if !trimmed.starts_with("kubectl") && !trimmed.starts_with("helm") {
        return Err("Only kubectl and helm commands are allowed".into());
    }

    // Parse the command into parts
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".into());
    }

    let program = parts[0];
    let mut args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();

    // If a context is specified and the command is kubectl, add --context flag
    if let Some(ctx) = context {
        if program == "kubectl" && !args.iter().any(|a| a == "--context") {
            args.insert(0, format!("--context={}", ctx));
        }
    }

    let output = shell
        .command(program)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Command failed: {}", e))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Combine stdout and stderr for display
    let combined_output = if stderr.is_empty() {
        stdout.to_string()
    } else if stdout.is_empty() {
        stderr.to_string()
    } else {
        format!("{}\n{}", stdout, stderr)
    };

    Ok(ShellCommandResult {
        output: combined_output,
        exit_code,
    })
}

#[tauri::command]
async fn exec_in_pod(
    app: tauri::AppHandle,
    pod_name: String,
    namespace: String,
    container: Option<String>,
    command: String,
) -> Result<ShellCommandResult, String> {
    let shell = app.shell();

    // Build kubectl exec command
    let mut args = vec![
        "exec".to_string(),
        pod_name,
        "-n".to_string(),
        namespace,
    ];

    // Add container if specified
    if let Some(cont) = container {
        args.push("-c".to_string());
        args.push(cont);
    }

    // Add the command to execute
    args.push("--".to_string());
    args.push("sh".to_string());
    args.push("-c".to_string());
    args.push(command);

    let output = shell
        .command("kubectl")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("kubectl exec failed: {}", e))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let combined_output = if stderr.is_empty() {
        stdout.to_string()
    } else if stdout.is_empty() {
        stderr.to_string()
    } else {
        format!("{}\n{}", stdout, stderr)
    };

    Ok(ShellCommandResult {
        output: combined_output,
        exit_code,
    })
}
