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
        <Field
          label="Date"
          value={activeNote.date ?? ""}
          onChange={(v) => handleFieldChange("date", v)}
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
        <Field
          label="Color"
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
