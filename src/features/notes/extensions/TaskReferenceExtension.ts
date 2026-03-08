import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { ReactRenderer, ReactNodeViewRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import {
  EntitySuggestionList,
  type SuggestionItem,
} from "./EntitySuggestionList";
import { getSuggestionItems, invalidateCache } from "./suggestionCache";
import { useTaskStore } from "../../../stores/taskStore";
import { TaskReferenceView } from "./TaskReferenceView";

/**
 * Regex matching @task[id], @note[id], @plan[id] at the end of input.
 * Used by the input rule to convert typed text into TaskReference nodes.
 */
const ENTITY_REF_INPUT_REGEX = /@(task|note|plan)\[([a-zA-Z0-9_-]+)\]$/;

/**
 * Custom Tiptap inline node extension for rendering entity references
 * (@task[id], @note[id], @plan[id]) as interactive chips in the editor.
 *
 * Features:
 * - Parses `<span data-entity-ref>` elements from HTML.
 * - Renders back to `<span data-entity-ref ...>@type[id]</span>` for storage.
 * - Input rule converts typed `@task[id]` into the node (for power users who know the ID).
 * - Suggestion/autocomplete dropdown triggered by typing `@` to search tasks by title.
 * - React NodeView renders an interactive chip with checkbox and title.
 */
export const TaskReferenceExtension = Node.create({
  name: "taskReference",

  group: "inline",

  inline: true,

  atom: true,

  selectable: true,

  draggable: false,

  addAttributes() {
    return {
      entityType: {
        default: "task",
        parseHTML: (element) =>
          element.getAttribute("data-entity-type") || "task",
        renderHTML: (attributes) => ({
          "data-entity-type": attributes.entityType as string,
        }),
      },
      entityId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-entity-id"),
        renderHTML: (attributes) => ({
          "data-entity-id": attributes.entityId as string,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-entity-ref]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-entity-ref": "" }, HTMLAttributes),
      `@${node.attrs.entityType}[${node.attrs.entityId}]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskReferenceView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: ENTITY_REF_INPUT_REGEX,
        handler: ({ state, range, match }) => {
          const attrs = {
            entityType: match[1],
            entityId: match[2],
          };
          const node = this.type.create(attrs);
          state.tr.replaceWith(range.from, range.to, node);
          // Insert a space after the node so the cursor isn't stuck
          state.tr.insertText(" ");
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "@",
        allowSpaces: false,
        items: async ({ query }) => {
          // Don't show autocomplete when user is typing the manual @task[id] pattern
          if (/^(task|note|plan)\[/.test(query)) return [];
          const results = await getSuggestionItems(query);
          // Append "Create task" option when there's a non-empty query
          const trimmed = query.trim();
          if (trimmed.length > 0) {
            results.push({
              entityType: "task",
              id: "__create__",
              title: trimmed,
            });
          }
          return results;
        },
        command: ({ editor, range, props }) => {
          const item = props as unknown as SuggestionItem;
          if (item.id === "__create__") {
            // Delete the typed text immediately, then create task and insert chip
            editor.chain().focus().deleteRange(range).run();
            useTaskStore.getState().createTask({ workspace_id: "", title: item.title }).then((task) => {
              invalidateCache();
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "taskReference",
                  attrs: { entityType: "task", entityId: task.id },
                })
                .insertContent(" ")
                .run();
            });
            return;
          }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "taskReference",
              attrs: {
                entityType: item.entityType,
                entityId: item.id,
              },
            })
            .insertContent(" ")
            .run();
        },
        render: () => {
          let component: ReactRenderer;
          let popup: Instance;
          let currentItems: SuggestionItem[] = [];
          let currentCommand: ((item: SuggestionItem) => void) | null = null;

          return {
            onStart: (props) => {
              currentItems = props.items;
              currentCommand = props.command;
              component = new ReactRenderer(EntitySuggestionList, {
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

/**
 * Preprocesses HTML content to convert bare @task[id], @note[id], @plan[id]
 * text patterns into `<span data-entity-ref>` elements that the extension can parse.
 *
 * This handles legacy note content that was created before the extension was added.
 * It avoids double-wrapping patterns that are already inside entity ref spans,
 * and skips patterns inside `<code>` or `<pre>` blocks.
 */
export function preprocessEntityRefs(html: string): string {
  if (
    !html.includes("@task[") &&
    !html.includes("@note[") &&
    !html.includes("@plan[")
  ) {
    return html;
  }

  // Split by protected regions: existing entity ref spans, code blocks, inline code
  const protectedRegex =
    /(<span[^>]*data-entity-ref[^>]*>[^<]*<\/span>|<pre[^>]*>[\s\S]*?<\/pre>|<code[^>]*>[\s\S]*?<\/code>)/gi;

  const parts = html.split(protectedRegex);

  return parts
    .map((part, i) => {
      // Odd indices are protected regions — leave them unchanged
      if (i % 2 === 1) return part;
      // Even indices are regular HTML — replace bare patterns
      return part.replace(
        /@(task|note|plan)\[([a-zA-Z0-9_-]+)\]/g,
        '<span data-entity-ref="" data-entity-type="$1" data-entity-id="$2">@$1[$2]</span>',
      );
    })
    .join("");
}
