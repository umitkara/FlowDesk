import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import { SlashCommandList, type SlashCommandItem } from "./SlashCommandList";

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
];

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion({
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
          // The actual creation is handled inside SlashCommandList
          // because subtask needs a two-phase flow (parent picker).
          // This command is called when the list signals completion.
          const item = props as unknown as SlashCommandItem & {
            taskId?: string;
          };
          if (item.taskId) {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: "taskReference",
                attrs: { entityType: "task", entityId: item.taskId },
              })
              .insertContent(" ")
              .run();
          } else {
            // No task created (cancelled or empty) — just clean up the slash text
            editor.chain().focus().deleteRange(range).run();
          }
        },
        render: () => {
          let component: ReactRenderer;
          let popup: Instance;

          return {
            onStart: (props) => {
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
              return (component?.ref as any)?.onKeyDown(props) ?? false;
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
