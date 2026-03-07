import { useCallback, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventContentArg,
  DatesSetArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg, EventReceiveArg } from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { usePlanStore } from "../../stores/planStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { Plan } from "../../lib/types";
import { PLAN_TYPE_CONFIG } from "../../lib/types";

/** Returns the default color for a plan type. */
function getDefaultColor(planType: string): string {
  return PLAN_TYPE_CONFIG[planType as keyof typeof PLAN_TYPE_CONFIG]?.color ?? "#6b7280";
}

/** Maps a Plan entity to a FullCalendar EventInput. */
function planToEvent(plan: Plan, isSelected: boolean): EventInput {
  return {
    id: plan.id,
    title: plan.title,
    start: plan.start_time,
    end: plan.end_time,
    allDay: plan.all_day,
    backgroundColor: plan.color || getDefaultColor(plan.type),
    borderColor: plan.color || getDefaultColor(plan.type),
    extendedProps: {
      planType: plan.type,
      category: plan.category,
      importance: plan.importance,
      description: plan.description,
    },
    classNames: [
      `plan-type-${plan.type}`,
      plan.importance ? `plan-importance-${plan.importance}` : "",
      isSelected ? "plan-selected" : "",
    ].filter(Boolean),
    editable: true,
  };
}

/** Main calendar view wrapping FullCalendar. */
export default function CalendarView() {
  const calendarRef = useRef<FullCalendar>(null);
  const {
    plans,
    currentView,
    fetchPlans,
    fetchPlanWithLinks,
    updatePlan,
    createPlan,
    linkTask,
    openDialog,
    setCurrentView,
    setCurrentDate,
    selectedPlanIds,
    togglePlanSelection,
    clearPlanSelection,
    bulkDeletePlans,
  } = usePlanStore();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setDailyPlanDate = usePlanStore((s) => s.setDailyPlanDate);
  const settings = useSettingsStore((s) => s.settings);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const startHour = Math.max(0, Math.min(23, parseInt(settings.calendar_start_hour ?? "0", 10) || 0));
  const endHour = Math.max(startHour + 1, Math.min(24, parseInt(settings.calendar_end_hour ?? "24", 10) || 24));
  const slotMinTime = `${String(startHour).padStart(2, "0")}:00:00`;
  const slotMaxTime = `${String(endHour).padStart(2, "0")}:00:00`;

  const lastClickRef = useRef<{ eventId: string; time: number } | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-fetch plans when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const api = calendarRef.current?.getApi();
    if (api) {
      fetchPlans({
        workspace_id: activeWorkspaceId,
        start_after: api.view.activeStart.toISOString(),
        end_before: api.view.activeEnd.toISOString(),
      });
    }
  }, [activeWorkspaceId, fetchPlans]);

  // Initialize FullCalendar Draggable for external task elements
  useEffect(() => {
    const draggable = new Draggable(document.body, {
      itemSelector: ".task-draggable",
      eventData: (el) => ({
        title: el.getAttribute("data-task-title") || "Task",
        extendedProps: { taskId: el.getAttribute("data-task-id") },
        duration: "01:00",
      }),
    });
    return () => draggable.destroy();
  }, []);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    };
  }, []);

  // Keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (e.key === "Escape" && selectedPlanIds.size > 0) {
        e.preventDefault();
        clearPlanSelection();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedPlanIds.size > 0) {
        e.preventDefault();
        bulkDeletePlans();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "a" && plans.length > 0) {
        e.preventDefault();
        usePlanStore.getState().selectAllVisible();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPlanIds, clearPlanSelection, bulkDeletePlans, plans]);

  const events: EventInput[] = plans.map((p) => planToEvent(p, selectedPlanIds.has(p.id)));

  /** Called when selecting a time range on the calendar (drag on empty area). */
  const handleSelect = useCallback(
    (selectInfo: DateSelectArg) => {
      clearPlanSelection();
      openDialog({
        workspace_id: activeWorkspaceId,
        start_time: selectInfo.startStr,
        end_time: selectInfo.endStr,
        all_day: selectInfo.allDay,
      });
      selectInfo.view.calendar.unselect();
    },
    [openDialog, clearPlanSelection, activeWorkspaceId]
  );

  /** Called when clicking a date cell — navigates to daily plan view. */
  const handleDateClick = useCallback(
    (arg: { dateStr: string }) => {
      clearPlanSelection();
      setDailyPlanDate(arg.dateStr.slice(0, 10));
      setActiveView("daily-plan");
    },
    [setDailyPlanDate, setActiveView, clearPlanSelection]
  );

  /** Called when clicking an event. Modifier+click → toggle selection, single-click → detail panel, double-click → edit dialog. */
  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      const jsEvent = clickInfo.jsEvent;
      const isModifierHeld = jsEvent.ctrlKey || jsEvent.metaKey || jsEvent.shiftKey;
      const eventId = clickInfo.event.id;

      if (isModifierHeld) {
        togglePlanSelection(eventId);
        return;
      }

      // No modifier: clear any existing multi-selection
      if (selectedPlanIds.size > 0) {
        clearPlanSelection();
      }

      const now = Date.now();
      const last = lastClickRef.current;

      if (last && last.eventId === eventId && now - last.time < 300) {
        // Double-click — open edit dialog
        lastClickRef.current = null;
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        const plan = plans.find((p) => p.id === eventId);
        if (plan) openDialog(undefined, plan);
      } else {
        // Single-click — wait to confirm it's not a double-click
        lastClickRef.current = { eventId, time: now };
        if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = setTimeout(() => {
          clickTimeoutRef.current = null;
          fetchPlanWithLinks(eventId);
        }, 300);
      }
    },
    [fetchPlanWithLinks, plans, openDialog, togglePlanSelection, clearPlanSelection, selectedPlanIds]
  );

  /** Called when dragging an event to a new time. Moves all selected events when bulk-selected. */
  const handleEventDrop = useCallback(
    async (dropInfo: EventDropArg) => {
      const droppedId = dropInfo.event.id;

      if (selectedPlanIds.has(droppedId) && selectedPlanIds.size > 1) {
        // Bulk move: compute delta from the original plan data
        const originalPlan = plans.find((p) => p.id === droppedId);
        if (!originalPlan) {
          dropInfo.revert();
          return;
        }

        const oldStart = new Date(originalPlan.start_time).getTime();
        const newStart = dropInfo.event.start ? dropInfo.event.start.getTime() : oldStart;
        const deltaMs = newStart - oldStart;

        try {
          const updates = Array.from(selectedPlanIds).map((id) => {
            const plan = plans.find((p) => p.id === id);
            if (!plan) return Promise.resolve(null);

            const adjStart = new Date(new Date(plan.start_time).getTime() + deltaMs).toISOString();
            const adjEnd = new Date(new Date(plan.end_time).getTime() + deltaMs).toISOString();

            return updatePlan({ id: plan.id, start_time: adjStart, end_time: adjEnd });
          });

          await Promise.allSettled(updates);
          clearPlanSelection();
        } catch {
          dropInfo.revert();
        }
      } else {
        // Single event drop
        try {
          await updatePlan({
            id: droppedId,
            start_time: dropInfo.event.startStr,
            end_time: dropInfo.event.endStr || dropInfo.event.startStr,
          });
        } catch {
          dropInfo.revert();
        }
      }
    },
    [updatePlan, selectedPlanIds, plans, clearPlanSelection]
  );

  /** Called when resizing an event. */
  const handleEventResize = useCallback(
    async (resizeInfo: EventResizeDoneArg) => {
      try {
        await updatePlan({
          id: resizeInfo.event.id,
          end_time: resizeInfo.event.endStr,
        });
      } catch {
        resizeInfo.revert();
      }
    },
    [updatePlan]
  );

  /** Called when the visible date range changes. */
  const handleDatesSet = useCallback(
    (dateInfo: DatesSetArg) => {
      if (!activeWorkspaceId) return;
      fetchPlans({
        workspace_id: activeWorkspaceId,
        start_after: dateInfo.startStr,
        end_before: dateInfo.endStr,
      });
      setCurrentDate(dateInfo.start.toISOString());
      setCurrentView(dateInfo.view.type as typeof currentView);
    },
    [fetchPlans, setCurrentDate, setCurrentView, currentView, activeWorkspaceId]
  );

  /** Called when an external draggable (task) is dropped onto the calendar. */
  const handleEventReceive = useCallback(
    async (receiveInfo: EventReceiveArg) => {
      const taskId = receiveInfo.event.extendedProps?.taskId as string | undefined;
      if (!taskId) {
        receiveInfo.revert();
        return;
      }
      try {
        // Create a new time block for the dropped task
        const plan = await createPlan({
          workspace_id: activeWorkspaceId,
          title: receiveInfo.event.title,
          start_time: receiveInfo.event.startStr,
          end_time: receiveInfo.event.endStr || new Date(new Date(receiveInfo.event.startStr).getTime() + 3600000).toISOString(),
          type: "time_block",
        });
        await linkTask(plan.id, taskId, "scheduled_in");
      } catch {
        receiveInfo.revert();
      }
      // Remove the external event from the calendar since we created a proper plan
      receiveInfo.event.remove();
    },
    [createPlan, linkTask, activeWorkspaceId]
  );

  /** Custom event content renderer. */
  const renderEventContent = useCallback((eventInfo: EventContentArg) => {
    const { planType, importance } = eventInfo.event.extendedProps;
    const isSelected = eventInfo.event.classNames.includes("plan-selected");
    return (
      <div className="flex items-center gap-1 overflow-hidden px-1">
        {isSelected && (
          <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-sm bg-white/30">
            <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </span>
        )}
        {planType === "milestone" && <span className="text-[10px]">◆</span>}
        {planType === "event" && <span className="text-[10px]">📅</span>}
        {importance === "critical" && (
          <span className="text-[10px] text-red-400">!</span>
        )}
        <span className="truncate text-xs font-medium">
          {eventInfo.event.title}
        </span>
        {eventInfo.timeText && (
          <span className="ml-auto text-[10px] opacity-70">
            {eventInfo.timeText}
          </span>
        )}
      </div>
    );
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView={currentView}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          events={events}
          editable
          selectable
          selectMirror
          eventDurationEditable
          eventStartEditable
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          allDaySlot
          nowIndicator
          weekends
          eventOverlap
          selectOverlap
          droppable
          height="100%"
          select={handleSelect}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventReceive={handleEventReceive}
          datesSet={handleDatesSet}
          eventContent={renderEventContent}
        />
      </div>

      {selectedPlanIds.size > 0 && (
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {selectedPlanIds.size} selected
          </span>
          <button
            onClick={() => bulkDeletePlans()}
            className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
          <button
            onClick={clearPlanSelection}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
