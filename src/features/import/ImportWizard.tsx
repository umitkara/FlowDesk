import { useState, useCallback } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import * as ipc from "../../lib/ipc";
import type { ImportResult, CsvPreview } from "../../lib/types";
import { FieldMapper } from "./FieldMapper";
import { open } from "@tauri-apps/plugin-dialog";

type ImportType = "markdown" | "obsidian" | "csv";
type Step = "select" | "configure" | "mapping" | "importing" | "result";

/** Multi-step import wizard dialog. */
export function ImportWizard() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const [step, setStep] = useState<Step>("select");
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [targetFolder, setTargetFolder] = useState("/imported");
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [convertWikilinks, setConvertWikilinks] = useState(true);
  const [importTags, setImportTags] = useState(true);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<{
    title: number;
    description?: number;
    status?: number;
    priority?: number;
    due_date?: number;
    category?: number;
    tags?: number;
  }>({
    title: 0,
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFolder = useCallback(async () => {
    const selected = await open({ directory: importType !== "csv", multiple: false, filters: importType === "csv" ? [{ name: "CSV", extensions: ["csv", "tsv"] }] : undefined });
    if (selected && typeof selected === "string") {
      setSourcePath(selected);
      if (importType === "csv") {
        try {
          const preview = await ipc.previewCsv(selected);
          setCsvPreview(preview);
          setStep("mapping");
        } catch (e) {
          setError(String(e));
        }
      } else {
        setStep("configure");
      }
    }
  }, [importType]);

  const handleImport = useCallback(async () => {
    if (!workspaceId || !sourcePath) return;
    setStep("importing");
    setError(null);

    try {
      let importResult: ImportResult;
      if (importType === "markdown") {
        importResult = await ipc.importMarkdownFolder({
          source_dir: sourcePath,
          workspace_id: workspaceId,
          target_folder: targetFolder || undefined,
          preserve_folder_structure: preserveStructure,
          overwrite_existing: false,
        });
      } else if (importType === "obsidian") {
        importResult = await ipc.importObsidianVault({
          vault_path: sourcePath,
          workspace_id: workspaceId,
          target_folder: targetFolder || undefined,
          convert_wikilinks: convertWikilinks,
          import_tags: importTags,
        });
      } else {
        importResult = await ipc.importCsvTasks({
          file_path: sourcePath,
          workspace_id: workspaceId,
          has_header: true,
          field_mapping: fieldMapping,
        });
      }

      setResult(importResult);
      setStep("result");

      // Refresh stores
      loadNotes();
      fetchTasks();
    } catch (e) {
      setError(String(e));
      setStep("configure");
    }
  }, [workspaceId, sourcePath, importType, targetFolder, preserveStructure, convertWikilinks, importTags, fieldMapping, loadNotes, fetchTasks]);

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Import Data
        </h1>
        <button
          onClick={() => setActiveView("settings")}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Step 1: Select import type */}
      {step === "select" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose what to import:</p>
          {([
            { type: "markdown" as ImportType, title: "Markdown Folder", desc: "Import .md files from a directory" },
            { type: "obsidian" as ImportType, title: "Obsidian Vault", desc: "Import an Obsidian vault with wikilink conversion" },
            { type: "csv" as ImportType, title: "CSV Tasks", desc: "Import tasks from a CSV or TSV file" },
          ]).map((opt) => (
            <button
              key={opt.type}
              onClick={() => { setImportType(opt.type); handleSelectFolder(); }}
              className="flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
            >
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{opt.title}</div>
                <div className="text-xs text-gray-400">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Configure options */}
      {step === "configure" && (
        <div className="space-y-4">
          <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            Source: {sourcePath}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Target Folder</label>
            <input
              type="text"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          {importType === "markdown" && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={preserveStructure} onChange={(e) => setPreserveStructure(e.target.checked)} className="rounded" />
              Preserve folder structure
            </label>
          )}

          {importType === "obsidian" && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={convertWikilinks} onChange={(e) => setConvertWikilinks(e.target.checked)} className="rounded" />
                Convert [[wikilinks]] to standard links
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={importTags} onChange={(e) => setImportTags(e.target.checked)} className="rounded" />
                Import tags from front matter
              </label>
            </>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep("select")} className="rounded-md px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              Back
            </button>
            <button onClick={handleImport} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              Start Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: CSV field mapping */}
      {step === "mapping" && csvPreview && (
        <div className="space-y-4">
          <FieldMapper
            headers={csvPreview.headers}
            rows={csvPreview.rows}
            mapping={fieldMapping}
            onMappingChange={setFieldMapping}
          />
          <div className="flex gap-2">
            <button onClick={() => setStep("select")} className="rounded-md px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              Back
            </button>
            <button onClick={handleImport} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              Import {csvPreview.total_rows} Tasks
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <div className="flex flex-col items-center py-12">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
          <p className="text-sm text-gray-500">Importing...</p>
        </div>
      )}

      {/* Step 5: Result */}
      {step === "result" && result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <div className="text-sm font-medium text-green-800 dark:text-green-300">
              Import Complete
            </div>
            <div className="mt-1 text-xs text-green-600 dark:text-green-400">
              {result.imported_count} items imported
              {result.skipped_count > 0 && `, ${result.skipped_count} skipped`}
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <div className="mb-1 text-xs font-medium text-red-700 dark:text-red-300">
                {result.errors.length} error(s):
              </div>
              <div className="max-h-32 overflow-auto text-xs text-red-600 dark:text-red-400">
                {result.errors.map((e, i) => (
                  <div key={i}>{e.file_path}: {e.message}</div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setActiveView("notes")}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
