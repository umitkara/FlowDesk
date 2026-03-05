import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as ipc from "../../lib/ipc";
import type { GraphData, GraphNode } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUIStore } from "../../stores/uiStore";

// ---------------------------------------------------------------------------
// Constants & mappings
// ---------------------------------------------------------------------------

const ENTITY_COLORS: Record<string, string> = {
  note: "#3b82f6",
  task: "#22c55e",
  plan: "#a855f7",
  time_entry: "#f97316",
};

const ENTITY_LABELS: Record<string, string> = {
  note: "Notes",
  task: "Tasks",
  plan: "Plans",
  time_entry: "Time Entries",
};

const ENTITY_TYPES = ["note", "task", "plan", "time_entry"] as const;

/** Relation types with their visual style. */
const RELATION_STYLES: Record<
  string,
  { color: string; dash: number[] | null; label: string; width: number }
> = {
  references: {
    color: "rgba(148,163,184,0.45)",
    dash: null,
    label: "References",
    width: 1,
  },
  blocks: {
    color: "rgba(239,68,68,0.7)",
    dash: null,
    label: "Blocks",
    width: 1.8,
  },
  blocked_by: {
    color: "rgba(239,68,68,0.5)",
    dash: [6, 3],
    label: "Blocked by",
    width: 1.4,
  },
  subtask: {
    color: "rgba(34,197,94,0.6)",
    dash: [4, 2],
    label: "Subtask",
    width: 1.5,
  },
  subtask_of: {
    color: "rgba(34,197,94,0.6)",
    dash: [4, 2],
    label: "Subtask of",
    width: 1.5,
  },
  related_to: {
    color: "rgba(59,130,246,0.5)",
    dash: [2, 2],
    label: "Related",
    width: 1.2,
  },
  spawned: {
    color: "rgba(251,146,60,0.6)",
    dash: null,
    label: "Spawned",
    width: 1.3,
  },
  spawned_from: {
    color: "rgba(251,146,60,0.45)",
    dash: [5, 3],
    label: "Spawned from",
    width: 1.2,
  },
  implements: {
    color: "rgba(168,85,247,0.6)",
    dash: null,
    label: "Implements",
    width: 1.4,
  },
  daily_note_for: {
    color: "rgba(20,184,166,0.5)",
    dash: [3, 3],
    label: "Daily note",
    width: 1,
  },
  scheduled_in: {
    color: "rgba(20,184,166,0.5)",
    dash: null,
    label: "Scheduled in",
    width: 1.2,
  },
  documents: {
    color: "rgba(99,102,241,0.55)",
    dash: null,
    label: "Documents",
    width: 1.2,
  },
  continues: {
    color: "rgba(245,158,11,0.55)",
    dash: [6, 2],
    label: "Continues",
    width: 1.2,
  },
  time_logged: {
    color: "rgba(251,146,60,0.45)",
    dash: [2, 4],
    label: "Time logged",
    width: 1,
  },
};

const DEFAULT_RELATION_STYLE = {
  color: "rgba(148,163,184,0.3)",
  dash: null,
  label: "Link",
  width: 1,
};

const IMPORTANCE_GLOW: Record<string, number> = {
  critical: 14,
  high: 10,
  medium: 0,
  low: 0,
  none: 0,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InternalNode extends GraphNode {
  x?: number;
  y?: number;
  connections: number;
}

interface InternalLink {
  source: string;
  target: string;
  relation: string;
}

interface DetailCard {
  node: InternalNode;
  screenX: number;
  screenY: number;
}

// ---------------------------------------------------------------------------
// Shape drawing helpers
// ---------------------------------------------------------------------------

function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  const size = r * 1.6;
  const half = size / 2;
  const cr = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(x - half + cr, y - half);
  ctx.lineTo(x + half - cr, y - half);
  ctx.quadraticCurveTo(x + half, y - half, x + half, y - half + cr);
  ctx.lineTo(x + half, y + half - cr);
  ctx.quadraticCurveTo(x + half, y + half, x + half - cr, y + half);
  ctx.lineTo(x - half + cr, y + half);
  ctx.quadraticCurveTo(x - half, y + half, x - half, y + half - cr);
  ctx.lineTo(x - half, y - half + cr);
  ctx.quadraticCurveTo(x - half, y - half, x - half + cr, y - half);
  ctx.closePath();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  const s = r * 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * 1.1 * Math.cos(angle);
    const py = y + r * 1.1 * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const SHAPE_DRAWERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void
> = {
  note: drawCircle,
  task: drawRoundedRect,
  plan: drawDiamond,
  time_entry: drawHexagon,
};

// ---------------------------------------------------------------------------
// Dark mode detection hook
// ---------------------------------------------------------------------------

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const check = () => {
      setDark(
        document.documentElement.classList.contains("dark") || mq.matches,
      );
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    mq.addEventListener("change", check);
    return () => {
      obs.disconnect();
      mq.removeEventListener("change", check);
    };
  }, []);
  return dark;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const selectNote = useNoteStore((s) => s.selectNote);
  const openDetail = useTaskStore((s) => s.openDetail);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const isDark = useIsDark();

  // Controls
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    new Set(ENTITY_TYPES),
  );
  const [depth, setDepth] = useState(2);
  const [maxNodes, setMaxNodes] = useState(150);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [centerId, setCenterId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Data
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail card
  const [detail, setDetail] = useState<DetailCard | null>(null);

  // Highlighted search matches
  const highlightedIds = useMemo(() => {
    if (!searchQuery.trim() || !rawData) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      rawData.nodes
        .filter((n) => n.title.toLowerCase().includes(q))
        .map((n) => n.id),
    );
  }, [searchQuery, rawData]);

  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
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
        center_entity_id: centerId ?? undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setRawData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, enabledTypes, depth, maxNodes, centerId, dateFrom, dateTo]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Build graph structure
  const graphData = useMemo(() => {
    if (!rawData)
      return { nodes: [] as InternalNode[], links: [] as InternalLink[] };

    const connectionCount = new Map<string, number>();
    for (const edge of rawData.edges) {
      connectionCount.set(
        edge.source,
        (connectionCount.get(edge.source) ?? 0) + 1,
      );
      connectionCount.set(
        edge.target,
        (connectionCount.get(edge.target) ?? 0) + 1,
      );
    }

    const nodes: InternalNode[] = rawData.nodes.map((n) => ({
      ...n,
      connections: connectionCount.get(n.id) ?? 0,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: InternalLink[] = rawData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, relation: e.relation }));

    return { nodes, links };
  }, [rawData]);

  // Collect unique relation types present in the data
  const activeRelations = useMemo(() => {
    const rels = new Set<string>();
    for (const link of graphData.links) rels.add(link.relation);
    return rels;
  }, [graphData.links]);

  // Toggle entity type filter
  const toggleType = useCallback((type: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Reset to defaults
  const handleReset = useCallback(() => {
    setEnabledTypes(new Set(ENTITY_TYPES));
    setDepth(2);
    setMaxNodes(150);
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setCenterId(null);
    setDetail(null);
  }, []);

  // Focus on a node (double-click)
  const handleNodeDoubleClick = useCallback((node: InternalNode) => {
    setCenterId(node.id);
    setDetail(null);
  }, []);

  // Single click: show detail card
  const handleNodeClick = useCallback(
    (node: InternalNode, event: MouseEvent) => {
      setDetail({ node, screenX: event.clientX, screenY: event.clientY });
    },
    [],
  );

  // Navigate to entity from detail card
  const navigateToEntity = useCallback(
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

  // Close detail card on background click
  const handleBackgroundClick = useCallback(() => {
    setDetail(null);
  }, []);

  // Custom node rendering with shapes, colors, importance glow
  const nodeCanvasObject = useCallback(
    (node: InternalNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const connections = node.connections ?? 0;
      const baseRadius = Math.min(16, Math.max(5, 5 + connections * 1.2));

      // Importance boost
      const imp = node.importance ?? "none";
      const glowRadius = IMPORTANCE_GLOW[imp] ?? 0;
      const importanceBoost = glowRadius > 0 ? 2 : 0;
      const radius = baseRadius + importanceBoost;

      const entityColor = ENTITY_COLORS[node.entity_type] ?? "#6b7280";
      const drawShape = SHAPE_DRAWERS[node.entity_type] ?? drawCircle;

      // Importance glow
      if (glowRadius > 0) {
        ctx.save();
        ctx.shadowColor = entityColor;
        ctx.shadowBlur = glowRadius;
        drawShape(ctx, x, y, radius + 3);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fill();
        ctx.restore();
      }

      // Search highlight ring
      const isHighlighted = highlightedIds.has(node.id);
      if (isHighlighted) {
        ctx.save();
        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 12;
        drawShape(ctx, x, y, radius + 4);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Entity color ring (user-assigned color)
      if (node.color) {
        drawShape(ctx, x, y, radius + 2);
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Main shape fill
      drawShape(ctx, x, y, radius);
      ctx.fillStyle = entityColor;
      ctx.fill();

      // Subtle border
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Importance indicator dot (top-right)
      if (imp === "critical" || imp === "high") {
        ctx.beginPath();
        ctx.arc(x + radius * 0.7, y - radius * 0.7, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = imp === "critical" ? "#ef4444" : "#f59e0b";
        ctx.fill();
      }

      // Label
      if (globalScale >= 1.0) {
        const label = node.title || "Untitled";
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        // Background pill for readability
        const text =
          label.length > 28 ? label.slice(0, 26) + "\u2026" : label;
        const metrics = ctx.measureText(text);
        const px = 3;
        const py = 1.5;
        const labelY = y + radius + 3;

        ctx.fillStyle = isDark
          ? "rgba(15,23,42,0.75)"
          : "rgba(255,255,255,0.85)";
        ctx.beginPath();
        const lw = metrics.width + px * 2;
        const lh = fontSize + py * 2;
        const lx = x - lw / 2;
        const ly = labelY - py;
        const br = 3;
        ctx.moveTo(lx + br, ly);
        ctx.lineTo(lx + lw - br, ly);
        ctx.quadraticCurveTo(lx + lw, ly, lx + lw, ly + br);
        ctx.lineTo(lx + lw, ly + lh - br);
        ctx.quadraticCurveTo(lx + lw, ly + lh, lx + lw - br, ly + lh);
        ctx.lineTo(lx + br, ly + lh);
        ctx.quadraticCurveTo(lx, ly + lh, lx, ly + lh - br);
        ctx.lineTo(lx, ly + br);
        ctx.quadraticCurveTo(lx, ly, lx + br, ly);
        ctx.fill();

        ctx.fillStyle = isDark
          ? "rgba(226,232,240,0.9)"
          : "rgba(30,41,59,0.9)";
        ctx.fillText(text, x, labelY);
      }
    },
    [isDark, highlightedIds],
  );

  // Tooltip
  const nodeLabel = useCallback((node: InternalNode) => {
    const type = ENTITY_LABELS[node.entity_type] ?? node.entity_type;
    const title = node.title || "Untitled";
    const parts = [`${title}`, `${type} \u00b7 ${node.connections} connections`];
    if (node.importance && node.importance !== "none")
      parts.push(`Importance: ${node.importance}`);
    if (node.color) parts.push(`Color: ${node.color}`);
    return parts.join("\n");
  }, []);

  // Link styling
  const linkColor = useCallback((link: InternalLink) => {
    return (RELATION_STYLES[link.relation] ?? DEFAULT_RELATION_STYLE).color;
  }, []);

  const linkWidth = useCallback((link: InternalLink) => {
    return (RELATION_STYLES[link.relation] ?? DEFAULT_RELATION_STYLE).width;
  }, []);

  const linkDash = useCallback((link: InternalLink) => {
    return (RELATION_STYLES[link.relation] ?? DEFAULT_RELATION_STYLE).dash;
  }, []);

  const linkLabel = useCallback((link: InternalLink) => {
    return (RELATION_STYLES[link.relation] ?? DEFAULT_RELATION_STYLE).label;
  }, []);

  // Stats
  const stats = useMemo(() => {
    if (!rawData) return null;
    const types: Record<string, number> = {};
    for (const n of graphData.nodes) {
      types[n.entity_type] = (types[n.entity_type] ?? 0) + 1;
    }
    return { types, nodeCount: graphData.nodes.length, edgeCount: graphData.links.length };
  }, [rawData, graphData]);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      {/* --- Toolbar --- */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        {/* Primary row */}
        <div className="flex items-center gap-3 px-4 py-2">
          {/* Entity type filter pills */}
          <div className="flex items-center gap-1.5">
            {ENTITY_TYPES.map((type) => {
              const active = enabledTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    active
                      ? "shadow-sm ring-1 ring-inset"
                      : "opacity-40 grayscale hover:opacity-70"
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: ENTITY_COLORS[type] + "18",
                          color: ENTITY_COLORS[type],
                          boxShadow: `inset 0 0 0 1px ${ENTITY_COLORS[type]}40`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: ENTITY_COLORS[type] }}
                  />
                  {ENTITY_LABELS[type]}
                </button>
              );
            })}
          </div>

          <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              placeholder="Find node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-40 rounded-md border border-gray-200 bg-white pl-7 pr-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:placeholder:text-gray-500"
            />
            {searchQuery && highlightedIds.size > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-bold text-yellow-900">
                {highlightedIds.size}
              </span>
            )}
          </div>

          {/* Focused mode indicator */}
          {centerId && (
            <button
              onClick={() => {
                setCenterId(null);
                setDetail(null);
              }}
              className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800 dark:hover:bg-blue-900"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                />
              </svg>
              Focused view
              <span className="text-blue-400 dark:text-blue-500">&times;</span>
            </button>
          )}

          {/* Toggle extra filters */}
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              showFilters
                ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
          >
            Filters
            <svg
              className={`ml-1 inline-block h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            Reset
          </button>

          {/* Stats */}
          {stats && !loading && (
            <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
              {Object.entries(stats.types).map(([type, count]) => (
                <span key={type} className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-sm"
                    style={{ backgroundColor: ENTITY_COLORS[type] }}
                  />
                  {count}
                </span>
              ))}
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>{stats.edgeCount} edges</span>
            </div>
          )}
        </div>

        {/* Collapsible filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 px-4 py-2 dark:border-gray-800/60">
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Depth
              </label>
              <select
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="h-6 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Max nodes
              </label>
              <input
                type="number"
                min={10}
                max={500}
                value={maxNodes}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 10 && v <= 500) setMaxNodes(v);
                }}
                className="h-6 w-14 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </div>

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-6 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-6 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </div>
          </div>
        )}
      </div>

      {/* --- Graph area --- */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onClick={handleBackgroundClick}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-2">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600 dark:border-t-blue-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Building graph...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 dark:border-red-900 dark:bg-red-950/50">
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <svg
              className="h-12 w-12 text-gray-300 dark:text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No connected entities found.
            </p>
            <p className="max-w-xs text-center text-xs text-gray-400 dark:text-gray-600">
              Create references between notes, tasks, and plans to see their
              relationships visualized here.
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
            nodePointerAreaPaint={(node: InternalNode, color: string, ctx: CanvasRenderingContext2D) => {
              const r = Math.min(16, Math.max(5, 5 + (node.connections ?? 0) * 1.2)) + 4;
              const drawShape = SHAPE_DRAWERS[node.entity_type] ?? drawCircle;
              drawShape(ctx, node.x ?? 0, node.y ?? 0, r);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onNodeClick={handleNodeClick as never}
            onNodeRightClick={handleNodeDoubleClick as never}
            onBackgroundClick={handleBackgroundClick}
            linkColor={linkColor as never}
            linkWidth={linkWidth as never}
            linkLineDash={linkDash as never}
            linkLabel={linkLabel as never}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            backgroundColor="transparent"
            cooldownTicks={120}
            enableNodeDrag
            enableZoomInteraction
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        )}

        {/* Detail card */}
        {detail && (
          <DetailCardComponent
            detail={detail}
            isDark={isDark}
            containerRef={containerRef}
            onNavigate={navigateToEntity}
            onFocus={(node) => {
              setCenterId(node.id);
              setDetail(null);
            }}
            onClose={() => setDetail(null)}
          />
        )}
      </div>

      {/* --- Legend --- */}
      <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-1.5 dark:border-gray-800">
        {/* Node shapes */}
        <div className="flex items-center gap-3">
          {ENTITY_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-1">
              <NodeShapeIcon
                type={type}
                color={ENTITY_COLORS[type]}
                size={10}
              />
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {ENTITY_LABELS[type]}
              </span>
            </div>
          ))}
        </div>

        {/* Relation types present in graph */}
        {activeRelations.size > 0 && (
          <>
            <div className="h-3 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-3">
              {Array.from(activeRelations)
                .slice(0, 5)
                .map((rel) => {
                  const style =
                    RELATION_STYLES[rel] ?? DEFAULT_RELATION_STYLE;
                  return (
                    <div key={rel} className="flex items-center gap-1">
                      <svg width="16" height="6" className="flex-shrink-0">
                        <line
                          x1="0"
                          y1="3"
                          x2="16"
                          y2="3"
                          stroke={style.color}
                          strokeWidth={Math.max(style.width, 1.5)}
                          strokeDasharray={
                            style.dash ? style.dash.join(",") : undefined
                          }
                        />
                      </svg>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {style.label}
                      </span>
                    </div>
                  );
                })}
              {activeRelations.size > 5 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  +{activeRelations.size - 5} more
                </span>
              )}
            </div>
          </>
        )}

        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-600">
          Click node for details. Right-click to focus. Colored ring = entity color. Glow = importance.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail card overlay
// ---------------------------------------------------------------------------

function DetailCardComponent({
  detail,
  isDark,
  containerRef,
  onNavigate,
  onFocus,
  onClose,
}: {
  detail: DetailCard;
  isDark: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (node: InternalNode) => void;
  onFocus: (node: InternalNode) => void;
  onClose: () => void;
}) {
  const { node, screenX, screenY } = detail;
  const containerRect = containerRef.current?.getBoundingClientRect();

  // Position relative to container
  const relX = screenX - (containerRect?.left ?? 0);
  const relY = screenY - (containerRect?.top ?? 0);
  const containerW = containerRect?.width ?? 800;
  const containerH = containerRect?.height ?? 600;

  // Flip card direction if near edge
  const cardW = 240;
  const cardH = 160;
  const left = relX + cardW + 20 > containerW ? relX - cardW - 10 : relX + 10;
  const top = relY + cardH + 20 > containerH ? relY - cardH - 10 : relY + 10;

  const entityColor = ENTITY_COLORS[node.entity_type] ?? "#6b7280";
  const impLabel = node.importance && node.importance !== "none" ? node.importance : null;

  return (
    <div
      className="absolute z-20 w-60 overflow-hidden rounded-lg shadow-xl ring-1 ring-gray-200 dark:ring-gray-700"
      style={{
        left: Math.max(8, left),
        top: Math.max(8, top),
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: entityColor }} />

      <div className="p-3">
        {/* Type badge */}
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: entityColor + "1a",
              color: entityColor,
            }}
          >
            {node.entity_type.replace("_", " ")}
          </span>
          {impLabel && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                impLabel === "critical"
                  ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                  : impLabel === "high"
                    ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {impLabel}
            </span>
          )}
          {node.color && (
            <span
              className="inline-block h-3 w-3 rounded-full ring-1 ring-gray-200 dark:ring-gray-600"
              style={{ backgroundColor: node.color }}
              title={`Color: ${node.color}`}
            />
          )}
        </div>

        {/* Title */}
        <p className="mb-2 text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
          {node.title || "Untitled"}
        </p>

        {/* Meta */}
        <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
          {node.connections} connection{node.connections !== 1 ? "s" : ""}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate(node)}
            className="flex-1 rounded-md bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            Open
          </button>
          <button
            onClick={() => onFocus(node)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Focus
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny SVG node shape icons for the legend
// ---------------------------------------------------------------------------

function NodeShapeIcon({
  type,
  color,
  size,
}: {
  type: string;
  color: string;
  size: number;
}) {
  const s = size;
  const c = s / 2;

  switch (type) {
    case "note":
      return (
        <svg width={s} height={s}>
          <circle cx={c} cy={c} r={c - 1} fill={color} />
        </svg>
      );
    case "task":
      return (
        <svg width={s} height={s}>
          <rect
            x={1}
            y={1}
            width={s - 2}
            height={s - 2}
            rx={2}
            fill={color}
          />
        </svg>
      );
    case "plan":
      return (
        <svg width={s} height={s}>
          <polygon
            points={`${c},1 ${s - 1},${c} ${c},${s - 1} 1,${c}`}
            fill={color}
          />
        </svg>
      );
    case "time_entry":
      return (
        <svg width={s} height={s}>
          <polygon
            points={(() => {
              const pts: string[] = [];
              for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                pts.push(
                  `${c + (c - 1) * Math.cos(a)},${c + (c - 1) * Math.sin(a)}`,
                );
              }
              return pts.join(" ");
            })()}
            fill={color}
          />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s}>
          <circle cx={c} cy={c} r={c - 1} fill={color} />
        </svg>
      );
  }
}
