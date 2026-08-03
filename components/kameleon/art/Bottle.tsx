import { cn } from "@/lib/cn";

let idCounter = 0;

/**
 * Stylized bottle silhouette — the recurring product motif across screens
 * 01 (Tap to Begin), 03 (camera viewfinder), 04 (AR introduction
 * centerpiece). Composed entirely in SVG/gradients since no product
 * photography is available.
 */
export function KameleonBottle({ className }: { className?: string }) {
  const gradId = `bottle-gradient-${++idCounter}`;
  return (
    <svg viewBox="0 0 120 260" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--kameleon-blue)" stopOpacity="0.85" />
          <stop offset="48%" stopColor="var(--kameleon-surface-raised)" />
          <stop offset="100%" stopColor="var(--kameleon-red)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="252" rx="34" ry="6" fill="black" opacity="0.4" />
      <path
        d="M46 8h28v26c10 8 16 20 16 34v148a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10V68c0-14 6-26 16-34V8Z"
        fill={`url(#${gradId})`}
        stroke="var(--kameleon-copper)"
        strokeWidth="1.5"
      />
      <rect x="46" y="4" width="28" height="10" rx="2" fill="var(--kameleon-copper)" />
      <path d="M42 70c8-6 28-6 36 0" stroke="var(--kameleon-copper-light)" strokeWidth="1" fill="none" opacity="0.6" />
      <text
        x="60"
        y="140"
        textAnchor="middle"
        fontSize="12"
        letterSpacing="2"
        fill="var(--kameleon-copper-light)"
        fontFamily="var(--font-display), serif"
      >
        KAMELEON
      </text>
    </svg>
  );
}
