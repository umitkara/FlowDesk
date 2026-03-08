use crate::models::import::{
    CsvPreview, ImportError, ImportResult, ImportWarning, ParsedMarkdown, WikiLink,
};
use crate::services::frontmatter;
use regex::Regex;
use std::path::Path;

/// Scans a directory for markdown files and parses them.
pub fn scan_markdown_directory(
    source_dir: &str,
    base_folder: Option<&str>,
    preserve_structure: bool,
) -> Result<Vec<ParsedMarkdown>, std::io::Error> {
    let mut results = Vec::new();
    let root = Path::new(source_dir);

    for entry in walkdir::WalkDir::new(root)
        .follow_links(true)
        .max_depth(64)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" && ext != "markdown" {
            continue;
        }

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let folder = if preserve_structure {
            let parent = Path::new(&relative)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if parent.is_empty() {
                base_folder.map(String::from)
            } else {
                let base = base_folder.unwrap_or("");
                Some(format!("{}/{}", base.trim_end_matches('/'), parent))
            }
        } else {
            base_folder.map(String::from)
        };

        match parse_markdown_file(&content, &relative, folder.as_deref()) {
            Ok(parsed) => results.push(parsed),
            Err(_) => continue,
        }
    }

    Ok(results)
}

/// Parses a single markdown file content with front matter extraction.
pub fn parse_markdown_file(
    content: &str,
    relative_path: &str,
    folder_override: Option<&str>,
) -> Result<ParsedMarkdown, String> {
    let (fm, body) = frontmatter::parse_front_matter(content)
        .map_err(|e| e.to_string())?;

    let mut title = None;
    let mut tags = Vec::new();
    let mut front_matter = None;

    if let Some(ref fm_data) = fm {
        title = fm_data.title.clone();
        tags = fm_data.tags.clone();
        front_matter = fm_data.raw.clone();
    }

    // If no title from front matter, derive from filename
    if title.is_none() {
        let file_stem = Path::new(relative_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled");
        title = Some(file_stem.to_string());
    }

    let mut parsed = ParsedMarkdown {
        title,
        body,
        front_matter,
        tags,
        relative_path: relative_path.to_string(),
    };

    if let Some(folder) = folder_override {
        // Store folder info in the relative path for later use
        parsed.relative_path = format!("{}:{}", folder, relative_path);
    }

    Ok(parsed)
}

/// Parses Obsidian-style [[wikilinks]] from markdown content.
pub fn parse_obsidian_wikilinks(content: &str) -> Vec<WikiLink> {
    let re = Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();
    let mut links = Vec::new();

    for cap in re.captures_iter(content) {
        links.push(WikiLink {
            target: cap[1].to_string(),
            display_text: cap.get(2).map(|m| m.as_str().to_string()),
            full_match: cap[0].to_string(),
        });
    }

    links
}

/// Converts Obsidian wikilinks to standard markdown links.
pub fn convert_wikilinks(content: &str) -> String {
    let re = Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();
    re.replace_all(content, |caps: &regex::Captures| {
        let target = &caps[1];
        let display = caps.get(2).map(|m| m.as_str()).unwrap_or(target);
        format!("[{}]({})", display, target)
    })
    .to_string()
}

/// Parses a CSV file and returns a preview of the first few rows.
pub fn parse_csv_preview(
    file_path: &str,
    delimiter: Option<&str>,
    max_rows: usize,
) -> Result<CsvPreview, String> {
    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let delim_byte = match delimiter {
        Some("tab") | Some("\t") => b'\t',
        Some(";") => b';',
        _ => b',',
    };

    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delim_byte)
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(String::from)
        .collect();

    let mut rows = Vec::new();
    let mut total_rows = 0;

    for result in rdr.records() {
        total_rows += 1;
        if rows.len() < max_rows {
            if let Ok(record) = result {
                rows.push(record.iter().map(String::from).collect());
            }
        }
    }

    Ok(CsvPreview {
        headers,
        rows,
        total_rows,
    })
}

/// A parsed CSV task row.
pub struct CsvTaskRow {
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
}

/// Imports CSV rows as tasks and returns an ImportResult.
#[allow(clippy::too_many_arguments)]
pub fn import_csv_tasks(
    file_path: &str,
    delimiter: Option<&str>,
    has_header: bool,
    title_col: usize,
    description_col: Option<usize>,
    status_col: Option<usize>,
    priority_col: Option<usize>,
    due_date_col: Option<usize>,
    category_col: Option<usize>,
    tags_col: Option<usize>,
) -> Result<Vec<CsvTaskRow>, String> {
    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let delim_byte = match delimiter {
        Some("tab") | Some("\t") => b'\t',
        Some(";") => b';',
        _ => b',',
    };

    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delim_byte)
        .has_headers(has_header)
        .from_reader(content.as_bytes());

    let mut tasks = Vec::new();

    for result in rdr.records() {
        let record = match result {
            Ok(r) => r,
            Err(_) => continue,
        };

        let get_field = |col: usize| -> Option<String> {
            record.get(col).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
        };

        let title = match get_field(title_col) {
            Some(t) => t,
            None => continue,
        };

        tasks.push(CsvTaskRow {
            title,
            description: description_col.and_then(&get_field),
            status: status_col.and_then(&get_field),
            priority: priority_col.and_then(&get_field),
            due_date: due_date_col.and_then(&get_field),
            category: category_col.and_then(&get_field),
            tags: tags_col.and_then(&get_field),
        });
    }

    Ok(tasks)
}

/// Creates an ImportResult with default values.
pub fn empty_import_result() -> ImportResult {
    ImportResult {
        imported_count: 0,
        skipped_count: 0,
        errors: Vec::new(),
        warnings: Vec::new(),
    }
}

/// Creates an ImportError.
pub fn import_error(file_path: &str, message: &str) -> ImportError {
    ImportError {
        file_path: file_path.to_string(),
        message: message.to_string(),
    }
}

/// Creates an ImportWarning.
pub fn import_warning(file_path: &str, message: &str) -> ImportWarning {
    ImportWarning {
        file_path: file_path.to_string(),
        message: message.to_string(),
    }
}
