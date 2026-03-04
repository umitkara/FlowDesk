import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { ReactRenderer, ReactNodeViewRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import {
  EntitySuggestionList,
  type SuggestionItem,
} from "./EntitySuggestionList";
import * as ipc from "../../../lib/ipc";
import type { TaskFilter, TaskWithChildren, Plan } from "../../../lib/types";
import { TaskReferenceView } from "./TaskReferenceView";

/**
 * Regex matching @task[id], @note[id], @plan[id] at the end of input.
 * Used by the input rule to convert typed text into TaskReference nodes.
 */
const ENTITY_REF_INPUT_REGEX = /@(task|note|plan)\[([a-zA-Z0-9_-]+)\]$/;

/** Cache for autocomplete results to avoid repeated IPC calls. */
let cachedTasks: TaskWithChildren[] | null = null;
let cachedPlans: Plan[] | null = null;
let cacheExpiry = 0;

async function getSuggestionItems(query: string): Promise<SuggestionItem[]> {
  try {
    // Refresh cache every 30 seconds
    if (!cachedTasks || !cachedPlans || Date.now() > cacheExpiry) {
      const workspaces = await ipc.listWorkspaces();
      if (!workspaces.length) return [];
      const wsId = workspaces[0].id;
      const filter: TaskFilter = { workspace_id: wsId };
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      const monthAhead = new Date(now.getTime() + 30 * 86400000);
      const [tasks, plans] = await Promise.all([
        ipc.listTasks(filter, { field: "updated_at", direction: "desc" }),
        ipc.listPlans({
          workspace_id: wsId,
          start_after: monthAgo.toISOString(),
          end_before: monthAhead.toISOString(),
        }),
      ]);
      cachedTasks = tasks;
      cachedPlans = plans;
      cacheExpiry = Date.now() + 30000;
    }

    const q = query.toLowerCase();

    const taskResults: SuggestionItem[] = (q
      ? cachedTasks.filter((t) => t.title.toLowerCase().includes(q))
      : cachedTasks
    ).slice(0, 6).map((t) => ({
      entityType: "task" as const,
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    }));

    const planResults: SuggestionItem[] = (q
      ? cachedPlans.filter((p) => p.title.toLowerCase().includes(q))
      : cachedPlans
    ).slice(0, 4).map((p) => ({
      entityType: "plan" as const,
      id: p.id,
      title: p.title,
      planType: p.type,
      startTime: p.start_time,
    }));

    // Interleave: tasks first, then plans
    return [...taskResults, ...planResults].slice(0, 8);
  } catch {
    return [];
  }
}

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
          return await getSuggestionItems(query);
        },
        command: ({ editor, range, props }) => {
          const item = props as unknown as SuggestionItem;
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

          return {
            onStart: (props) => {
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
