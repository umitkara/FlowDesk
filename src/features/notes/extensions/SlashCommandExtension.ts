import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance } from "tippy.js";
import { SlashCommandList, type SlashCommandItem } from "./SlashCommandList";

const slashCommandPluginKey = new PluginKey("slashCommand");

const COMMANDS: Omit<SlashCommandItem, "title">[] = [
  {
    id: "task",
    label: "Task",
    description: "Create a new task and insert reference",
  },
  {
    id: "subtask",
    label: "Subtask",
    description: "Create a subtask under an existing task",
  },
  {
    id: "table",
    label: "Table",
    description: "Insert a 3\u00d73 table with header row",
  },
];

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: slashCommandPluginKey,
        editor: this.editor,
        char: "/",
        allowSpaces: true,
        startOfLine: true,
        items: ({ query }) => {
          const q = query.toLowerCase();
          // Parse: first word = command, rest = title
          const spaceIdx = q.indexOf(" ");
          const cmdPart = spaceIdx >= 0 ? q.slice(0, spaceIdx) : q;
          const titlePart = spaceIdx >= 0 ? query.slice(spaceIdx + 1).trim() : "";

          return COMMANDS
            .filter((c) => c.id.startsWith(cmdPart) || c.label.toLowerCase().startsWith(cmdPart))
            .map((c) => ({ ...c, title: titlePart }));
        },
        command: ({ editor, range, props }) => {
          const item = props as unknown as SlashCommandItem & {
            taskId?: string;
          };
          // Always clean up the typed slash command text first
          editor.chain().focus().deleteRange(range).run();
          // Handle table insertion
          if (item.id === "table") {
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            return;
          }
          // Then insert the reference chip if a task was created
          if (item.taskId) {
            editor
              .chain()
              .focus()
              .insertContent({
                type: "taskReference",
                attrs: { entityType: "task", entityId: item.taskId },
              })
              .insertContent(" ")
              .run();
          }
        },
        render: () => {
          let component: ReactRenderer;
          let popup: Instance;
          let currentItems: SlashCommandItem[] = [];
          let currentCommand: ((item: SlashCommandItem) => void) | null = null;

          return {
            onStart: (props) => {
              currentItems = props.items;
              currentCommand = props.command;
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              [popup] = tippy("body", {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                animation: false,
              });
            },

            onUpdate(props) {
              currentItems = props.items;
              currentCommand = props.command;
              component?.updateProps(props);
              if (props.clientRect) {
                popup?.setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                });
              }
            },

            onKeyDown(props) {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const handled = (component?.ref as any)?.onKeyDown(props);
              if (handled) return true;
              // Fallback: if component ref isn't available, handle Enter/Tab directly
              if (props.event.key === "Enter" || props.event.key === "Tab") {
                if (currentItems.length > 0 && currentCommand) {
                  currentCommand(currentItems[0]);
                  return true;
                }
              }
              return false;
            },

            onExit() {
              popup?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
