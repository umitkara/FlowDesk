import { useState } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { save, open } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../lib/ipc";
import type { EnhancedExportResult } from "../../lib/types";

type Tab = "json" | "csv" | "markdown";

/** Modal dialog for exporting workspace data. */
export function ExportDialog() {
  const isOpen = useUIStore((s) => s.showExportDialog);
  const toggle = useUIStore((s) => s.toggleExportDialog);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [tab, setTab] = useState<Tab>("json");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnhancedExportResult | null>(null);

  // JSON options
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includePlans, setIncludePlans] = useState(true);
  const [includeTimeEntries, setIncludeTimeEntries] = useState(true);

  // CSV options
  const [includeDone, setIncludeDone] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  // Markdown options
  const [includeFrontMatter, setIncludeFrontMatter] = useState(true);

  if (!isOpen) return null;

  const wsId = activeWorkspaceId || "";

  const handleExportJson = async () => {
    const path = await save({
      title: "Export Workspace as JSON",
      defaultPath: "flowdesk-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await ipc.exportWorkspaceJson({
        workspace_id: wsId,
        output_path: path,
        include_notes: includeNotes,
        include_tasks: includeTasks,
        include_plans: includePlans,
        include_time_entries: includeTimeEntries,
        pretty_print: true,
      });
      setResult(res);
    } catch (e) {
      setResult({ exported_count: 0, output_path: "", format: "json", errors: [String(e)] });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    const path = await save({
      title: "Export Tasks as CSV",
      defaultPath: "tasks-export.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await ipc.exportTasksCsv({
        workspace_id: wsId,
        output_path: path,
        include_done: includeDone,
        include_cancelled: includeCancelled,
      });
      setResult(res);
    } catch (e) {
      setResult({ exported_count: 0, output_path: "", format: "csv", errors: [String(e)] });
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = async () => {
    const dir = await open({ directory: true, title: "Export Notes as Markdown" });
    if (typeof dir !== "string") return;
    setLoading(true);
    setResult(null);
    try {
      const res = await ipc.exportNotesMarkdown({
        workspace_id: wsId,
        output_dir: dir,
        include_front_matter: includeFrontMatter,
        flatten_folders: false,
      });
      setResult(res);
    } catch (e) {
      setResult({ exported_count: 0, output_path: "", format: "markdown", errors: [String(e)] });
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (t: Tab) =>
    `flex-1 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
      tab === t
        ? "bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    }`;

  const checkboxRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={toggle}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Export Data</h2>
          <button
            onClick={toggle}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-gray-100 px-5 dark:bg-gray-850">
          <button className={tabClass("json")} onClick={() => { setTab("json"); setResult(null); }}>
            Workspace JSON
          </button>
          <button className={tabClass("csv")} onClick={() => { setTab("csv"); setResult(null); }}>
            Tasks CSV
          </button>
          <button className={tabClass("markdown")} onClick={() => { setTab("markdown"); setResult(null); }}>
            Notes Markdown
          </button>
        </div>

        {/* Tab content */}
        <div className="space-y-3 px-5 py-4">
          {tab === "json" && (
            <>
              <div className="space-y-2">
                {checkboxRow("Include Notes", includeNotes, setIncludeNotes)}
                {checkboxRow("Include Tasks", includeTasks, setIncludeTasks)}
                {checkboxRow("Include Plans", includePlans, setIncludePlans)}
                {checkboxRow("Include Time Entries", includeTimeEntries, setIncludeTimeEntries)}
              </div>
              <button
                onClick={handleExportJson}
                disabled={loading}
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? "Exporting..." : "Export as JSON"}
              </button>
            </>
          )}

          {tab === "csv" && (
            <>
              <div className="space-y-2">
                {checkboxRow("Include Done Tasks", includeDone, setIncludeDone)}
                {checkboxRow("Include Cancelled Tasks", includeCancelled, setIncludeCancelled)}
              </div>
              <button
                onClick={handleExportCsv}
                disabled={loading}
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? "Exporting..." : "Export as CSV"}
              </button>
            </>
          )}

          {tab === "markdown" && (
            <>
              <div className="space-y-2">
                {checkboxRow("Include Front Matter", includeFrontMatter, setIncludeFrontMatter)}
              </div>
              <button
                onClick={handleExportMarkdown}
                disabled={loading}
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? "Exporting..." : "Export as Markdown"}
              </button>
            </>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-3 text-xs ${
              result.errors.length > 0
                ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
            }`}>
              <div className="font-medium">
                Exported {result.exported_count} item{result.exported_count !== 1 ? "s" : ""}
              </div>
              {result.output_path && (
                <div className="mt-0.5 truncate text-[10px] opacity-75">{result.output_path}</div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {result.errors.slice(0, 3).map((err, i) => (
                    <div key={i} className="truncate">{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
