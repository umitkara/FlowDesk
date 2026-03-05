import { create } from "zustand";
import type { NoteTemplate, CreateTemplateInput, UpdateTemplateInput } from "../lib/types";
import * as ipc from "../lib/ipc";

/** State and actions for note template management. */
interface TemplateState {
  /** All loaded templates. */
  templates: NoteTemplate[];
  /** Whether templates are being loaded. */
  isLoading: boolean;
  /** Currently selected template file name in the manager. */
  selectedTemplate: string | null;

  /** Loads all templates from disk. */
  loadTemplates: () => Promise<void>;
  /** Loads a single template by file name. */
  loadTemplate: (fileName: string) => Promise<NoteTemplate>;
  /** Creates a new template. */
  createTemplate: (input: CreateTemplateInput) => Promise<string>;
  /** Updates an existing template. */
  updateTemplate: (fileName: string, update: UpdateTemplateInput) => Promise<void>;
  /** Deletes a template. */
  deleteTemplate: (fileName: string) => Promise<void>;
  /** Sets the selected template in the manager. */
  setSelectedTemplate: (fileName: string | null) => void;
  /** Applies a template and returns the result. */
  applyTemplate: (
    fileName: string,
    variables: Record<string, string>,
    workspaceId: string,
    date?: string,
  ) => Promise<[string, Record<string, unknown>]>;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  isLoading: false,
  selectedTemplate: null,

  loadTemplates: async () => {
    set({ isLoading: true });
    try {
      const templates = await ipc.listTemplates();
      set({ templates });
    } finally {
      set({ isLoading: false });
    }
  },

  loadTemplate: async (fileName) => {
    return ipc.loadTemplate(fileName);
  },

  createTemplate: async (input) => {
    const fileName = await ipc.createTemplate(input);
    const templates = await ipc.listTemplates();
    set({ templates });
    return fileName;
  },

  updateTemplate: async (fileName, update) => {
    await ipc.updateTemplate(fileName, update);
    const templates = await ipc.listTemplates();
    set({ templates });
  },

  deleteTemplate: async (fileName) => {
    await ipc.deleteTemplate(fileName);
    set((s) => ({
      templates: s.templates.filter((t) => t.file_name !== fileName),
      selectedTemplate: s.selectedTemplate === fileName ? null : s.selectedTemplate,
    }));
  },

  setSelectedTemplate: (fileName) => set({ selectedTemplate: fileName }),

  applyTemplate: async (fileName, variables, workspaceId, date) => {
    return ipc.applyTemplate(fileName, variables, workspaceId, date);
  },
}));
