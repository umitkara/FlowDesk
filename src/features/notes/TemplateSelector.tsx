import { useState, useEffect, useRef, useCallback } from "react";
import { listTemplates } from "../../lib/ipc";
import type { NoteTemplate, TemplateVariable } from "../../lib/types";

/** Props for the TemplateSelector dialog. */
interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (
    templateName: string | null,
    variables: Record<string, string>,
  ) => void;
  date?: string;
  workspaceId: string;
}

/** Builds the initial variable values from template variable defaults. */
function buildDefaults(variables: TemplateVariable[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const v of variables) {
    if (v.default != null) {
      values[v.name] = String(v.default);
    } else if (v.var_type === "boolean") {
      values[v.name] = "false";
    } else {
      values[v.name] = "";
    }
  }
  return values;
}

/** Modal dialog for selecting a note template when creating a new note. */
export function TemplateSelector({
  isOpen,
  onClose,
  onSelect,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<NoteTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );

  const searchRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Load templates when dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSearch("");
    setSelected(null);
    setVariableValues({});
    listTemplates()
      .then((t) => setTemplates(t))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Focus the search input when the dialog opens.
  useEffect(() => {
    if (isOpen) {
      // Delay to ensure the DOM is rendered.
      const id = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Close on Escape key.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const query = search.toLowerCase();
  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query),
  );

  const handleSelectTemplate = (template: NoteTemplate) => {
    if (template.variables.length === 0) {
      onSelect(template.file_name, {});
    } else {
      setSelected(template);
      setVariableValues(buildDefaults(template.variables));
    }
  };

  const handleCreate = () => {
    if (selected) {
      onSelect(selected.file_name, variableValues);
    }
  };

  const handleBack = () => {
    setSelected(null);
    setVariableValues({});
  };

  const setVariable = (name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  };

  /** Renders an input field for a single template variable. */
  const renderVariableInput = (v: TemplateVariable) => {
    const value = variableValues[v.name] ?? "";

    switch (v.var_type) {
      case "select":
        return (
          <select
            id={`var-${v.name}`}
            value={value}
            onChange={(e) => setVariable(v.name, e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">-- Select --</option>
            {(v.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "date":
        return (
          <input
            id={`var-${v.name}`}
            type="date"
            value={value}
            onChange={(e) => setVariable(v.name, e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        );

      case "number":
        return (
          <input
            id={`var-${v.name}`}
            type="number"
            value={value}
            onChange={(e) => setVariable(v.name, e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        );

      case "boolean":
        return (
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              id={`var-${v.name}`}
              type="checkbox"
              checked={value === "true"}
              onChange={(e) =>
                setVariable(v.name, e.target.checked ? "true" : "false")
              }
              className="rounded border-gray-300 dark:border-gray-600"
            />
            {v.label}
          </label>
        );

      default:
        return (
          <input
            id={`var-${v.name}`}
            type="text"
            value={value}
            onChange={(e) => setVariable(v.name, e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        );
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {selected ? selected.name : "Choose a Template"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Error state */}
        {error && (
          <p className="mb-3 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}

        {/* Loading state */}
        {loading && (
          <p className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            Loading templates...
          </p>
        )}

        {/* Template list view */}
        {!loading && !selected && (
          <>
            {/* Search input */}
            <div className="mb-3">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>

            {/* Template options */}
            <div className="max-h-72 overflow-y-auto">
              {/* Blank Note option */}
              <button
                type="button"
                onClick={() => onSelect(null, {})}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                    Blank Note
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    Start with an empty note
                  </div>
                </div>
              </button>

              {filtered.map((template) => (
                <button
                  key={template.file_name}
                  type="button"
                  onClick={() => handleSelectTemplate(template)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-900/20 dark:text-blue-400">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                      {template.name}
                    </div>
                    {template.description && (
                      <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                        {template.description}
                      </div>
                    )}
                  </div>
                  {template.variables.length > 0 && (
                    <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                      {template.variables.length} field
                      {template.variables.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              ))}

              {filtered.length === 0 && !loading && (
                <div className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                  No templates match your search
                </div>
              )}
            </div>
          </>
        )}

        {/* Variable input view */}
        {!loading && selected && (
          <>
            {selected.description && (
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {selected.description}
              </p>
            )}

            <div className="max-h-72 space-y-3 overflow-y-auto">
              {selected.variables.map((v) => (
                <div key={v.name}>
                  {v.var_type !== "boolean" && (
                    <label
                      htmlFor={`var-${v.name}`}
                      className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400"
                    >
                      {v.label}
                    </label>
                  )}
                  {renderVariableInput(v)}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create Note
                </button>
              </div>
            </div>
          </>
        )}

        {/* Footer for list view */}
        {!loading && !selected && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
