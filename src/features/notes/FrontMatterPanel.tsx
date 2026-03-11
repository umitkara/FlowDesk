import { useCallback, useState, useEffect } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { BacklinksPanel } from "../../components/shared/BacklinksPanel";
import { timeAgo, wordCount } from "../../lib/utils";
import type { UpdateNoteInput } from "../../lib/types";

/** Right-drawer panel for editing note metadata (front matter fields). */
export function FrontMatterPanel() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const noteTypes = useWorkspaceStore(
    (s) => s.activeWorkspace?.config.note_types ?? [],
  );
  const categories = useWorkspaceStore(
    (s) => s.activeWorkspace?.config.categories ?? [],
  );

  const handleFieldCommit = useCallback(
    (field: keyof UpdateNoteInput, value: string) => {
      if (!activeNote) return;
      updateNote(activeNote.id, { [field]: value });
    },
    [activeNote, updateNote],
  );

  const handleTagsCommit = useCallback(
    (tagsStr: string) => {
      if (!activeNote) return;
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      updateNote(activeNote.id, { tags });
    },
    [activeNote, updateNote],
  );

  if (!activeNote) return null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Metadata
        </h2>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <Field
          label="Title"
          value={activeNote.title ?? ""}
          onCommit={(v) => handleFieldCommit("title", v)}
        />
        <ClearableField
          label="Date"
          value={activeNote.date ?? ""}
          onCommit={(v) => {
            if (!activeNote) return;
            updateNote(activeNote.id, { date: v });
          }}
          type="date"
        />
        <Field
          label="Folder"
          value={activeNote.folder ?? ""}
          onCommit={(v) => handleFieldCommit("folder", v)}
          placeholder="/path/to/folder"
        />
        <SelectField
          label="Category"
          value={activeNote.category ?? ""}
          options={categories}
          onCommit={(v) => handleFieldCommit("category", v)}
        />
        <SelectField
          label="Type"
          value={activeNote.note_type ?? ""}
          options={noteTypes}
          onCommit={(v) => handleFieldCommit("note_type", v)}
        />
        <SelectField
          label="Importance"
          value={activeNote.importance ?? ""}
          options={["low", "medium", "high", "critical"]}
          onCommit={(v) => handleFieldCommit("importance", v)}
        />
        <ColorField
          value={activeNote.color ?? ""}
          onCommit={(v) => handleFieldCommit("color", v)}
        />
        <Field
          label="Tags"
          value={activeNote.tags.join(", ")}
          onCommit={handleTagsCommit}
          placeholder="tag1, tag2, ..."
        />
      </div>

      {/* Read-only context info */}
      <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Info
        </h2>
        <div className="flex flex-col gap-1.5">
          <InfoRow
            label="Created"
            value={new Date(activeNote.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          />
          <InfoRow
            label="Updated"
            value={timeAgo(activeNote.updated_at)}
          />
          <InfoRow
            label="Words"
            value={String(wordCount(activeNote.body))}
          />
        </div>
      </div>

      {/* Backlinks */}
      <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <BacklinksPanel targetType="note" targetId={activeNote.id} />
      </div>
    </div>
  );
}

/** A read-only info row with label and value. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-600 dark:text-gray-300">{value}</span>
    </div>
  );
}

/** A single metadata form field with blur-save behavior. */
function Field({
  label,
  value,
  onCommit,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    if (local !== value) {
      onCommit(local);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <input
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      />
    </div>
  );
}

/** A select dropdown field that commits immediately on change. */
function SelectField({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  options: string[];
  onCommit: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onCommit(e.target.value)}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A metadata field with an optional clear button (useful for date inputs). */
function ClearableField({
  label,
  value,
  onCommit,
  type = "text",
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  type?: string;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    if (local !== value) {
      onCommit(local);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        />
        {value && (
          <button
            onClick={() => onCommit("")}
            title={`Clear ${label.toLowerCase()}`}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e", "#78716c",
];

/** Color picker field with swatches and native picker. */
function ColorField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [localHex, setLocalHex] = useState(value);

  useEffect(() => {
    setLocalHex(value);
  }, [value]);

  const commitHex = () => {
    if (localHex !== value) {
      onCommit(localHex);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Color
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#3b82f6"}
          onChange={(e) => onCommit(e.target.value)}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-transparent p-0.5 dark:border-gray-700 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-none"
        />
        <input
          type="text"
          value={localHex}
          onChange={(e) => setLocalHex(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="#hex or name"
          className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        />
        {value && (
          <button
            onClick={() => onCommit("")}
            title="Clear color"
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-8 gap-1">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => onCommit(c)}
            title={c}
            className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${
              value === c
                ? "border-gray-800 ring-1 ring-gray-400 dark:border-white dark:ring-gray-500"
                : "border-gray-200 dark:border-gray-700"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
