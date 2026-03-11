import { useState, useCallback } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

const LANGUAGES = [
  { value: "", label: "Auto" },
  { value: "plaintext", label: "Plain Text" },
  { value: "bash", label: "Bash" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "lua", label: "Lua" },
  { value: "makefile", label: "Makefile" },
  { value: "markdown", label: "Markdown" },
  { value: "perl", label: "Perl" },
  { value: "php", label: "PHP" },
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "scss", label: "SCSS" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "typescript", label: "TypeScript" },
  { value: "xml", label: "XML/HTML" },
  { value: "yaml", label: "YAML" },
];

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = node.attrs.language || "";

  const handleCopy = useCallback(() => {
    const text = node.textContent;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [node]);

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-toolbar" contentEditable={false}>
        <select
          className="code-block-language-select"
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <button
          className="code-block-copy-btn"
          onClick={handleCopy}
          title="Copy code"
          type="button"
        >
          {copied ? (
            <span className="code-block-copied-text">Copied!</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
