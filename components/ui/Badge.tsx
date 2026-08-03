import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "copper";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-admin-surface-muted text-admin-text-muted",
  success: "bg-admin-success-bg text-admin-success",
  warning: "bg-admin-warning-bg text-admin-warning",
  danger: "bg-admin-danger-bg text-admin-danger",
  copper: "bg-kameleon-surface-raised text-kameleon-copper-light border border-kameleon-copper/40",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
