import { cn } from "@/lib/cn";

/** Inline flag for any figure that isn't backed by a real data source yet. */
export function MockDataNote({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-admin-warning-bg px-2 py-0.5 text-[11px] font-medium text-admin-warning",
        className,
      )}
    >
      Mock data
    </span>
  );
}
