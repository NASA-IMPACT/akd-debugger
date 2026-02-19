import { cn } from "@/lib/utils";

const TAG_COLORS = ["blue", "green", "orange", "purple", "gray"] as const;
type TagColor = (typeof TAG_COLORS)[number];

function hashTag(tag: string): TagColor {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

interface TagBadgeProps {
  tag: string;
  color?: TagColor;
  className?: string;
}

export function TagBadge({ tag, color, className }: TagBadgeProps) {
  const c = color || hashTag(tag);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium",
        className,
      )}
      style={{
        backgroundColor: `var(--tag-${c}-bg)`,
        color: `var(--tag-${c}-text)`,
      }}
    >
      {tag}
    </span>
  );
}
