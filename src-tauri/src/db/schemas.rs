use super::connection::DbConnection;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartSchema {
    pub chart_name: String,
    pub chart_version: String,
    pub repo_name: String,
    pub namespace: Option<String>,
    pub schema_content: serde_json::Value,
    pub created_at: Option<String>,
}

pub fn store_chart_schema(
    db: &State<DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
    namespace: Option<&str>,
    schema_content: &serde_json::Value,
) -> Result<(), String> {
    let conn = db
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    let schema_json = serde_json::to_string(schema_content)
        .map_err(|e| format!("Failed to serialize schema: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO chart_schemas 
         (chart_name, chart_version, repo_name, namespace, schema_content) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![chart_name, chart_version, repo_name, namespace, schema_json],
    )
    .map_err(|e| format!("Failed to store schema: {}", e))?;

    Ok(())
}

pub fn get_chart_schema(
    db: &State<DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
) -> Result<Option<ChartSchema>, String> {
    let conn = db
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT chart_name, chart_version, repo_name, namespace, schema_content, created_at 
         FROM chart_schemas 
         WHERE chart_name = ?1 AND chart_version = ?2 AND repo_name = ?3",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let schema_iter = stmt
        .query_map(params![chart_name, chart_version, repo_name], |row| {
            let schema_json: String = row.get(4)?;
            let schema_content: serde_json::Value =
                serde_json::from_str(&schema_json).map_err(|_| {
                    rusqlite::Error::InvalidColumnType(
                        4,
                        "schema_content".to_string(),
                        rusqlite::types::Type::Text,
                    )
                })?;

            Ok(ChartSchema {
                chart_name: row.get(0)?,
                chart_version: row.get(1)?,
                repo_name: row.get(2)?,
                namespace: row.get(3)?,
                schema_content,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;

    Ok(schema_iter.into_iter().next())
}

pub fn list_cached_schemas(db: &State<DbConnection>) -> Result<Vec<ChartSchema>, String> {
    let conn = db
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT chart_name, chart_version, repo_name, namespace, schema_content, created_at 
         FROM chart_schemas 
         ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let schemas = stmt
        .query_map([], |row| {
            let schema_json: String = row.get(4)?;
            let schema_content: serde_json::Value =
                serde_json::from_str(&schema_json).map_err(|_| {
                    rusqlite::Error::InvalidColumnType(
                        4,
                        "schema_content".to_string(),
                        rusqlite::types::Type::Text,
                    )
                })?;

            Ok(ChartSchema {
                chart_name: row.get(0)?,
                chart_version: row.get(1)?,
                repo_name: row.get(2)?,
                namespace: row.get(3)?,
                schema_content,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;

    Ok(schemas)
}

pub fn clear_all_schemas(db: &State<DbConnection>) -> Result<i64, String> {
    let conn = db
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

    let result = conn.execute("DELETE FROM chart_schemas", [])
        .map_err(|e| format!("Failed to clear schemas: {}", e))?;

    Ok(result as i64)
}

pub fn delete_chart_schema(
    db: &State<DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
) -> Result<(), String> {
    let conn = db
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

    conn.execute(
        "DELETE FROM chart_schemas 
         WHERE chart_name = ?1 AND chart_version = ?2 AND repo_name = ?3",
        params![chart_name, chart_version, repo_name],
    )
    .map_err(|e| format!("Failed to delete schema: {}", e))?;

    Ok(())
}
