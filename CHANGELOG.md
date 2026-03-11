# Changelog

All notable changes to FlowDesk are documented here.

## [Unreleased]

## [0.8.x] - Phase 8: Polish and Power Features

- Command palette (Ctrl+K) with fuzzy search across notes, tasks, plans, and commands
- Configurable keyboard shortcuts stored in settings
- Undo/redo for note and task edits (in-memory, up to 100 operations)
- Note version history with SHA-256 deduplication and line-level diffs
- Import wizard: Markdown folder, Obsidian vault (wikilink conversion), CSV tasks
- Enhanced export: JSON workspace, CSV tasks, Markdown with front matter
- Theme system with dark mode and per-workspace accent color swatches
- Quick capture widget with global hotkey (Ctrl+Shift+Space)

## [0.7.x] - Phase 7: Recurrence, Templates, Automation

- Recurrence rules for tasks and plans (daily, weekly, monthly, custom intervals)
- Auto-generation of next occurrence on task completion
- Markdown-based note templates with YAML front matter, stored on disk
- Three built-in default templates included on first run
- Reminder system: backend scheduler checks every 30 seconds, fires Tauri events to frontend
- Tracker stop suggestions: scores in-progress tasks by tag and keyword overlap
- Template manager UI for creating and editing templates

## [0.6.x] - Phase 6: Advanced Views and Discovery

- Activity log: records opens, edits, and completions for notes, tasks, and plans
- Backlinks panel with snippet context from full-text search
- Graph view (BFS centered or full-workspace) using react-force-graph-2d
- Timeline view grouping entities by date
- Grouped view for tasks and notes
- Planned vs. actual time comparison for time tracker entries
- Faceted search with aggregated counts by type, status, tag, and workspace

## [0.5.x] - Phase 5: Workspaces

- Multiple named workspaces, each with its own notes, tasks, plans, and time entries
- Per-workspace configuration: categories, note types, task categories, accent color, dashboard widgets
- Workspace switcher in sidebar; last active workspace restored on launch
- Cross-workspace entity references with workspace badge display
- Dashboard with customizable widget layout (drag-and-drop via @dnd-kit/sortable)
- Accent color applied as CSS custom properties throughout the UI

## [0.4.x] - Phase 4: Time Tracker

- Start, pause, resume, and stop time tracking sessions
- Time entries linked to tasks and plans
- System tray integration: tracker controls accessible from tray menu
- Close-to-tray behavior when a tracker session is running
- Break reminder scheduler with configurable intervals
- Plan vs. actual time reporting

## [0.3.x] - Phase 3: Plans

- Plan entities with title, description, start date, due date, and status
- Plan detail view with linked tasks and time entries
- Recurrence and reminder fields (populated in Phase 7)

## [0.2.x] - Phase 2: Tasks

- Task management with title, status, priority, due date, and tags
- Kanban board with drag-and-drop columns (via @dnd-kit)
- Sticky tasks pinned to top of lists
- Inline @task[id] references in note editor rendered as chips
- Backlinks: notes referencing a task shown in task detail

## [0.1.x] - Phase 1: Foundation and Notes

- Tauri 2 + React 18 desktop app scaffold
- SQLite database (rusqlite bundled) with incremental migrations
- Note editor powered by Tiptap with Markdown shortcuts
- Folder tree for note organization
- Full-text search via SQLite FTS5
- Tags, pinning, and note metadata
- Settings panel with basic preferences
