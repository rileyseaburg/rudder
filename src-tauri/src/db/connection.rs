use rusqlite::{Connection, Result};
use std::sync::{Arc, Mutex};
use tauri::State;

pub type DbConnection = Arc<Mutex<Connection>>;

pub fn init_database() -> Result<Connection> {
    // Store database in OS-specific app data directory to prevent rebuilds
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("rudder");
    
    std::fs::create_dir_all(&app_data_dir)
        .expect("Failed to create app data directory");
    
    let db_path = app_data_dir.join("rudder.db");
    let conn = Connection::open(db_path)?;
    
    // Create chart_schemas table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chart_schemas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chart_name TEXT NOT NULL,
            chart_version TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            namespace TEXT,
            schema_content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(chart_name, chart_version, repo_name)
        )",
        [],
    )?;
    
    // Create index for faster lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chart_schema_lookup 
         ON chart_schemas (chart_name, chart_version, repo_name)",
        [],
    )?;

    Ok(conn)
}

pub fn get_db_connection(state: &State<DbConnection>) -> Result<Arc<Mutex<Connection>>, String> {
    Ok(state.inner().clone())
}