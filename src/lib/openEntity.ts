import { useUIStore } from "../stores/uiStore";
import { useNoteStore } from "../stores/noteStore";
import { useTaskStore } from "../stores/taskStore";
import { usePlanStore } from "../stores/planStore";
import type { EntityType } from "./types";

export interface OpenEntityOptions {
  type: EntityType;
  id: string;
}

export async function openEntity({ type, id }: OpenEntityOptions): Promise<void> {
  const ui = useUIStore.getState();

  switch (type) {
    case "note": {
      const noteStore = useNoteStore.getState();
      await noteStore.selectNote(id);
      if (useNoteStore.getState().activeNote) {
        ui.navigateTo(id);
        ui.setActiveView("notes");
      } else {
        console.warn(`Could not open note ${id}`);
      }
      break;
    }
    case "task": {
      const taskStore = useTaskStore.getState();
      await taskStore.fetchAndOpenDetail(id);
      if (useTaskStore.getState().selectedTask?.id === id) {
        ui.setActiveView("tasks");
      } else {
        console.warn(`Could not open task ${id}`);
      }
      break;
    }
    case "plan": {
      const planStore = usePlanStore.getState();
      await planStore.fetchPlanWithLinks(id);
      ui.setActiveView("plans");
      break;
    }
    case "time_entry": {
      ui.setActiveView("time-reports");
      break;
    }
  }
}
