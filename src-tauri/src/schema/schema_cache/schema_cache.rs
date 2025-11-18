//! Schema cache module
//!
//! This module was automatically extracted by Rusty Refactor.

/// Checks whether a schema for the specified chart and repository is present in the database.
/// If a cached schema is found, it is serialized to JSON and returned as Some(Ok(String)).
/// If no cached schema is present, the call returns None and the caller is expected to fetch it.
///
/// Parameters:
/// - db: Reference to a database connection used to query cached schemas.
/// - chart_name: Chart name to look up.
/// - chart_version: Chart version to look up.
/// - repo_name: Repository name to look up.
///
/// Returns:
/// - Some(Ok(json_string)) when a cached schema is found and serialized successfully.
/// - None when there is no cached schema for the requested chart/version/repo.
pub fn check_cached_schema(
    db: &tauri::State<'_, crate::DbConnection>,
    chart_name: &str,
    chart_version: &str,
    repo_name: &str,
) -> Option<Result<String, String>> {
    match crate::db::schemas::get_chart_schema(db, chart_name, chart_version, repo_name).ok()? {
        Some(cached_schema) => {
            println!("Found cached schema for {} {}", chart_name, chart_version);
            Some(Ok(
                serde_json::to_string(&cached_schema.schema_content).unwrap()
            ))
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
