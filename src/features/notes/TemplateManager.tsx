import { useCallback, useEffect, useState } from "react";
import { useTemplateStore } from "../../stores/templateStore";
import type {
  NoteTemplate,
  TemplateVariable,
} from "../../lib/types";

/** Variable type options for the dropdown. */
const VAR_TYPES = ["text", "select", "date", "number", "boolean"] as const;

/** Creates a blank variable entry. */
function emptyVariable(): TemplateVariable {
  return { name: "", label: "", var_type: "text", default: null, options: null };
}

/** Full-page template management view with a two-column layout. */
export function TemplateManager() {
  const templates = useTemplateStore((s) => s.templates);
  const isLoading = useTemplateStore((s) => s.isLoading);
  const selectedTemplate = useTemplateStore((s) => s.selectedTemplate);
  const loadTemplates = useTemplateStore((s) => s.loadTemplates);
  const createTemplate = useTemplateStore((s) => s.createTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const setSelectedTemplate = useTemplateStore((s) => s.setSelectedTemplate);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleNewTemplate = useCallback(async () => {
    const fileName = prompt("Template file name (e.g. meeting-notes):");
    if (!fileName?.trim()) return;
    const sanitized = fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    try {
      const created = await createTemplate({
        file_name: sanitized,
        name: sanitized,
        description: "",
        defaults: {},
        variables: [],
        body: "",
      });
      setSelectedTemplate(created);
    } catch (e) {
      console.error("Failed to create template:", e);
    }
  }, [createTemplate, setSelectedTemplate]);

  const handleDelete = useCallback(
    async (fileName: string) => {
      const confirmed = confirm(
        `Delete template "${fileName}"? This cannot be undone.`,
      );
      if (!confirmed) return;
      try {
        await deleteTemplate(fileName);
      } catch (e) {
        console.error("Failed to delete template:", e);
      }
    },
    [deleteTemplate],
  );

  const selected = templates.find((t) => t.file_name === selectedTemplate) ?? null;

  return (
    <div className="flex h-full">
      {/* Left panel: template list */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-3 dark:border-gray-700">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Templates
          </h1>
          <button
            onClick={handleNewTemplate}
            title="New Template"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
              Loading...
            </p>
          )}

          {!isLoading && templates.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
              No templates yet
            </p>
          )}

          {templates.map((t) => (
            <div
              key={t.file_name}
              onClick={() => setSelectedTemplate(t.file_name)}
              className={`flex cursor-pointer items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800 ${
                selectedTemplate === t.file_name
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t.name || t.file_name}
                </p>
                {t.description && (
                  <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500">
                    {t.description}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTemplate(t.file_name);
                  }}
                  title="Edit template"
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t.file_name);
                  }}
                  title="Delete template"
                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Right panel: editor */}
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Select a template or create a new one
            </p>
          </div>
        ) : (
          <TemplateEditor
            key={selected.file_name}
            template={selected}
            onSave={updateTemplate}
          />
        )}
      </main>
    </div>
  );
}

/** Editor form for a single template. */
function TemplateEditor({
  template,
  onSave,
}: {
  template: NoteTemplate;
  onSave: (fileName: string, update: { name?: string; description?: string; variables?: TemplateVariable[]; body?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [variables, setVariables] = useState<TemplateVariable[]>(
    template.variables.length > 0
      ? template.variables
      : [],
  );
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddVariable = useCallback(() => {
    setVariables((prev) => [...prev, emptyVariable()]);
  }, []);

  const handleRemoveVariable = useCallback((index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleVariableChange = useCallback(
    (index: number, field: keyof TemplateVariable, value: unknown) => {
      setVariables((prev) =>
        prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(template.file_name, {
        name: name.trim(),
        description: description.trim(),
        variables,
        body,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [name, description, variables, body, template.file_name, onSave]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          {template.name || template.file_name}
        </h2>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
          {template.file_name}
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description of this template"
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        />
      </div>

      {/* Variables */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Variables
          </label>
          <button
            onClick={handleAddVariable}
            className="rounded border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            + Add Variable
          </button>
        </div>

        {variables.length === 0 && (
          <p className="py-2 text-xs text-gray-400 dark:text-gray-500">
            No variables defined. Add one to create dynamic fields.
          </p>
        )}

        <div className="space-y-3">
          {variables.map((v, idx) => (
            <VariableRow
              key={idx}
              variable={v}
              index={idx}
              onChange={handleVariableChange}
              onRemove={handleRemoveVariable}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Body (Markdown)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          placeholder={"# {{title}}\n\nTemplate body with {{variable}} placeholders..."}
          className="w-full resize-y rounded border border-gray-200 px-2 py-1.5 font-mono text-xs leading-relaxed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Template"}
        </button>
      </div>
    </div>
  );
}

/** A single variable row with name, label, type, default, and options fields. */
function VariableRow({
  variable,
  index,
  onChange,
  onRemove,
}: {
  variable: TemplateVariable;
  index: number;
  onChange: (index: number, field: keyof TemplateVariable, value: unknown) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Variable {index + 1}
        </span>
        <button
          onClick={() => onRemove(index)}
          className="rounded border border-red-200 px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Name */}
        <div>
          <label className="mb-0.5 block text-[10px] text-gray-400">Name</label>
          <input
            type="text"
            value={variable.name}
            onChange={(e) => onChange(index, "name", e.target.value)}
            placeholder="variable_name"
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        </div>

        {/* Label */}
        <div>
          <label className="mb-0.5 block text-[10px] text-gray-400">Label</label>
          <input
            type="text"
            value={variable.label}
            onChange={(e) => onChange(index, "label", e.target.value)}
            placeholder="Display label"
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        </div>

        {/* Type */}
        <div>
          <label className="mb-0.5 block text-[10px] text-gray-400">Type</label>
          <select
            value={variable.var_type}
            onChange={(e) => onChange(index, "var_type", e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {VAR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Default */}
        <div>
          <label className="mb-0.5 block text-[10px] text-gray-400">Default</label>
          <input
            type="text"
            value={variable.default != null ? String(variable.default) : ""}
            onChange={(e) =>
              onChange(index, "default", e.target.value || null)
            }
            placeholder="Default value"
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        </div>
      </div>

      {/* Options (shown for select type) */}
      {variable.var_type === "select" && (
        <div className="mt-2">
          <label className="mb-0.5 block text-[10px] text-gray-400">
            Options (comma-separated)
          </label>
          <input
            type="text"
            value={variable.options?.join(", ") ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const opts = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              onChange(index, "options", opts.length > 0 ? opts : null);
            }}
            placeholder="option1, option2, option3"
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        </div>
      )}
    </div>
  );
}
