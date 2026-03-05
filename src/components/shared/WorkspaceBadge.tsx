import type { WorkspaceBadge as WorkspaceBadgeType } from "../../lib/types";

/** Props for the WorkspaceBadge component. */
interface WorkspaceBadgeProps {
  /** Badge data containing workspace name, icon, and color. */
  badge: WorkspaceBadgeType;
  /** Display size variant. */
  size?: "sm" | "md";
}

/** Inline badge indicating an entity belongs to a different workspace. */
export function WorkspaceBadge({ badge, size = "sm" }: WorkspaceBadgeProps) {
  const sizeClasses =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  const color = badge.color ?? "#6b7280";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: color + "15",
        color,
        border: `1px solid ${color}30`,
      }}
      title={`From workspace: ${badge.name}`}
    >
      {badge.icon ? (
        <span className="leading-none">{badge.icon}</span>
      ) : (
        <span
          className={`${dotSize} rounded-full`}
          style={{ backgroundColor: color }}
        />
      )}
      <span>{badge.name}</span>
    </span>
  );
}
