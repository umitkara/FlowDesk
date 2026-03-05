import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as ipc from "../../lib/ipc";
import type { GraphData, GraphNode } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUIStore } from "../../stores/uiStore";

/** Entity type color mapping. */
const ENTITY_COLORS: Record<string, string> = {
  note: "#3b82f6",
  task: "#22c55e",
  plan: "#8b5cf6",
  time_entry: "#f97316",
};

/** All available entity type filter options. */
const ENTITY_TYPES = ["note", "task", "plan", "time_entry"] as const;

/** Human-readable labels for entity types. */
const ENTITY_LABELS: Record<string, string> = {
  note: "Notes",
  task: "Tasks",
  plan: "Plans",
  time_entry: "Time Entries",
};

/** Internal node shape used by the force graph. */
interface InternalNode extends GraphNode {
  x?: number;
  y?: number;
  connections: number;
}

/** Link shape expected by react-force-graph-2d. */
interface InternalLink {
  source: string;
  target: string;
  relation: string;
}

export default function GraphView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const selectNote = useNoteStore((s) => s.selectNote);
  const openDetail = useTaskStore((s) => s.openDetail);
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Controls
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    new Set(ENTITY_TYPES),
  );
  const [depth, setDepth] = useState(2);
  const [maxNodes, setMaxNodes] = useState(150);

  // Data
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ipc.getGraphData({
        workspace_id: activeWorkspaceId,
        entity_types: Array.from(enabledTypes),
        depth,
        max_nodes: maxNodes,
      });
      setRawData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, enabledTypes, depth, maxNodes]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Build the graph structure for react-force-graph-2d
  const graphData = useMemo(() => {
    if (!rawData) return { nodes: [] as InternalNode[], links: [] as InternalLink[] };

    // Count connections per node
    const connectionCount = new Map<string, number>();
    for (const edge of rawData.edges) {
      connectionCount.set(edge.source, (connectionCount.get(edge.source) ?? 0) + 1);
      connectionCount.set(edge.target, (connectionCount.get(edge.target) ?? 0) + 1);
    }

    const nodes: InternalNode[] = rawData.nodes.map((n) => ({
      ...n,
      connections: connectionCount.get(n.id) ?? 0,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: InternalLink[] = rawData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
      }));

    return { nodes, links };
  }, [rawData]);

  // Toggle an entity type filter
  const toggleType = useCallback((type: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow deselecting all types
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Reset controls to defaults
  const handleReset = useCallback(() => {
    setEnabledTypes(new Set(ENTITY_TYPES));
    setDepth(2);
    setMaxNodes(150);
  }, []);

  // Navigate to entity on click
  const handleNodeClick = useCallback(
    (node: InternalNode) => {
      switch (node.entity_type) {
        case "note":
          selectNote(node.id);
          setActiveView("notes");
          break;
        case "task":
          openDetail(node.id);
          setActiveView("tasks");
          break;
        case "plan":
          setActiveView("plans");
          break;
        case "time_entry":
          setActiveView("time-reports");
          break;
      }
    },
    [selectNote, openDetail, setActiveView],
  );

  // Custom node rendering
  const nodeCanvasObject = useCallback(
    (node: InternalNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const connections = node.connections ?? 0;
      const radius = Math.min(16, Math.max(4, 4 + connections * 1.5));
      const color = ENTITY_COLORS[node.entity_type] ?? "#6b7280";

      // Circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Label (only show when zoomed in enough)
      if (globalScale >= 1.2) {
        const label = node.title || "Untitled";
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(
          label.length > 24 ? label.slice(0, 22) + "..." : label,
          x,
          y + radius + 2,
        );
      }
    },
    [],
  );

  // Tooltip on hover
  const nodeLabel = useCallback((node: InternalNode) => {
    const type = ENTITY_LABELS[node.entity_type] ?? node.entity_type;
    const title = node.title || "Untitled";
    return `${title}\n(${type} - ${node.connections} connections)`;
  }, []);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        {/* Entity type filters */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Show:
          </span>
          {ENTITY_TYPES.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={enabledTypes.has(type)}
                onChange={() => toggleType(type)}
                className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600"
                style={{ accentColor: ENTITY_COLORS[type] }}
              />
              <span
                className="font-medium"
                style={{ color: ENTITY_COLORS[type] }}
              >
                {ENTITY_LABELS[type]}
              </span>
            </label>
          ))}
        </div>

        {/* Depth selector */}
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="graph-depth"
            className="text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Depth:
          </label>
          <select
            id="graph-depth"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Max nodes input */}
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="graph-max-nodes"
            className="text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Max nodes:
          </label>
          <input
            id="graph-max-nodes"
            type="number"
            min={10}
            max={500}
            value={maxNodes}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 10 && v <= 500) setMaxNodes(v);
            }}
            className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          />
        </div>

        {/* Reset button */}
        <button
          onClick={handleReset}
          className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Reset
        </button>

        {/* Stats */}
        {rawData && !loading && (
          <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
            {graphData.nodes.length} nodes, {graphData.links.length} edges
          </span>
        )}
      </div>

      {/* Graph area */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Loading graph data...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 dark:border-red-800 dark:bg-red-900/30">
              <p className="text-sm text-red-600 dark:text-red-400">
                Failed to load graph: {error}
              </p>
              <button
                onClick={fetchGraph}
                className="mt-2 text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No entities with references found. Create references between notes,
              tasks, and plans to see connections here.
            </p>
          </div>
        )}

        {graphData.nodes.length > 0 && (
          <ForceGraph2D
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeCanvasObject={nodeCanvasObject as never}
            nodeLabel={nodeLabel as never}
            onNodeClick={handleNodeClick as never}
            linkColor={(link: { relation?: string }) =>
              link.relation === "subtask"
                ? "rgba(34,197,94,0.45)"
                : "rgba(150,150,150,0.25)"
            }
            linkWidth={(link: { relation?: string }) =>
              link.relation === "subtask" ? 1.5 : 1
            }
            linkLineDash={(link: { relation?: string }) =>
              link.relation === "subtask" ? [4, 2] : null
            }
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            backgroundColor="transparent"
            cooldownTicks={100}
            enableNodeDrag
            enableZoomInteraction
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 border-t border-gray-200 px-4 py-1.5 dark:border-gray-700">
        {ENTITY_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENTITY_COLORS[type] }}
            />
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {ENTITY_LABELS[type]}
            </span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
          Node size = connection count. Click a node to navigate.
        </span>
      </div>
    </div>
  );
}
