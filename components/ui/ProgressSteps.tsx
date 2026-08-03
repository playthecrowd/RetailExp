import { cn } from "@/lib/cn";

export type ProgressStepStatus = "complete" | "current" | "upcoming";

export interface ProgressStep {
  id: string;
  label: string;
  status: ProgressStepStatus;
}

type Brand = "admin" | "kameleon";

/**
 * Horizontal step indicator shared across the admin dashboard and the
 * Kameleon mobile flow (e.g. "Commercial • AR Intro • Journey").
 */
export function ProgressSteps({
  steps,
  brand = "admin",
  className,
  underlineCurrent = false,
}: {
  steps: ProgressStep[];
  brand?: Brand;
  className?: string;
  /** Adds a red underline beneath the current step (screen 05's variant, not the default). */
  underlineCurrent?: boolean;
}) {
  const isKameleon = brand === "kameleon";

  return (
    <ol
      className={cn(
        "flex w-full items-center justify-center gap-2 text-xs",
        isKameleon ? "font-medium uppercase tracking-widest" : "font-medium",
        className,
      )}
      aria-label="Progress"
    >
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-2">
          <span
            className={cn(
              "relative flex items-center gap-1.5",
              step.status === "current" &&
                (isKameleon ? "text-kameleon-copper-light" : "text-admin-primary"),
              step.status === "complete" &&
                (isKameleon ? "text-kameleon-text-muted" : "text-admin-text-muted"),
              step.status === "upcoming" &&
                (isKameleon ? "text-kameleon-text-muted/50" : "text-admin-text-muted/50"),
            )}
            aria-current={step.status === "current" ? "step" : undefined}
          >
            {step.status === "complete" && (
              <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  d="M4 10.5 8 14.5 16 6"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {step.label}
            {underlineCurrent && step.status === "current" && (
              <span aria-hidden="true" className="absolute -bottom-1 left-0 h-0.5 w-full bg-kameleon-red" />
            )}
          </span>
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn("h-1 w-1 rounded-full", isKameleon ? "bg-kameleon-border" : "bg-admin-border")}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
