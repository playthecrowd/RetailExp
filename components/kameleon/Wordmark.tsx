import { cn } from "@/lib/cn";

export function KameleonWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-semibold uppercase tracking-[0.35em] text-kameleon-copper-light",
        className,
      )}
    >
      Kameleon
    </span>
  );
}
