import { cn } from "@/lib/cn";
import { Skyline } from "./Skyline";

const cities = [
  { label: "Atlanta", tone: "red" as const },
  { label: "Chicago", tone: "blue" as const },
  { label: "New York", tone: "blue" as const },
  { label: "Los Angeles", tone: "red" as const },
];

/**
 * 2x2 "four cities, four lives" grid for the commercial (screen 02).
 * Composed silhouette figures over per-city skylines — no photography
 * available, so the reference's character portraits are represented
 * abstractly rather than faked with stock imagery.
 */
export function PortraitGrid({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 grid-rows-2", className)}>
      {cities.map((city) => (
        <div key={city.label} className="relative flex items-end justify-center overflow-hidden bg-black/40">
          <div className="absolute inset-x-0 bottom-0 h-2/3">
            <Skyline tone={city.tone} />
          </div>
          <svg viewBox="0 0 40 60" className="relative z-10 h-16 w-auto text-kameleon-text-muted/50" aria-hidden="true">
            <circle cx="20" cy="14" r="8" fill="currentColor" />
            <path d="M6 58c0-12 6-20 14-20s14 8 14 20" fill="currentColor" />
          </svg>
          <span className="absolute bottom-2 text-[10px] uppercase tracking-widest text-kameleon-text-muted">
            {city.label}
          </span>
        </div>
      ))}
    </div>
  );
}
