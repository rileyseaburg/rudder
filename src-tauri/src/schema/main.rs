//! Schema orchestrator module
//!
//! Coordinates schema generation workflow between database, Helm repositories,
//! and deployed release values.

use crate::db::{connection::DbConnection, schemas};
use crate::schema::get_schema_for_chart::{check_cached_schema, cache_and_return_empty_schema};
use crate::schema::search::{try_all_repos_for_chart};
use crate::schema::values::{generate_schema_from_helm_values};
use crate::schema::utils::get_available_repos;

/// Fetch the JSON schema for a Helm chart.
///
/// This Tauri command orchestrates the schema generation process:
/// - First checks the local SQLite cache.
/// - If a cached schema is found, it is returned immediately.
/// - If the cache miss occurs, it tries to locate available Helm repositories.
/// - If a specified repository is found, it pulls the chart and extracts any schema.
/// - If repositories are not found or the chart lacks a schema file,
///   it generates a schema from current deployed values using `helm get values`.
/// - Finally, the schema (or empty schema) is cached for future sessions.
#[tauri::command]
pub async fn get_schema_for_chart(
    chart_name: String,
    chart_version: String,
    repo_name: String,
    namespace: Option<String>,
    release_name: Option<String>,
    app: tauri::AppHandle,
    db: tauri::State<'_, DbConnection>,
) -> Result<String, String> {
    // First check if we have the schema cached in SQLite
    if let Some(result) = check_cached_schema(&db, &chart_name, &chart_version, &repo_name) {
        return result;
    }

    // When schema is not cached, we need to fetch it
    // Get available repositories and check if the requested repo exists
    let (available_repos, requested_repo_exists) = get_available_repos(&app, &repo_name).await;

    // Determine which repos to try
    let repos_to_try = if requested_repo_exists {
        vec![repo_name.clone()]
    } else {
        available_repos
    };

    // If no repositories at all, cache empty schema and return error
    if repos_to_try.is_empty() {
        return cache_and_return_empty_schema(
            &db,
            &chart_name,
            &chart_version,
            "no-repos-available",
            namespace.as_deref(),
        );
    }

    // Try to find the chart in the available repositories
    match try_all_repos_for_chart(&app, &repos_to_try, &chart_name, &chart_version).await {
        Ok(schema) => {
            // Cache the successful schema in SQLite
            schemas::store_chart_schema(
                &db,
                &chart_name,
                &chart_version,
                if repos_to_try.len() == 1 { &repo_name } else { &repos_to_try[0] },
                namespace.as_deref(),
                &schema,
            )?;
            Ok(serde_json::to_string(&schema).unwrap())
        }
        Err(_) => {
            // If we have tried all repositories without success, regenerate from current values
            if let (Some(ref rel_name), Some(ref ns)) = (&release_name, &namespace) {
                println!("Attempting to generate schema from current values for {}/{}", ns, rel_name);
                match generate_schema_from_helm_values(&app, rel_name, ns).await {
                    Ok(generated_schema) => {
                        println!("Generated schema from helm values for {}/{}", ns, rel_name);
                        // Cache the generated schema
                        schemas::store_chart_schema(
                            &db,
                            &chart_name,
                            &chart_version,
                            &repo_name,
                            namespace.as_deref(),
                            &generated_schema,
                        )?;
                        // Return result as this is the final output
                        Ok(serde_json::to_string(&generated_schema).unwrap())
                    }
                    Err(gen_err) => {
                        println!("Failed to generate schema from values for {}/{}: {}", ns, rel_name, gen_err);
                        // Return empty schema as fallback
                        cache_and_return_empty_schema(
                            &db,
                            &chart_name,
                            &chart_version,
                            &repo_name,
                            namespace.as_deref(),
                        )
                    }
                }
            } else {
                // If no release_name and namespace, return empty schema directly
                cache_and_return_empty_schema(
                    &db,
                    &chart_name,
                    &chart_version,
                    &repo_name,
                    namespace.as_deref(),
                )
            }
        }
    }
}