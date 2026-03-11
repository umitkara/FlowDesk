import { useState, useCallback } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { ColorPresetPicker } from "../../components/shared/ColorPresetPicker";
import { EmojiPickerPopover } from "../../components/shared/EmojiPickerPopover";
import type { Workspace } from "../../lib/types";

/** Workspace settings panel for the active workspace's configuration. */
export function WorkspaceSettings() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const updateConfig = useWorkspaceStore((s) => s.updateConfig);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const setActiveView = useUIStore((s) => s.setActiveView);

  if (!activeWorkspace) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure settings for <strong>{activeWorkspace.name}</strong>.
        </p>
      </div>

      {/* General Settings */}
      <GeneralSection workspace={activeWorkspace} onSave={updateWorkspace} />

      {/* Categories */}
      <ListEditor
        title="Categories"
        description="Custom categories for organizing content."
        items={activeWorkspace.config.categories}
        onSave={(categories) => updateConfig({ categories })}
        placeholder="Add a category..."
      />

      {/* Note Types */}
      <ListEditor
        title="Note Types"
        description="Available note type options."
        items={activeWorkspace.config.note_types}
        onSave={(note_types) => updateConfig({ note_types })}
        placeholder="Add a note type..."
      />

      {/* Task Categories */}
      <ListEditor
        title="Task Categories"
        description="Task category options."
        items={activeWorkspace.config.task_categories}
        onSave={(task_categories) => updateConfig({ task_categories })}
        placeholder="Add a task category..."
      />

      {/* Dashboard Widgets */}
      <DashboardWidgetConfig
        widgets={activeWorkspace.config.dashboard_widgets}
        onSave={(dashboard_widgets) => updateConfig({ dashboard_widgets })}
      />

      {/* Danger Zone */}
      <DangerZone
        workspace={activeWorkspace}
        onDelete={async () => {
          await deleteWorkspace(activeWorkspace.id);
          setActiveView("dashboard");
        }}
      />
      </div>
    </div>
  );
}

/** General workspace metadata editor. */
function GeneralSection({
  workspace,
  onSave,
}: {
  workspace: Workspace;
  onSave: (input: { id: string; name?: string; icon?: string; color?: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState(workspace.name);
  const [icon, setIcon] = useState(workspace.icon ?? "");
  const [color, setColor] = useState(workspace.config.accent_color);
  const [saving, setSaving] = useState(false);
  const updateConfig = useWorkspaceStore((s) => s.updateConfig);

  const isDirty =
    name !== workspace.name ||
    icon !== (workspace.icon ?? "") ||
    color !== workspace.config.accent_color;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: workspace.id,
        name: name.trim(),
        icon: icon || undefined,
        color: color || undefined,
      });
      if (color !== workspace.config.accent_color) {
        await updateConfig({ accent_color: color });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        General
      </h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <EmojiPickerPopover value={icon} onChange={setIcon} />
        <ColorPresetPicker value={color} onChange={setColor} />
        {isDirty && (
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Editable list of string items (categories, note types, etc.). */
function ListEditor({
  title,
  description,
  items,
  onSave,
  placeholder,
}: {
  title: string;
  description: string;
  items: string[];
  onSave: (items: string[]) => Promise<void>;
  placeholder: string;
}) {
  const [newItem, setNewItem] = useState("");

  const handleAdd = async () => {
    const value = newItem.trim().toLowerCase();
    if (!value || items.includes(value)) return;
    await onSave([...items, value]);
    setNewItem("");
  };

  const handleRemove = async (item: string) => {
    await onSave(items.filter((i) => i !== item));
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title}
      </h3>
      <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
        {description}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {item}
            <button
              onClick={() => handleRemove(item)}
              className="ml-0.5 text-gray-400 hover:text-red-500"
              title={`Remove ${item}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newItem.trim()}
          className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Add
        </button>
      </div>
    </section>
  );
}

/** Available dashboard widget identifiers. */
const AVAILABLE_WIDGETS = [
  { id: "today_plan", label: "Today's Plan" },
  { id: "pending_tasks", label: "Pending Tasks" },
  { id: "recent_notes", label: "Recent Notes" },
  { id: "time_today", label: "Time Today" },
  { id: "sticky_tasks", label: "Sticky Tasks" },
  { id: "upcoming_deadlines", label: "Upcoming Deadlines" },
];

/** Dashboard widget configuration editor. */
function DashboardWidgetConfig({
  widgets,
  onSave,
}: {
  widgets: string[];
  onSave: (widgets: string[]) => Promise<void>;
}) {
  const toggleWidget = useCallback(
    (id: string) => {
      if (widgets.includes(id)) {
        onSave(widgets.filter((w) => w !== id));
      } else {
        onSave([...widgets, id]);
      }
    },
    [widgets, onSave],
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Dashboard Widgets
      </h3>
      <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
        Choose which widgets appear on the workspace dashboard.
      </p>
      <div className="space-y-1.5">
        {AVAILABLE_WIDGETS.map((w) => (
          <label
            key={w.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <input
              type="checkbox"
              checked={widgets.includes(w.id)}
              onChange={() => toggleWidget(w.id)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
            />
            <span className="text-gray-700 dark:text-gray-300">{w.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** Danger zone section with workspace deletion. */
function DangerZone({
  workspace,
  onDelete,
}: {
  workspace: Workspace;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = await ask(
      `Delete workspace "${workspace.name}"? All notes, tasks, plans, and time entries in this workspace will be soft-deleted.`,
      { title: "Delete Workspace", kind: "warning" },
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="rounded-lg border border-red-200 p-4 dark:border-red-900/50">
      <h3 className="mb-1 text-sm font-semibold text-red-600 dark:text-red-400">
        Danger Zone
      </h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Deleting a workspace soft-deletes all its entities. This cannot be the last workspace.
      </p>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        {deleting ? "Deleting..." : "Delete Workspace"}
      </button>
    </section>
  );
}
