import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
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
      CodeBlockLowlight.configure({ lowlight }),
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
    },
  });

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
          <div className="flex flex-shrink-0 items-center gap-0.5 border-b border-gray-200 px-4 py-1.5 dark:border-gray-800">
            <ToolbarButton
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Bold (Ctrl+B)"
            >
              <strong>B</strong>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Italic (Ctrl+I)"
            >
              <em>I</em>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Strikethrough"
            >
              <s>S</s>
            </ToolbarButton>
            <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <ToolbarButton
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Heading 1"
            >
              H1
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Heading 2"
            >
              H2
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="Heading 3"
            >
              H3
            </ToolbarButton>
            <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <ToolbarButton
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet List"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Ordered List"
            >
              <span className="text-xs">1.</span>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("taskList")}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              title="Task List"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </ToolbarButton>
            <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <ToolbarButton
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Blockquote"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="Inline Code"
            >
              {"</>"}
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              title="Code Block"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Horizontal Rule"
            >
              --
            </ToolbarButton>

            {/* Timestamp button — only visible when tracker is running */}
            {trackerStatus !== "idle" && (
              <>
                <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
                <ToolbarButton
                  active={false}
                  onClick={insertTimestamp}
                  title="Insert Timestamp (Ctrl+Shift+T)"
                >
                  <span className="flex items-center gap-0.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth={2} />
                      <path strokeLinecap="round" strokeWidth={2} d="M12 6v6l4 2" />
                    </svg>
                  </span>
                </ToolbarButton>
              </>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Version History button */}
            <ToolbarButton
              active={versionHistoryOpen}
              onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
              title="Version History"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </ToolbarButton>

            {/* Export note button */}
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
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </ToolbarButton>
          </div>
        )}

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
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}
