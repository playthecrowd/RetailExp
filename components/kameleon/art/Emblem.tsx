import { cn } from "@/lib/cn";

/** Stylized line-art creature emblem (armadillo/pangolin), matching screens 01/05/11. */
export function KameleonEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("text-kameleon-copper-light", className)}
      aria-hidden="true"
    >
      <path d="M10 28c0-9 7-16 16-16h6c9 0 14 6 16 12" />
      <path d="M14 28c2-6 6-10 12-11" />
      <path d="M20 27c2-4 5-7 9-8" />
      <path d="M26 27c1.5-3 4-5 7-6" />
      <path d="M10 28c-2 1-3 3-3 5" />
      <path d="M48 24c2 1 4 3 4 6" />
      <path d="M14 33c1-2 2-3 3-3M20 34c1-2 2-3 3-3M40 34c1-2 2-4 2-5M46 34c1-2 2-4 2-5" />
      <circle cx="42" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <path d="M4 30c2-1 4-1 6 0" />
    </svg>
  );
}
