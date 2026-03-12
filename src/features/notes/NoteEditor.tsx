import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { CodeBlockExtension } from "./extensions/CodeBlockExtension";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);
import { useNoteStore } from "../../stores/noteStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { useDebounce } from "../../hooks/useDebounce";
import { useVersionHistory } from "../../hooks/useVersionHistory";
import { FrontMatterPanel } from "./FrontMatterPanel";
import { VersionHistory } from "./VersionHistory";
import { timeAgo } from "../../lib/utils";
import { TaskReferenceExtension, preprocessEntityRefs } from "./extensions/TaskReferenceExtension";
import { SlashCommandExtension } from "./extensions/SlashCommandExtension";
import { handleMarkdownPaste } from "./extensions/markdownPasteHandler";
import { syncNoteReferences, getVersionHistoryConfig, exportNotesMarkdown } from "../../lib/ipc";
import { open } from "@tauri-apps/plugin-dialog";
import { MoveToWorkspaceMenu } from "../../components/shared/MoveToWorkspaceMenu";

/** Tiptap-based markdown editor for notes with title bar and metadata drawer. */
export function NoteEditor() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const fontSize = useSettingsStore((s) => s.settings.font_size ?? "14");
  const debounceMs = useSettingsStore(
    (s) => s.settings.auto_save_debounce_ms ?? "1000",
  );
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const clearActiveNote = useNoteStore((s) => s.clearActiveNote);
  const detailPanelOpen = useUIStore((s) => s.detailPanelOpen);
  const toggleDetailPanel = useUIStore((s) => s.toggleDetailPanel);
  const trackerStatus = useTrackerStore((s) => s.status);
  const trackerElapsed = useTrackerStore((s) => s.elapsedSeconds);
  const addSessionNote = useTrackerStore((s) => s.addSessionNote);

  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [localTitle, setLocalTitle] = useState(activeNote?.title ?? "");
  const [inTable, setInTable] = useState(false);
  const { scheduleSnapshot } = useVersionHistory(activeNote?.id ?? "");
  const [vhConfig, setVhConfig] = useState({ enabled: true, snapshot_debounce_secs: 5 });

  useEffect(() => {
    getVersionHistoryConfig()
      .then((cfg) => setVhConfig({ enabled: cfg.enabled, snapshot_debounce_secs: cfg.snapshot_debounce_secs }))
      .catch(() => {});
  }, []);

  // Sync local title when switching notes
  useEffect(() => {
    setLocalTitle(activeNote?.title ?? "");
  }, [activeNote?.id]);

  const delayMs = Math.max(200, Math.min(5000, parseInt(debounceMs, 10) || 1000));
  const editorRef = useRef<import("@tiptap/core").Editor | null>(null);

  const debouncedSave = useDebounce((body: string) => {
    if (activeNote) {
      updateNote(activeNote.id, { body });
      // Sync inline @task[id] references after save
      syncNoteReferences(activeNote.id, body).catch(() => {});
      // Schedule a version snapshot if enabled
      if (vhConfig.enabled) {
        scheduleSnapshot(activeNote.workspace_id, activeNote.title, body, vhConfig.snapshot_debounce_secs);
      }
    }
  }, delayMs);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary-600 underline dark:text-primary-400" },
      }),
      Typography,
      CharacterCount,
      CodeBlockExtension.configure({ lowlight }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "tiptap-table" } }),
      TableRow,
      TableCell,
      TableHeader,
      TaskReferenceExtension,
      SlashCommandExtension,
    ],
    content: preprocessEntityRefs(activeNote?.body || ""),
    onUpdate: ({ editor: ed }) => {
      debouncedSave(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-8 py-6",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Tab") {
          const ed = editor;
          if (!ed) return false;
          // Let Tiptap table extension handle Tab inside tables
          if (ed.isActive("table")) return false;
          event.preventDefault();
          if (event.shiftKey) {
            // Shift+Tab: lift/outdent list item or decrease heading
            if (ed.can().liftListItem("listItem")) {
              ed.chain().liftListItem("listItem").run();
            } else if (ed.can().liftListItem("taskItem")) {
              ed.chain().liftListItem("taskItem").run();
            }
          } else {
            // Tab: sink/indent list item, or insert tab character
            if (ed.can().sinkListItem("listItem")) {
              ed.chain().sinkListItem("listItem").run();
            } else if (ed.can().sinkListItem("taskItem")) {
              ed.chain().sinkListItem("taskItem").run();
            } else {
              ed.chain().insertContent("\t").run();
            }
          }
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        return handleMarkdownPaste(editorRef.current, event);
      },
    },
  });
  editorRef.current = editor;

  // Track inTable state via selectionUpdate/transaction (decoupled from mouse events)
  useEffect(() => {
    if (!editor) return;
    const update = () => setInTable(editor.isActive("table"));
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  // Sync editor content when switching notes
  useEffect(() => {
    if (editor && activeNote) {
      const processed = preprocessEntityRefs(activeNote.body || "");
      const currentContent = editor.getHTML();
      if (currentContent !== processed) {
        editor.commands.setContent(processed);
      }
    }
  }, [editor, activeNote?.id]);

  const handleForceSave = useCallback(() => {
    if (editor && activeNote) {
      const body = editor.getHTML();
      updateNote(activeNote.id, { body });
      syncNoteReferences(activeNote.id, body).catch(() => {});
    }
  }, [editor, activeNote, updateNote]);

  // Insert a timestamped marker into the editor and log a session note on the backend.
  const insertTimestamp = useCallback(() => {
    if (!editor || trackerStatus === "idle") return;
    const mins = Math.round(trackerElapsed / 60);
    const marker = `\u23F1 +${mins}min `;
    editor.chain().focus().insertContent(marker).run();
    addSessionNote(`Timestamp inserted in note: +${mins}min`).catch(() => {});
  }, [editor, trackerStatus, trackerElapsed, addSessionNote]);

  // Ctrl+S force save, Ctrl+Shift+T insert timestamp
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleForceSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "T") {
        e.preventDefault();
        insertTimestamp();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleForceSave, insertTimestamp]);

  if (!activeNote) return null;

  const fontSizePx = Math.max(10, Math.min(24, parseInt(fontSize, 10) || 14));

  return (
    <div className="flex h-full">
      {/* Main editor column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Title bar */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={localTitle}
              placeholder="Untitled"
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => {
                if (localTitle !== (activeNote.title ?? "")) {
                  updateNote(activeNote.id, { title: localTitle });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full truncate bg-transparent text-base font-semibold text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-600"
            />
            <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              {activeNote.date && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {activeNote.date}
                </span>
              )}
              {activeNote.folder && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  {activeNote.folder}
                </span>
              )}
              {activeNote.updated_at && (
                <span title={new Date(activeNote.updated_at).toLocaleString()}>
                  {timeAgo(activeNote.updated_at)}
                </span>
              )}
              {activeNote.tags.length > 0 && (
                <span className="flex items-center gap-1">
                  {activeNote.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-gray-800"
                    >
                      {t}
                    </span>
                  ))}
                  {activeNote.tags.length > 3 && (
                    <span className="text-[10px]">+{activeNote.tags.length - 3}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="ml-3 flex items-center gap-1">
            <button
              onClick={() => updateNote(activeNote.id, { pinned: !activeNote.pinned })}
              title={activeNote.pinned ? "Unpin note" : "Pin note"}
              className={`rounded-md p-1.5 transition-colors ${
                activeNote.pinned
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              }`}
            >
              <svg className="h-4 w-4" fill={activeNote.pinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              onClick={toggleDetailPanel}
              title="Toggle metadata panel"
              className={`rounded-md p-1.5 transition-colors ${
                detailPanelOpen
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <MoveToWorkspaceMenu
              entityId={activeNote.id}
              entityType="note"
              onMoved={() => {
                clearActiveNote();
                loadNotes();
              }}
            />
            <button
              onClick={() => deleteNote(activeNote.id)}
              title="Delete note"
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Toolbar */}
        {editor && (
          <div role="toolbar" aria-label="Formatting toolbar" className="tiptap-toolbar flex flex-shrink-0 items-center border-b border-gray-200 px-2 py-1 dark:border-gray-800">
            {/* Undo / Redo */}
            <div role="group" className="tiptap-toolbar-group">
              <ToolbarButton
                active={false}
                disabled={!editor.can().undo()}
                onClick={() => editor.chain().focus().undo().run()}
                title="Undo (Ctrl+Z)"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                active={false}
                disabled={!editor.can().redo()}
                onClick={() => editor.chain().focus().redo().run()}
                title="Redo (Ctrl+Y)"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13" />
                </svg>
              </ToolbarButton>
            </div>

            <div className="tiptap-separator" role="none" />

            {/* Block type: Headings, Lists, Blockquote, Code Block */}
            <div role="group" className="tiptap-toolbar-group">
              <HeadingDropdown editor={editor} />
              <ListDropdown editor={editor} />
              <ToolbarButton
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                title="Blockquote"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("codeBlock")}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                title="Code Block"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                </svg>
              </ToolbarButton>
            </div>

            <div className="tiptap-separator" role="none" />

            {/* Inline formatting: Bold, Italic, Strike, Code, Link */}
            <div role="group" className="tiptap-toolbar-group">
              <ToolbarButton
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Bold (Ctrl+B)"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Italic (Ctrl+I)"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                title="Strikethrough"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4H9a3 3 0 00-2.83 4" /><path d="M14 12a4 4 0 010 8H6" /><line x1="4" y1="12" x2="20" y2="12" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
                title="Inline Code"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                  <line x1="10" y1="2" x2="14" y2="22" opacity={0.4} />
                </svg>
              </ToolbarButton>
              <LinkButton editor={editor} />
            </div>

            <div className="tiptap-separator" role="none" />

            {/* Horizontal Rule + Table */}
            <div role="group" className="tiptap-toolbar-group">
              <ToolbarButton
                active={false}
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Horizontal Rule"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
              </ToolbarButton>
              <TableMenu editor={editor} inTable={inTable} />
            </div>

            {/* Timestamp button — only visible when tracker is running */}
            {trackerStatus !== "idle" && (
              <>
                <div className="tiptap-separator" role="none" />
                <div role="group" className="tiptap-toolbar-group">
                  <ToolbarButton
                    active={false}
                    onClick={insertTimestamp}
                    title="Insert Timestamp (Ctrl+Shift+T)"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                  </ToolbarButton>
                </div>
              </>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Version History + Export */}
            <div role="group" className="tiptap-toolbar-group">
              <ToolbarButton
                active={versionHistoryOpen}
                onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
                title="Version History"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                active={false}
                onClick={async () => {
                  if (!activeNote) return;
                  const dir = await open({ directory: true, title: "Export note to..." });
                  if (typeof dir === "string") {
                    await exportNotesMarkdown({
                      workspace_id: activeNote.workspace_id,
                      output_dir: dir,
                      note_ids: [activeNote.id],
                      include_front_matter: true,
                      flatten_folders: true,
                    });
                  }
                }}
                title="Export Note as Markdown"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </ToolbarButton>
            </div>
          </div>
        )}

        {/* Table Actions Bar — visible only when cursor is inside a table */}
        {inTable && editor && <TableActionsBar editor={editor} />}

        {/* Editor content — font size applied via CSS variable */}
        <div
          className="tiptap-editor flex-1 overflow-auto"
          style={{ fontSize: `${fontSizePx}px` }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Right drawer — metadata panel */}
      {detailPanelOpen && (
        <div className="flex h-full w-72 flex-shrink-0 flex-col border-l border-gray-200 dark:border-gray-800">
          <FrontMatterPanel />
        </div>
      )}

      {/* Version history panel */}
      {versionHistoryOpen && activeNote && (
        <VersionHistory
          noteId={activeNote.id}
          onClose={() => setVersionHistoryOpen(false)}
          onRestore={() => {
            setVersionHistoryOpen(false);
            // Re-read note to refresh editor content
            if (activeNote) {
              selectNote(activeNote.id);
            }
          }}
        />
      )}
    </div>
  );
}

/** A single toolbar formatting button. */
function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  onMouseDown,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={title}
      disabled={disabled}
      aria-pressed={active}
      aria-label={title}
      className={`tiptap-button rounded-md p-1.5 transition-colors ${
        disabled
          ? "cursor-not-allowed text-gray-300 dark:text-gray-600"
          : active
            ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

/** Heading level dropdown. */
function HeadingDropdown({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isHeading = editor.isActive("heading");
  const currentLevel = isHeading
    ? ([1, 2, 3] as const).find((l) => editor.isActive("heading", { level: l }))
    : null;

  const label = currentLevel ? `H${currentLevel}` : "T";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => e.preventDefault()}
        title="Text style"
        aria-label="Format text as heading"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`tiptap-button flex items-center gap-0.5 rounded-md px-1.5 py-1.5 transition-colors ${
          isHeading
            ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        }`}
      >
        <span className="text-xs font-semibold leading-none">{label}</span>
        <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <DropdownItem
            label="Normal text"
            active={!isHeading}
            onClick={() => { editor.chain().focus().setParagraph().run(); setOpen(false); }}
          />
          {([1, 2, 3] as const).map((level) => (
            <DropdownItem
              key={level}
              label={`Heading ${level}`}
              active={editor.isActive("heading", { level })}
              onClick={() => { editor.chain().focus().toggleHeading({ level }).run(); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** List type dropdown. */
function ListDropdown({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isList = editor.isActive("bulletList") || editor.isActive("orderedList") || editor.isActive("taskList");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => e.preventDefault()}
        title="List options"
        aria-label="List options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`tiptap-button flex items-center gap-0.5 rounded-md px-1.5 py-1.5 transition-colors ${
          isList
            ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <DropdownItem
            label="Bullet List"
            active={editor.isActive("bulletList")}
            onClick={() => { editor.chain().focus().toggleBulletList().run(); setOpen(false); }}
          />
          <DropdownItem
            label="Ordered List"
            active={editor.isActive("orderedList")}
            onClick={() => { editor.chain().focus().toggleOrderedList().run(); setOpen(false); }}
          />
          <DropdownItem
            label="Task List"
            active={editor.isActive("taskList")}
            onClick={() => { editor.chain().focus().toggleTaskList().run(); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

/** Link toggle button with URL input popover. */
function LinkButton({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      const existing = editor.getAttributes("link").href || "";
      setUrl(existing);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, editor]);

  const isActive = editor.isActive("link");

  const apply = () => {
    if (url.trim()) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton
        active={isActive}
        onClick={() => setOpen(!open)}
        title="Link (Ctrl+K)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarButton>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") apply(); if (e.key === "Escape") setOpen(false); }}
              placeholder="https://..."
              className="w-48 rounded border border-gray-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-gray-600"
            />
            <button
              onClick={apply}
              className="rounded bg-primary-600 px-2 py-1 text-xs font-medium text-white hover:bg-primary-700"
            >
              {url.trim() ? "Apply" : "Remove"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Table toolbar dropdown menu. */
function TableMenu({ editor, inTable }: { editor: ReturnType<typeof useEditor>; inTable: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!editor) return null;

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <ToolbarButton
        active={inTable}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        title="Table"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
        </svg>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {!inTable ? (
            <DropdownItem
              label="Insert Table"
              onClick={() => run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
            />
          ) : (
            <>
              <DropdownItem label="Add Row Before" onClick={() => run(() => editor.chain().focus().addRowBefore().run())} />
              <DropdownItem label="Add Row After" onClick={() => run(() => editor.chain().focus().addRowAfter().run())} />
              <DropdownItem label="Add Column Before" onClick={() => run(() => editor.chain().focus().addColumnBefore().run())} />
              <DropdownItem label="Add Column After" onClick={() => run(() => editor.chain().focus().addColumnAfter().run())} />
              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
              <DropdownItem label="Delete Row" onClick={() => run(() => editor.chain().focus().deleteRow().run())} />
              <DropdownItem label="Delete Column" onClick={() => run(() => editor.chain().focus().deleteColumn().run())} />
              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
              <DropdownItem label="Toggle Header Row" onClick={() => run(() => editor.chain().focus().toggleHeaderRow().run())} />
              <DropdownItem label="Toggle Header Column" onClick={() => run(() => editor.chain().focus().toggleHeaderColumn().run())} />
              {editor.can().mergeCells() && (
                <DropdownItem label="Merge Cells" onClick={() => run(() => editor.chain().focus().mergeCells().run())} />
              )}
              {editor.can().splitCell() && (
                <DropdownItem label="Split Cell" onClick={() => run(() => editor.chain().focus().splitCell().run())} />
              )}
              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
              <DropdownItem label="Delete Table" danger onClick={() => run(() => editor.chain().focus().deleteTable().run())} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Contextual action bar shown when cursor is inside a table. */
function TableActionsBar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (label: string, cmd: () => void, danger = false) => (
    <button
      key={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { editor.chain().focus(); cmd(); }}
      className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
        danger
          ? "text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
          : "text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/30"
      }`}
    >
      {label}
    </button>
  );
  const sep = (key: string) => <div key={key} className="mx-1 h-4 w-px bg-blue-200 dark:bg-blue-800" />;

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5 border-b border-blue-200 bg-blue-50 px-4 py-1 dark:border-blue-900 dark:bg-blue-950/30">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400 dark:text-blue-600">Table</span>
      {btn("+ Row ↑", () => editor.chain().addRowBefore().run())}
      {btn("+ Row ↓", () => editor.chain().addRowAfter().run())}
      {btn("✕ Row", () => editor.chain().deleteRow().run(), true)}
      {sep("s1")}
      {btn("+ Col ←", () => editor.chain().addColumnBefore().run())}
      {btn("+ Col →", () => editor.chain().addColumnAfter().run())}
      {btn("✕ Col", () => editor.chain().deleteColumn().run(), true)}
      {sep("s2")}
      {btn("Delete Table", () => editor.chain().deleteTable().run(), true)}
    </div>
  );
}

function DropdownItem({ label, onClick, danger, active }: { label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-full px-3 py-1.5 text-left text-xs ${
        danger
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          : active
            ? "bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
            : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      {label}
    </button>
  );
}
