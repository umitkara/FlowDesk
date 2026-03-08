import { useCallback } from "react";
import { useNoteStore } from "../../stores/noteStore";
import type { UpdateNoteInput } from "../../lib/types";

/** Right-drawer panel for editing note metadata (front matter fields). */
export function FrontMatterPanel() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const updateNote = useNoteStore((s) => s.updateNote);

  const handleFieldChange = useCallback(
    (field: keyof UpdateNoteInput, value: string) => {
      if (!activeNote) return;
      updateNote(activeNote.id, { [field]: value || undefined });
    },
    [activeNote, updateNote],
  );

  const handleTagsChange = useCallback(
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
          onChange={(v) => handleFieldChange("title", v)}
        />
        <ClearableField
          label="Date"
          value={activeNote.date ?? ""}
          onChange={(v) => {
            if (!activeNote) return;
            updateNote(activeNote.id, { date: v });
          }}
          type="date"
        />
        <Field
          label="Folder"
          value={activeNote.folder ?? ""}
          onChange={(v) => handleFieldChange("folder", v)}
          placeholder="/path/to/folder"
        />
        <Field
          label="Category"
          value={activeNote.category ?? ""}
          onChange={(v) => handleFieldChange("category", v)}
        />
        <Field
          label="Type"
          value={activeNote.note_type ?? ""}
          onChange={(v) => handleFieldChange("note_type", v)}
        />
        <Field
          label="Importance"
          value={activeNote.importance ?? ""}
          onChange={(v) => handleFieldChange("importance", v)}
        />
        <ColorField
          value={activeNote.color ?? ""}
          onChange={(v) => handleFieldChange("color", v)}
        />
        <Field
          label="Tags"
          value={activeNote.tags.join(", ")}
          onChange={handleTagsChange}
          placeholder="tag1, tag2, ..."
        />
      </div>
    </div>
  );
}

/** A single metadata form field. */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      />
    </div>
  );
}

/** A metadata field with an optional clear button (useful for date inputs that browsers won't let you empty). */
function ClearableField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        />
        {value && (
          <button
            onClick={() => onChange("")}
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
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Color
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#3b82f6"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-transparent p-0.5 dark:border-gray-700 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#hex or name"
          className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        />
        {value && (
          <button
            onClick={() => onChange("")}
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
            onClick={() => onChange(c)}
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
