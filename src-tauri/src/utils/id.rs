use uuid::Uuid;

/// Generates a new UUID v7 identifier string.
///
/// UUID v7 values are time-sortable, meaning identifiers generated later
/// are lexicographically greater than earlier ones.
pub fn generate_id() -> String {
    Uuid::now_v7().to_string()
}
