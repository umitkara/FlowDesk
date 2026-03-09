use crate::models::note::Note;
use crate::utils::errors::AppError;
use serde_json::Value;
use std::collections::BTreeMap;

/// Parsed YAML front matter fields extracted from a markdown document.
#[derive(Debug, Default)]
pub struct FrontMatter {
    /// Note title extracted from front matter.
    pub title: Option<String>,
    /// Associated date.
    pub date: Option<String>,
    /// Tag list.
    pub tags: Vec<String>,
    /// Category label.
    pub category: Option<String>,
    /// Note type.
    pub note_type: Option<String>,
    /// Color label.
    pub color: Option<String>,
    /// Importance level.
    pub importance: Option<String>,
    /// All front matter fields as a JSON value (includes custom fields).
    pub raw: Option<Value>,
}

/// Parses YAML front matter from a markdown body string.
///
/// Looks for content delimited by `---\n` at the start of the document.
/// Returns the parsed front matter (if any) and the remaining body content.
///
/// # Examples
///
/// ```text
/// ---
/// title: My Note
/// tags: [rust, testing]
/// ---
/// Body text here...
/// ```
pub fn parse_front_matter(body: &str) -> Result<(Option<FrontMatter>, String), AppError> {
    let trimmed = body.trim_start();

    if !trimmed.starts_with("---") {
        return Ok((None, body.to_string()));
    }

    // Find the closing delimiter after the opening "---"
    let after_opening = &trimmed[3..];
    let after_opening = after_opening.strip_prefix('\n').unwrap_or(after_opening);

    let closing_pos = after_opening.find("\n---");
    let Some(closing_pos) = closing_pos else {
        // No closing delimiter found — treat entire content as body
        return Ok((None, body.to_string()));
    };

    let yaml_str = &after_opening[..closing_pos];
    let remaining = &after_opening[closing_pos + 4..]; // skip "\n---"
    let remaining_body = remaining.strip_prefix('\n').unwrap_or(remaining);

    if yaml_str.trim().is_empty() {
        return Ok((Some(FrontMatter::default()), remaining_body.to_string()));
    }

    let yaml_value: serde_yaml::Value =
        serde_yaml::from_str(yaml_str).map_err(|e| AppError::FrontMatter(e.to_string()))?;

    let raw_json: Value =
        serde_json::to_value(&yaml_value).map_err(|e| AppError::FrontMatter(e.to_string()))?;

    let mut fm = FrontMatter {
        raw: Some(raw_json.clone()),
        ..Default::default()
    };

    if let Value::Object(ref map) = raw_json {
        fm.title = map.get("title").and_then(|v| v.as_str()).map(String::from);
        fm.date = map.get("date").and_then(|v| v.as_str()).map(String::from);
        fm.category = map
            .get("category")
            .and_then(|v| v.as_str())
            .map(String::from);
        fm.note_type = map.get("type").and_then(|v| v.as_str()).map(String::from);
        fm.color = map.get("color").and_then(|v| v.as_str()).map(String::from);
        fm.importance = map
            .get("importance")
            .and_then(|v| v.as_str())
            .map(String::from);

        if let Some(Value::Array(tags_arr)) = map.get("tags") {
            fm.tags = tags_arr
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
        }
    }

    Ok((Some(fm), remaining_body.to_string()))
}

/// Builds a YAML front matter block from a note's indexed fields.
///
/// Merges the note's structured fields (title, date, tags, etc.) with
/// any custom fields stored in `front_matter`, then prepends the resulting
/// YAML block to the note's body.
pub fn build_front_matter(note: &Note) -> String {
    let mut fields: BTreeMap<String, Value> = BTreeMap::new();

    if let Some(ref title) = note.title {
        fields.insert("title".to_string(), Value::String(title.clone()));
    }
    if let Some(ref date) = note.date {
        fields.insert("date".to_string(), Value::String(date.clone()));
    }
    if !note.tags.is_empty() {
        let tags_val: Vec<Value> = note.tags.iter().map(|t| Value::String(t.clone())).collect();
        fields.insert("tags".to_string(), Value::Array(tags_val));
    }
    if let Some(ref category) = note.category {
        fields.insert("category".to_string(), Value::String(category.clone()));
    }
    if let Some(ref nt) = note.note_type {
        fields.insert("type".to_string(), Value::String(nt.clone()));
    }
    if let Some(ref color) = note.color {
        fields.insert("color".to_string(), Value::String(color.clone()));
    }
    if let Some(ref importance) = note.importance {
        fields.insert("importance".to_string(), Value::String(importance.clone()));
    }

    // Merge custom fields from front_matter JSON
    if let Some(Value::Object(ref custom)) = note.front_matter {
        for (key, val) in custom {
            // Don't overwrite known fields already inserted
            let known_fields = [
                "title",
                "date",
                "tags",
                "category",
                "type",
                "color",
                "importance",
            ];
            if !known_fields.contains(&key.as_str()) {
                fields.insert(key.clone(), val.clone());
            }
        }
    }

    if fields.is_empty() {
        return note.body.clone();
    }

    let yaml_value = Value::Object(serde_json::Map::from_iter(fields));
    let yaml_str =
        serde_yaml::to_string(&yaml_value).unwrap_or_default();

    format!("---\n{}---\n{}", yaml_str, note.body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic_front_matter() {
        let body = "---\ntitle: Hello\ntags: [a, b]\n---\nBody text";
        let (fm, remaining) = parse_front_matter(body).unwrap();
        let fm = fm.unwrap();
        assert_eq!(fm.title, Some("Hello".to_string()));
        assert_eq!(fm.tags, vec!["a", "b"]);
        assert_eq!(remaining, "Body text");
    }

    #[test]
    fn parse_no_front_matter() {
        let body = "Just a normal body.";
        let (fm, remaining) = parse_front_matter(body).unwrap();
        assert!(fm.is_none());
        assert_eq!(remaining, "Just a normal body.");
    }

    #[test]
    fn parse_empty_front_matter() {
        let body = "---\n\n---\nBody";
        let (fm, remaining) = parse_front_matter(body).unwrap();
        assert!(fm.is_some()); // empty but valid
        assert_eq!(remaining, "Body");
    }

    #[test]
    fn parse_no_closing_delimiter() {
        let body = "---\ntitle: Test\nBody without closing";
        let (fm, remaining) = parse_front_matter(body).unwrap();
        assert!(fm.is_none());
        assert_eq!(remaining, body);
    }

    #[test]
    fn parse_all_fields() {
        let body = "---\ntitle: T\ndate: 2026-01-01\ncategory: work\ntype: journal\ncolor: red\nimportance: high\n---\nBody";
        let (fm, _) = parse_front_matter(body).unwrap();
        let fm = fm.unwrap();
        assert_eq!(fm.title, Some("T".to_string()));
        assert_eq!(fm.date, Some("2026-01-01".to_string()));
        assert_eq!(fm.category, Some("work".to_string()));
        assert_eq!(fm.note_type, Some("journal".to_string()));
        assert_eq!(fm.color, Some("red".to_string()));
        assert_eq!(fm.importance, Some("high".to_string()));
    }

    #[test]
    fn parse_raw_preserved() {
        let body = "---\ntitle: T\ncustom_field: val\n---\nBody";
        let (fm, _) = parse_front_matter(body).unwrap();
        let fm = fm.unwrap();
        let raw = fm.raw.unwrap();
        assert!(raw.get("custom_field").is_some());
    }

    #[test]
    fn parse_leading_whitespace() {
        let body = "  ---\ntitle: T\n---\nBody";
        let (fm, _) = parse_front_matter(body).unwrap();
        assert!(fm.is_some());
    }
}
