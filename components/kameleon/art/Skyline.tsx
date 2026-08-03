import { cn } from "@/lib/cn";

// Deterministic pseudo-random building heights so the skyline looks organic
// without depending on Math.random() (keeps server/client render identical).
const HEIGHTS = [30, 55, 40, 70, 45, 85, 35, 60, 50, 75, 40, 65, 30, 55, 45];

export function Skyline({
  className,
  tone = "neutral",
}: {
  className?: string;
  tone?: "neutral" | "red" | "blue" | "sunset";
}) {
  const fill =
    tone === "red"
      ? "var(--kameleon-red)"
      : tone === "blue"
        ? "var(--kameleon-blue)"
        : tone === "sunset"
          ? "var(--kameleon-copper)"
          : "var(--kameleon-surface-raised)";

  const width = 300;
  const barWidth = width / HEIGHTS.length;

  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
    >
      {HEIGHTS.map((h, i) => (
        <rect
          key={i}
          x={i * barWidth}
          y={100 - h}
          width={barWidth - 2}
          height={h}
          fill={fill}
          opacity={0.18 + (i % 3) * 0.08}
        />
      ))}
      {HEIGHTS.map((h, i) =>
        i % 2 === 0 ? (
          <rect key={`w-${i}`} x={i * barWidth + barWidth / 2 - 1} y={100 - h + 6} width="2" height="4" fill="var(--kameleon-copper-light)" opacity="0.5" />
        ) : null,
      )}
    </svg>
  );
}
