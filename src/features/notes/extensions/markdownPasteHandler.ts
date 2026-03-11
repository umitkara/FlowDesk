import { marked } from "marked";
import type { Editor } from "@tiptap/core";

marked.use({ async: false, breaks: false, gfm: true });

const MD_PATTERNS = [
  /^#{1,6} /m,        // headings
  /\*\*[^*]+\*\*/,    // bold
  /(?:^|\n)\|.+\|/,   // table row
  /^```/m,            // fenced code block
  /^[-*+] /m,         // unordered list
  /^\d+\. /m,         // ordered list
  /^> /m,             // blockquote
  /\[.+?\]\(.+?\)/,   // markdown link
];

function looksLikeMarkdown(text: string): boolean {
  return MD_PATTERNS.some((re) => re.test(text));
}

export function handleMarkdownPaste(
  editor: Editor | null,
  event: ClipboardEvent
): boolean {
  if (!editor) return false;
  const plain = event.clipboardData?.getData("text/plain") ?? "";
  if (plain.trim() === "") return false;
  // If rich HTML is on clipboard, let Tiptap's default HTML processing run
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (html !== "") return false;
  if (!looksLikeMarkdown(plain)) return false;

  event.preventDefault();
  const converted = marked.parse(plain) as string;
  editor
    .chain()
    .focus()
    .insertContent(converted, {
      parseOptions: { preserveWhitespace: false },
    })
    .run();
  return true;
}
