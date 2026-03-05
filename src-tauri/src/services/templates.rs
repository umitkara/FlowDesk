use crate::models::template::{NoteTemplate, TemplateVariable};
use chrono::{Datelike, NaiveDate};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Returns the templates directory path within the data directory.
pub fn templates_dir(data_dir: &str) -> PathBuf {
    Path::new(data_dir).join("templates")
}

/// Ensures the templates directory exists and writes built-in templates
/// if they don't already exist.
pub fn ensure_defaults(data_dir: &str) -> Result<(), std::io::Error> {
    let dir = templates_dir(data_dir);
    std::fs::create_dir_all(&dir)?;

    let builtins = vec![
        ("daily-note.md", DAILY_NOTE_TEMPLATE),
        ("meeting-note.md", MEETING_NOTE_TEMPLATE),
        ("technical-doc.md", TECHNICAL_DOC_TEMPLATE),
    ];

    for (name, content) in builtins {
        let path = dir.join(name);
        if !path.exists() {
            std::fs::write(&path, content)?;
        }
    }

    Ok(())
}

/// Lists all available templates by reading the templates directory.
pub fn list_templates(data_dir: &str) -> Result<Vec<NoteTemplate>, String> {
    let dir = templates_dir(data_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut templates = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().is_some_and(|ext| ext == "md") {
            match parse_template_file(&path) {
                Ok(template) => templates.push(template),
                Err(e) => {
                    eprintln!("Warning: Failed to parse template {:?}: {}", path, e);
                }
            }
        }
    }

    templates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(templates)
}

/// Loads a single template by file name.
pub fn load_template(data_dir: &str, file_name: &str) -> Result<NoteTemplate, String> {
    let path = templates_dir(data_dir).join(file_name);
    if !path.exists() {
        return Err(format!("Template file not found: {}", file_name));
    }
    parse_template_file(&path)
}

/// Creates a new template file on disk.
pub fn create_template(
    data_dir: &str,
    file_name: &str,
    name: &str,
    description: &str,
    defaults: &HashMap<String, serde_json::Value>,
    variables: &[TemplateVariable],
    body: &str,
) -> Result<String, String> {
    let path = templates_dir(data_dir).join(file_name);
    if path.exists() {
        return Err(format!("Template file already exists: {}", file_name));
    }

    let content = build_template_content(name, description, defaults, variables, body);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(file_name.to_string())
}

/// Updates an existing template file.
pub fn update_template(
    data_dir: &str,
    file_name: &str,
    name: Option<&str>,
    description: Option<&str>,
    defaults: Option<&HashMap<String, serde_json::Value>>,
    variables: Option<&[TemplateVariable]>,
    body: Option<&str>,
) -> Result<(), String> {
    let existing = load_template(data_dir, file_name)?;

    let final_name = name.unwrap_or(&existing.name);
    let final_desc = description.unwrap_or(&existing.description);
    let final_defaults = defaults.unwrap_or(&existing.defaults);
    let final_variables = variables.unwrap_or(&existing.variables);
    let final_body = body.unwrap_or(&existing.body);

    let content =
        build_template_content(final_name, final_desc, final_defaults, final_variables, final_body);
    let path = templates_dir(data_dir).join(file_name);
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Deletes a template file.
pub fn delete_template(data_dir: &str, file_name: &str) -> Result<(), String> {
    let path = templates_dir(data_dir).join(file_name);
    if !path.exists() {
        return Err(format!("Template file not found: {}", file_name));
    }
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

/// Applies a template: substitutes variables and returns the resulting body
/// and merged defaults.
pub fn apply_template(
    template: &NoteTemplate,
    variables: &HashMap<String, String>,
    workspace_name: &str,
    workspace_slug: &str,
    target_date: Option<NaiveDate>,
) -> (String, HashMap<String, serde_json::Value>) {
    let date = target_date.unwrap_or_else(|| chrono::Local::now().date_naive());

    // Substitute in body
    let body = substitute_variables(&template.body, variables, &date, workspace_name, workspace_slug);

    // Substitute in defaults (string values only)
    let mut defaults = template.defaults.clone();
    for (_, value) in defaults.iter_mut() {
        if let serde_json::Value::String(s) = value {
            *s = substitute_variables(s, variables, &date, workspace_name, workspace_slug);
        }
    }

    (body, defaults)
}

/// Substitutes built-in and user-defined variables in a text string.
///
/// Built-in variables: `{{date}}`, `{{date_formatted}}`, `{{year}}`, `{{month}}`,
/// `{{month_name}}`, `{{day}}`, `{{day_name}}`, `{{datetime}}`, `{{workspace}}`,
/// `{{workspace_slug}}`, `{{title}}`.
///
/// Unknown variables are left as-is and a warning is logged.
fn substitute_variables(
    text: &str,
    user_vars: &HashMap<String, String>,
    date: &NaiveDate,
    workspace_name: &str,
    workspace_slug: &str,
) -> String {
    let month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    let day_names = [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ];

    let month_idx = date.month() as usize - 1;
    let day_idx = date.format("%w").to_string().parse::<usize>().unwrap_or(0);

    let mut builtins: HashMap<&str, String> = HashMap::new();
    builtins.insert("date", date.format("%Y-%m-%d").to_string());
    builtins.insert(
        "date_formatted",
        format!("{} {}, {}", month_names[month_idx], date.day(), date.year()),
    );
    builtins.insert(
        "datetime",
        format!("{}T00:00:00", date.format("%Y-%m-%d")),
    );
    builtins.insert("year", date.format("%Y").to_string());
    builtins.insert("month", date.format("%m").to_string());
    builtins.insert("month_name", month_names[month_idx].to_string());
    builtins.insert("day", date.format("%d").to_string());
    builtins.insert("day_name", day_names[day_idx].to_string());
    builtins.insert("workspace", workspace_name.to_string());
    builtins.insert("workspace_slug", workspace_slug.to_string());

    // Single pass replacement
    let re = regex::Regex::new(r"\{\{(\w+)\}\}").unwrap();
    re.replace_all(text, |caps: &regex::Captures| {
        let var_name = &caps[1];

        // Check user-defined variables first
        if let Some(val) = user_vars.get(var_name) {
            return val.clone();
        }

        // Then built-in variables
        if let Some(val) = builtins.get(var_name) {
            return val.clone();
        }

        // Unknown variable - leave as-is
        eprintln!("Warning: Unresolved template variable: {{{{{}}}}}", var_name);
        caps[0].to_string()
    })
    .to_string()
}

/// Parses a template markdown file into a NoteTemplate struct.
fn parse_template_file(path: &Path) -> Result<NoteTemplate, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    // Strip UTF-8 BOM if present
    let content = content.strip_prefix('\u{feff}').unwrap_or(&content);

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.md")
        .to_string();

    // Split front matter from body
    let (front_matter_str, body) = split_front_matter(content);

    let front_matter_str = match front_matter_str {
        Some(fm) => fm,
        None => {
            return Ok(NoteTemplate {
                file_name,
                name: "Untitled".to_string(),
                description: String::new(),
                version: 1,
                defaults: HashMap::new(),
                variables: Vec::new(),
                body: content.to_string(),
            });
        }
    };

    // Parse YAML front matter
    let yaml: serde_yaml::Value =
        serde_yaml::from_str(front_matter_str).map_err(|e| e.to_string())?;

    let name = yaml
        .get("template_name")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .to_string();

    let description = yaml
        .get("template_description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let version = yaml
        .get("template_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;

    // Parse defaults
    let defaults = parse_defaults(yaml.get("defaults"));

    // Parse variables
    let variables = parse_variables(yaml.get("variables"));

    Ok(NoteTemplate {
        file_name,
        name,
        description,
        version,
        defaults,
        variables,
        body: body.to_string(),
    })
}

/// Splits front matter (between --- delimiters) from the body.
fn split_front_matter(content: &str) -> (Option<&str>, &str) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (None, content);
    }

    // Find closing ---
    let after_first = &trimmed[3..];
    if let Some(end_idx) = after_first.find("\n---") {
        let fm = &after_first[..end_idx];
        let body_start = end_idx + 4; // skip "\n---"
        let body = after_first[body_start..].trim_start_matches('\n');
        (Some(fm.trim()), body)
    } else {
        (None, content)
    }
}

/// Parses the defaults section of template front matter.
fn parse_defaults(value: Option<&serde_yaml::Value>) -> HashMap<String, serde_json::Value> {
    let mut map = HashMap::new();

    if let Some(serde_yaml::Value::Mapping(mapping)) = value {
        for (key, val) in mapping {
            if let Some(key_str) = key.as_str() {
                map.insert(key_str.to_string(), yaml_to_json(val));
            }
        }
    }

    map
}

/// Parses the variables section of template front matter.
fn parse_variables(value: Option<&serde_yaml::Value>) -> Vec<TemplateVariable> {
    let mut vars = Vec::new();

    if let Some(serde_yaml::Value::Sequence(seq)) = value {
        for item in seq {
            if let serde_yaml::Value::Mapping(m) = item {
                let name = m
                    .get(serde_yaml::Value::String("name".into()))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let label = m
                    .get(serde_yaml::Value::String("label".into()))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&name)
                    .to_string();

                let var_type = m
                    .get(serde_yaml::Value::String("type".into()))
                    .and_then(|v| v.as_str())
                    .unwrap_or("text")
                    .to_string();

                let default = m
                    .get(serde_yaml::Value::String("default".into()))
                    .map(yaml_to_json);

                let options = m
                    .get(serde_yaml::Value::String("options".into()))
                    .and_then(|v| v.as_sequence())
                    .map(|seq| {
                        seq.iter()
                            .filter_map(|item| item.as_str().map(|s| s.to_string()))
                            .collect()
                    });

                if !name.is_empty() {
                    vars.push(TemplateVariable {
                        name,
                        label,
                        var_type,
                        default,
                        options,
                    });
                }
            }
        }
    }

    vars
}

/// Converts a serde_yaml::Value to serde_json::Value.
fn yaml_to_json(val: &serde_yaml::Value) -> serde_json::Value {
    match val {
        serde_yaml::Value::Null => serde_json::Value::Null,
        serde_yaml::Value::Bool(b) => serde_json::Value::Bool(*b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                serde_json::Value::Number(i.into())
            } else if let Some(f) = n.as_f64() {
                serde_json::json!(f)
            } else {
                serde_json::Value::Null
            }
        }
        serde_yaml::Value::String(s) => serde_json::Value::String(s.clone()),
        serde_yaml::Value::Sequence(seq) => {
            serde_json::Value::Array(seq.iter().map(yaml_to_json).collect())
        }
        serde_yaml::Value::Mapping(map) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in map {
                if let Some(key) = k.as_str() {
                    obj.insert(key.to_string(), yaml_to_json(v));
                }
            }
            serde_json::Value::Object(obj)
        }
        serde_yaml::Value::Tagged(tagged) => yaml_to_json(&tagged.value),
    }
}

/// Builds the markdown content for a template file.
fn build_template_content(
    name: &str,
    description: &str,
    defaults: &HashMap<String, serde_json::Value>,
    variables: &[TemplateVariable],
    body: &str,
) -> String {
    let mut yaml_parts = Vec::new();
    yaml_parts.push(format!("template_name: {:?}", name));
    yaml_parts.push(format!("template_description: {:?}", description));
    yaml_parts.push("template_version: 1".to_string());

    // Defaults
    if defaults.is_empty() {
        yaml_parts.push("defaults: {}".to_string());
    } else {
        yaml_parts.push("defaults:".to_string());
        for (key, value) in defaults {
            let val_str = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Array(arr) => {
                    let items: Vec<String> = arr
                        .iter()
                        .map(|v| match v {
                            serde_json::Value::String(s) => s.clone(),
                            other => other.to_string(),
                        })
                        .collect();
                    format!("[{}]", items.join(", "))
                }
                other => other.to_string(),
            };
            yaml_parts.push(format!("  {}: {}", key, val_str));
        }
    }

    // Variables
    if variables.is_empty() {
        yaml_parts.push("variables: []".to_string());
    } else {
        yaml_parts.push("variables:".to_string());
        for var in variables {
            yaml_parts.push(format!("  - name: {}", var.name));
            yaml_parts.push(format!("    label: {:?}", var.label));
            yaml_parts.push(format!("    type: {}", var.var_type));
            if let Some(ref default) = var.default {
                match default {
                    serde_json::Value::String(s) => {
                        yaml_parts.push(format!("    default: {:?}", s));
                    }
                    other => {
                        yaml_parts.push(format!("    default: {}", other));
                    }
                }
            }
            if let Some(ref options) = var.options {
                let opts: Vec<String> = options.to_vec();
                yaml_parts.push(format!("    options: [{}]", opts.join(", ")));
            }
        }
    }

    format!("---\n{}\n---\n{}", yaml_parts.join("\n"), body)
}

/// Built-in daily note template content.
const DAILY_NOTE_TEMPLATE: &str = r#"---
template_name: "Daily Note"
template_description: "Standard daily journal and planning entry"
template_version: 1
defaults:
  type: journal
  category: daily
  folder: /journal/{{year}}/{{month}}
  tags: [daily]
variables: []
---
# {{date_formatted}}

## Plan for Today
- [ ]

## Notes


## End of Day
- What went well:
- What could improve:
"#;

/// Built-in meeting note template content.
const MEETING_NOTE_TEMPLATE: &str = r#"---
template_name: "Meeting Note"
template_description: "Structured meeting notes with attendees and action items"
template_version: 1
defaults:
  type: meeting
  category: meetings
  tags: [meeting]
variables:
  - name: meeting_title
    label: "Meeting Title"
    type: text
    default: ""
  - name: attendees
    label: "Attendees"
    type: text
    default: ""
---
# {{meeting_title}} - {{date_formatted}}

## Attendees
{{attendees}}

## Agenda
1.

## Discussion Notes


## Decisions Made
-

## Action Items
- [ ]

## Follow-up
- Next meeting:
"#;

/// Built-in technical document template content.
const TECHNICAL_DOC_TEMPLATE: &str = r#"---
template_name: "Technical Document"
template_description: "Technical documentation or design document"
template_version: 1
defaults:
  type: technical
  category: documentation
  tags: [technical, docs]
  importance: medium
variables:
  - name: doc_title
    label: "Document Title"
    type: text
    default: ""
  - name: status
    label: "Status"
    type: select
    options: [draft, review, approved, archived]
    default: "draft"
---
# {{doc_title}}

**Status:** {{status}}
**Author:**
**Date:** {{date_formatted}}

## Overview


## Background / Context


## Design / Approach


## Implementation Details


## Trade-offs & Alternatives Considered


## Open Questions
-

## References
-
"#;
