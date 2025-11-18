//! Chart cache module
//!
//! Functions for caching chart schemas in database

use crate::db::{connection::DbConnection, schemas};

/// Check if a schema is cached in database and return it if found
pub fn check_cached_schema(
    db: &tauri::State<'_, DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
) -> Option<Result<String, String>> {
    match schemas::get_chart_schema(db, chart_name, chart_version, repo_name).ok()? {
        Some(cached_schema) => {
            println!("Found cached schema for {} {}", chart_name, chart_version);
            
            // Check if the cached schema is empty (has no properties)
            let schema_str = serde_json::to_string(&cached_schema.schema_content).unwrap();
            let schema: serde_json::Value = serde_json::from_str(&schema_str).unwrap();
            
            // Check for empty properties at both potential structures
            if let Some(properties) = schema.get("properties") {
                if let Some(obj) = properties.as_object() {
                    if obj.is_empty() {
                        println!("Cached schema is empty, will try to generate from helm values instead");
                        return None; // Don't return an empty schema, try to generate
                    }
                }
            } else if schema.as_object().map_or(true, |obj| obj.is_empty()) {
                // Direct properties object without wrapper or empty object
                println!("Cached schema is empty or not properly structured, will try to generate from helm values instead");
                return None;
            }
            
            println!("Returning cached schema with {} properties", 
                match schema.get("properties").and_then(|p| p.as_object()) {
                    Some(obj) => obj.len(),
                    None => schema.as_object().map_or(0, |obj| obj.len()),
                });
            Some(Ok(schema_str))
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

/// Cache and return an empty schema
pub fn cache_and_return_empty_schema(
    db: &tauri::State<'_, DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
    namespace: Option<&str>,
) -> Result<String, String> {
    let empty_schema = serde_json::json!({
        "properties": {},
        "type": "object"
    });
    
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