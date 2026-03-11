import { useState, useRef, useEffect, useCallback } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import type { EmojiClickData } from "emoji-picker-react";

interface EmojiPickerPopoverProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPickerPopover({ value, onChange }: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onChange(emojiData.emoji);
    setOpen(false);
  };

  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
        Icon (emoji)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={2}
          placeholder="Pick an emoji"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-base hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
          title="Pick emoji"
        >
          😀
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-gray-400 hover:text-red-500"
            title="Clear"
          >
            &times;
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={isDark ? Theme.DARK : Theme.LIGHT}
            width={300}
            height={400}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}
