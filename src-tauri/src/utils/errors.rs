/// Unified error type for all FlowDesk operations.
///
/// Implements `serde::Serialize` so it can be returned from Tauri commands
/// and converted to a frontend-consumable error automatically.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A database operation failed.
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    /// The requested entity was not found.
    #[error("Not found: {entity} with id {id}")]
    NotFound {
        /// The type of entity that was not found.
        entity: String,
        /// The identifier that was looked up.
        id: String,
    },

    /// Input validation failed.
    #[error("Validation error: {0}")]
    Validation(String),

    /// A filesystem I/O operation failed.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization or deserialization failed.
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// YAML front matter could not be parsed.
    #[error("Front matter parse error: {0}")]
    FrontMatter(String),

    /// An export operation failed.
    #[error("Export error: {0}")]
    Export(String),

    /// An unexpected internal error occurred.
    #[error("Internal error: {0}")]
    Internal(String),
}

// Serialize as a string so Tauri can return it to the frontend.
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
