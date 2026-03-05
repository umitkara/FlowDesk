import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useDashboardStore,
  WIDGET_TYPES,
  WIDGET_META,
  type WidgetType,
} from "../../stores/dashboardStore";

/** Renders a sortable widget card in the edit grid. */
function SortableWidgetCard({ type }: { type: string }) {
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const meta = WIDGET_META[type as WidgetType];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: type });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border-2 border-dashed bg-white p-4 dark:bg-gray-800/80 ${
        isDragging
          ? "z-50 border-accent bg-accent/5 opacity-50 shadow-lg dark:bg-accent/10"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 cursor-grab rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing dark:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-400"
        aria-label="Drag to reorder"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.2" />
          <circle cx="11" cy="3" r="1.2" />
          <circle cx="5" cy="8" r="1.2" />
          <circle cx="11" cy="8" r="1.2" />
          <circle cx="5" cy="13" r="1.2" />
          <circle cx="11" cy="13" r="1.2" />
        </svg>
      </button>

      {/* Remove button */}
      <button
        onClick={() => removeWidget(type)}
        className="absolute right-2 top-2 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        aria-label={`Remove ${meta?.label ?? type}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Widget preview */}
      <div className="flex min-h-[80px] flex-col items-center justify-center px-6">
        <WidgetIcon type={type} className="mb-2 h-6 w-6 text-gray-400 dark:text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {meta?.label ?? type}
        </span>
        <span className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          {meta?.description ?? ""}
        </span>
      </div>
    </div>
  );
}

/** Static widget card rendered in the DragOverlay. */
function WidgetCardOverlay({ type }: { type: string }) {
  const meta = WIDGET_META[type as WidgetType];
  return (
    <div className="rounded-lg border-2 border-accent bg-white p-4 shadow-xl dark:bg-gray-800/95">
      <div className="flex min-h-[80px] flex-col items-center justify-center px-6">
        <WidgetIcon type={type} className="mb-2 h-6 w-6 text-accent" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {meta?.label ?? type}
        </span>
      </div>
    </div>
  );
}

/** Icon per widget type. */
function WidgetIcon({ type, className }: { type: string; className?: string }) {
  const cn = className ?? "h-5 w-5";
  switch (type) {
    case "today_plan":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "pending_tasks":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "recent_notes":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case "time_today":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "sticky_tasks":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      );
    case "upcoming_deadlines":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
    case "quick_capture":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    default:
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
        </svg>
      );
  }
}

/** Dashboard edit overlay — sortable widget grid with add/remove controls. */
export function DashboardEditor() {
  const widgets = useDashboardStore((s) => s.widgets);
  const reorderWidgets = useDashboardStore((s) => s.reorderWidgets);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const saveLayout = useDashboardStore((s) => s.saveLayout);
  const cancelEditing = useDashboardStore((s) => s.cancelEditing);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const availableWidgets = WIDGET_TYPES.filter((t) => !widgets.includes(t));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = widgets.indexOf(String(active.id));
        const newIndex = widgets.indexOf(String(over.id));
        reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
      }
    },
    [widgets, reorderWidgets],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveLayout();
    } finally {
      setIsSaving(false);
    }
  }, [saveLayout]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Edit mode header bar */}
      <div className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50/95 px-6 py-3 backdrop-blur-sm dark:border-amber-800/40 dark:bg-amber-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-200/80 dark:bg-amber-800/50">
              <svg className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Editing Layout
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Drag to reorder, add or remove widgets
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cancelEditing}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: "var(--workspace-accent)" }}
            >
              {isSaving ? "Saving..." : "Save Layout"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-4xl">
          {/* Sortable widget grid */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgets} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {widgets.map((type) => (
                  <SortableWidgetCard key={type} type={type} />
                ))}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeId ? <WidgetCardOverlay type={activeId} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Empty state */}
          {widgets.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16 dark:border-gray-700">
              <svg className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
              </svg>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No widgets added. Use the button below to add some.
              </p>
            </div>
          )}

          {/* Add widget section */}
          <div className="relative mt-5">
            {availableWidgets.length > 0 && (
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-3 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500 dark:border-gray-700 dark:text-gray-500 dark:hover:border-gray-600 dark:hover:text-gray-400"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Widget
                <svg
                  className={`h-3 w-3 transition-transform ${showAddMenu ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            {/* Add widget dropdown */}
            {showAddMenu && availableWidgets.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {availableWidgets.map((type) => {
                  const meta = WIDGET_META[type];
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        addWidget(type);
                        setShowAddMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60"
                    >
                      <WidgetIcon
                        type={type}
                        className="h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {meta.label}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {meta.description}
                        </div>
                      </div>
                      <svg className="ml-auto h-4 w-4 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
