const TAILWIND_COLORS = [
  { name: "slate", hex: "#64748b" },
  { name: "gray", hex: "#6b7280" },
  { name: "zinc", hex: "#71717a" },
  { name: "neutral", hex: "#737373" },
  { name: "stone", hex: "#78716c" },
  { name: "red", hex: "#ef4444" },
  { name: "orange", hex: "#f97316" },
  { name: "amber", hex: "#f59e0b" },
  { name: "yellow", hex: "#eab308" },
  { name: "lime", hex: "#84cc16" },
  { name: "green", hex: "#22c55e" },
  { name: "emerald", hex: "#10b981" },
  { name: "teal", hex: "#14b8a6" },
  { name: "cyan", hex: "#06b6d4" },
  { name: "sky", hex: "#0ea5e9" },
  { name: "blue", hex: "#3b82f6" },
  { name: "indigo", hex: "#6366f1" },
  { name: "violet", hex: "#8b5cf6" },
  { name: "purple", hex: "#a855f7" },
  { name: "fuchsia", hex: "#d946ef" },
  { name: "pink", hex: "#ec4899" },
  { name: "rose", hex: "#f43f5e" },
];

interface ColorPresetPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPresetPicker({ value, onChange }: ColorPresetPickerProps) {
  const normalizedValue = value.toLowerCase();
  const isPreset = TAILWIND_COLORS.some((c) => c.hex === normalizedValue);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
        Accent Color
      </label>
      <div className="grid grid-cols-11 gap-1.5">
        {TAILWIND_COLORS.map((c) => (
          <button
            key={c.name}
            type="button"
            title={c.name}
            onClick={() => onChange(c.hex)}
            className="h-6 w-6 rounded-full transition-transform hover:scale-110"
            style={{
              backgroundColor: c.hex,
              boxShadow:
                normalizedValue === c.hex
                  ? `0 0 0 2px var(--tw-ring-offset-color, white), 0 0 0 4px ${c.hex}`
                  : undefined,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Custom:</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-6 w-6 cursor-pointer rounded border ${
            !isPreset
              ? "ring-2 ring-primary-500 ring-offset-1"
              : "border-gray-300 dark:border-gray-600"
          }`}
        />
        <span className="text-xs text-gray-400">{value}</span>
      </div>
    </div>
  );
}
