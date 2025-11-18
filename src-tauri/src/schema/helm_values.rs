//! Helm values schema generation module
//!
//! Generate JSON schema from deployed Helm release values

use tauri_plugin_shell::ShellExt;

/// Generate a JSON schema from the current Helm release values
pub async fn generate_schema_from_helm_values(
    app: &tauri::AppHandle,
    release_name: &str,
    namespace: &str,
) -> Result<serde_json::Value, String> {
    println!("Attempting to generate schema from helm values for {}/{}", namespace, release_name);
    let shell = app.shell();
    
    // Get current values from the deployed release
    let output = shell
        .command("helm")
        .args([
            "get",
            "values",
            release_name,
            "-n",
            namespace,
            "-o",
            "json",
        ])
        .output()
        .await;
        
    let output = match output {
        Ok(output) => output,
        Err(e) => {
            println!("Failed to execute helm get values command: {}", e);
            return Err(format!("Failed to get helm values: {}", e));
        }
    };
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("Helm get values command failed with output: {}", stderr);
        return Err(format!("Failed to get helm values: {}", stderr));
    }

    let values_json = String::from_utf8_lossy(&output.stdout);
    let values: serde_json::Value = serde_json::from_str(&values_json)
        .map_err(|e| format!("Failed to parse helm values: {}", e))?;

    // Generate schema from the values
    let schema = generate_schema_from_value(&values);
    
    Ok(serde_json::json!({
        "type": "object",
        "properties": schema,
    }))
}

/// Recursively generate schema properties from a JSON value
fn generate_schema_from_value(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut properties = serde_json::Map::new();
            
            for (key, val) in map {
                let prop_schema = match val {
                    serde_json::Value::String(_) => serde_json::json!({
                        "type": "string",
                        "default": val
                    }),
                    serde_json::Value::Number(_) => {
                        if val.as_i64().is_some() {
                            serde_json::json!({
                                "type": "integer",
                                "default": val
                            })
                        } else {
                            serde_json::json!({
                                "type": "number",
                                "default": val
                            })
                        }
                    },
                    serde_json::Value::Bool(_) => serde_json::json!({
                        "type": "boolean",
                        "default": val
                    }),
                    serde_json::Value::Array(arr) => {
                        if arr.is_empty() {
                            serde_json::json!({
                                "type": "array",
                                "items": { "type": "string" },
                                "default": val
                            })
                        } else {
                            let item_schema = generate_schema_from_value(&arr[0]);
                            serde_json::json!({
                                "type": "array",
                                "items": item_schema,
                                "default": val
                            })
                        }
                    },
                    serde_json::Value::Object(_) => {
                        let nested_schema = generate_schema_from_value(val);
                        serde_json::json!({
                            "type": "object",
                            "properties": nested_schema,
                            "default": val
                        })
                    },
                    serde_json::Value::Null => serde_json::json!({
                        "type": "string",
                        "default": null
                    }),
                };
                
                properties.insert(key.clone(), prop_schema);
            }
            
            serde_json::Value::Object(properties)
        }
        _ => serde_json::json!({})
    }
}