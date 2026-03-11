# FlowDesk

FlowDesk is a local-first desktop productivity app for managing notes, tasks, plans, and time tracking in a single interface. It runs entirely on your machine with no account, no cloud sync, and no external dependencies at runtime.

Current version: v0.8.22 (pre-1.0). There are no automated tests yet. The app is Windows-first; macOS and Linux builds are untested.

---

## Features

### Notes
- Rich text editor with Markdown shortcuts (Tiptap)
- Folder tree organization
- Full-text search via SQLite FTS5
- Tags, pinning, and note metadata
- Inline references to tasks with @task[id] chips
- Note version history with line-level diffs
- Markdown templates with YAML front matter

### Tasks
- Task list with status, priority, due date, and tags
- Kanban board with drag-and-drop columns
- Sticky tasks pinned to the top of lists
- Backlinks: shows notes that reference a task
- Recurrence rules with auto-generation on completion

### Plans
- Plan entities linked to tasks and time entries
- Planned vs. actual time comparison

### Time Tracker
- Start, pause, resume, and stop sessions
- System tray integration with tracker controls
- Break reminder scheduler
- Tracker stop suggestions based on task context

### Workspaces
- Multiple named workspaces, each isolated with its own data
- Per-workspace accent color and dashboard widget configuration
- Cross-workspace entity references

### Discovery
- Activity log for recent opens and edits
- Graph view of entity relationships
- Timeline and grouped views
- Faceted search with filters by type, status, tag, and workspace
- Backlinks panel with snippet context

### Other
- Command palette (Ctrl+K) with fuzzy search
- Configurable keyboard shortcuts
- Undo/redo for note and task edits
- Import: Markdown folder, Obsidian vault, CSV tasks
- Export: JSON workspace, CSV tasks, Markdown
- Dark mode and theme configuration
- Quick capture widget (Ctrl+Shift+Space)

---

## Screenshots

Screenshots will be added before the v1.0 release.

---

## Building from Source

### Prerequisites

- Node.js 20 or later
- Rust stable (install via [rustup](https://rustup.rs))
- npm

On Windows, the Tauri build also requires the WebView2 runtime (included with Windows 11) and either the MSVC or GNU toolchain.

### Steps

```sh
git clone https://github.com/your-username/flowdesk.git
cd flowdesk

# Install frontend dependencies
# --legacy-peer-deps is required because Tiptap has a peer conflict between
# its v2 and v3 packages that ships in the published npm metadata.
npm install --legacy-peer-deps

# Run in development mode (opens a dev window with hot reload)
npm run tauri dev

# Build a release binary
npm run tauri build
```

The release binary and installer are written to `src-tauri/target/release/bundle/`.

---

## Data Storage

FlowDesk stores all data in a SQLite database at:

- Windows: `%APPDATA%\FlowDesk\flowdesk.db` (typically `C:\Users\<name>\AppData\Roaming\FlowDesk\`)

Note templates are stored as Markdown files in the same directory under `templates/`.

No data leaves your machine. There is no telemetry, no analytics, and no network requests at runtime beyond what Tauri itself requires for the WebView.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| Backend | Rust |
| Database | SQLite via rusqlite 0.32 (bundled) |
| Frontend framework | React 18 |
| State management | Zustand |
| Rich text editor | Tiptap |
| UI styling | Tailwind CSS |
| Drag and drop | @dnd-kit |
| Graph view | react-force-graph-2d |

---

## License

MIT. See [LICENSE](./LICENSE).
