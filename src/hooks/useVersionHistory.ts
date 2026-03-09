import { useState, useCallback, useRef } from "react";
import * as ipc from "../lib/ipc";
import { reportError } from "../lib/errorReporting";
import type { NoteVersionSummary, VersionDiff, NoteVersion } from "../lib/types";

/** Hook for managing note version history. */
export function useVersionHistory(noteId: string | null) {
  const [versions, setVersions] = useState<NoteVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadVersions = useCallback(async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const v = await ipc.listVersions(noteId);
      setVersions(v);
    } catch (e) {
      reportError("useVersionHistory.loadVersions", e);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  const viewVersion = useCallback(async (versionId: string) => {
    try {
      const v = await ipc.getVersion(versionId);
      setSelectedVersion(v);
    } catch (e) {
      reportError("useVersionHistory.viewVersion", e);
    }
  }, []);

  const computeDiff = useCallback(async (fromId: string, toId: string) => {
    try {
      const d = await ipc.diffVersions(fromId, toId);
      setDiff(d);
    } catch (e) {
      reportError("useVersionHistory.computeDiff", e);
    }
  }, []);

  const restoreVersion = useCallback(async (versionId: string) => {
    try {
      await ipc.restoreVersion(versionId);
      await loadVersions();
    } catch (e) {
      reportError("useVersionHistory.restoreVersion", e);
    }
  }, [loadVersions]);

  const deleteVersion = useCallback(async (versionId: string) => {
    try {
      await ipc.deleteVersion(versionId);
      await loadVersions();
      if (selectedVersion?.id === versionId) {
        setSelectedVersion(null);
      }
    } catch {
      // ignore
    }
  }, [loadVersions, selectedVersion]);

  const pruneVersions = useCallback(async (maxKeep?: number) => {
    if (!noteId) return;
    try {
      await ipc.pruneVersions(noteId, maxKeep);
      await loadVersions();
    } catch {
      // ignore
    }
  }, [noteId, loadVersions]);

  /** Schedule a debounced snapshot after changes. */
  const scheduleSnapshot = useCallback((workspaceId: string, title: string | null, body: string, debounceSecs: number) => {
    if (!noteId) return;
    if (snapshotTimer.current) {
      clearTimeout(snapshotTimer.current);
    }
    snapshotTimer.current = setTimeout(() => {
      ipc.createVersion(noteId, workspaceId, title, body).catch(() => {});
    }, debounceSecs * 1000);
  }, [noteId]);

  return {
    versions,
    selectedVersion,
    diff,
    loading,
    loadVersions,
    viewVersion,
    computeDiff,
    restoreVersion,
    deleteVersion,
    pruneVersions,
    scheduleSnapshot,
    setSelectedVersion,
    setDiff,
  };
}
