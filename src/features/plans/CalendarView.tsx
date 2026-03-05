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
import type { Plan } from "../../lib/types";
import { PLAN_TYPE_CONFIG } from "../../lib/types";
import * as ipc from "../../lib/ipc";

/** Returns the default color for a plan type. */
function getDefaultColor(planType: string): string {
  return PLAN_TYPE_CONFIG[planType as keyof typeof PLAN_TYPE_CONFIG]?.color ?? "#6b7280";
}

/** Maps a Plan entity to a FullCalendar EventInput. */
function planToEvent(plan: Plan): EventInput {
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
  } = usePlanStore();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setDailyPlanDate = usePlanStore((s) => s.setDailyPlanDate);
  const settings = useSettingsStore((s) => s.settings);

  const startHour = Math.max(0, Math.min(23, parseInt(settings.calendar_start_hour ?? "0", 10) || 0));
  const endHour = Math.max(startHour + 1, Math.min(24, parseInt(settings.calendar_end_hour ?? "24", 10) || 24));
  const slotMinTime = `${String(startHour).padStart(2, "0")}:00:00`;
  const slotMaxTime = `${String(endHour).padStart(2, "0")}:00:00`;

  const workspaceIdRef = useRef<string>("");
  const lastClickRef = useRef<{ eventId: string; time: number } | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch workspace ID, then trigger initial plan load for the visible range
  useEffect(() => {
    ipc.listWorkspaces().then((ws) => {
      if (ws.length > 0) {
        workspaceIdRef.current = ws[0].id;
        // FullCalendar already fired datesSet before workspace was ready — re-fetch now
        const api = calendarRef.current?.getApi();
        if (api) {
          fetchPlans({
            workspace_id: ws[0].id,
            start_after: api.view.activeStart.toISOString(),
            end_before: api.view.activeEnd.toISOString(),
          });
        }
      }
    });
  }, [fetchPlans]);

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

  const events: EventInput[] = plans.map(planToEvent);

  /** Called when selecting a time range on the calendar (drag on empty area). */
  const handleSelect = useCallback(
    (selectInfo: DateSelectArg) => {
      openDialog({
        workspace_id: workspaceIdRef.current,
        start_time: selectInfo.startStr,
        end_time: selectInfo.endStr,
        all_day: selectInfo.allDay,
      });
      selectInfo.view.calendar.unselect();
    },
    [openDialog]
  );

  /** Called when clicking a date cell — navigates to daily plan view. */
  const handleDateClick = useCallback(
    (arg: { dateStr: string }) => {
      setDailyPlanDate(arg.dateStr.slice(0, 10));
      setActiveView("daily-plan");
    },
    [setDailyPlanDate, setActiveView]
  );

  /** Called when clicking an event. Single-click → detail panel, double-click → edit dialog. */
  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      const now = Date.now();
      const last = lastClickRef.current;

      if (last && last.eventId === clickInfo.event.id && now - last.time < 300) {
        // Double-click — open edit dialog
        lastClickRef.current = null;
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        const plan = plans.find((p) => p.id === clickInfo.event.id);
        if (plan) openDialog(undefined, plan);
      } else {
        // Single-click — wait to confirm it's not a double-click
        lastClickRef.current = { eventId: clickInfo.event.id, time: now };
        if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
        const eventId = clickInfo.event.id;
        clickTimeoutRef.current = setTimeout(() => {
          clickTimeoutRef.current = null;
          fetchPlanWithLinks(eventId);
        }, 300);
      }
    },
    [fetchPlanWithLinks, plans, openDialog]
  );

  /** Called when dragging an event to a new time. */
  const handleEventDrop = useCallback(
    async (dropInfo: EventDropArg) => {
      try {
        await updatePlan({
          id: dropInfo.event.id,
          start_time: dropInfo.event.startStr,
          end_time: dropInfo.event.endStr || dropInfo.event.startStr,
        });
      } catch {
        dropInfo.revert();
      }
    },
    [updatePlan]
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
      if (!workspaceIdRef.current) return;
      fetchPlans({
        workspace_id: workspaceIdRef.current,
        start_after: dateInfo.startStr,
        end_before: dateInfo.endStr,
      });
      setCurrentDate(dateInfo.start.toISOString());
      setCurrentView(dateInfo.view.type as typeof currentView);
    },
    [fetchPlans, setCurrentDate, setCurrentView, currentView]
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
          workspace_id: workspaceIdRef.current,
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
    [createPlan, linkTask]
  );

  /** Custom event content renderer. */
  const renderEventContent = useCallback((eventInfo: EventContentArg) => {
    const { planType, importance } = eventInfo.event.extendedProps;
    return (
      <div className="flex items-center gap-1 overflow-hidden px-1">
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
    </div>
  );
}
