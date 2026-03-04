import { useState, useCallback, useRef } from "react";

/** Props for the SearchBar component. */
interface SearchBarProps {
  /** Called when the user submits or stops typing (debounced). */
  onSearch: (query: string) => void;
}

/** Search input with debounced search execution. */
export function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(v), 300);
    },
    [onSearch],
  );

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
      <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search notes..."
        autoFocus
        className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
      />
    </div>
  );
}
