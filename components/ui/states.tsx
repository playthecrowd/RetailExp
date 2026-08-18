import { Spinner } from "./Spinner";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

type Brand = "admin" | "kameleon";

export function LoadingState({
  brand = "admin",
  message = "Loading…",
  className,
}: {
  brand?: Brand;
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-sm",
        brand === "kameleon" ? "text-kameleon-text-muted" : "text-admin-text-muted",
        className,
      )}
    >
      <Spinner size="md" />
      <span>{message}</span>
    </div>
  );
}

export function ErrorState({
  brand = "admin",
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  brand?: Brand;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border py-10 text-center",
        brand === "kameleon"
          ? "border-kameleon-red/40 bg-kameleon-surface text-kameleon-text"
          : "border-admin-danger-bg bg-admin-danger-bg text-admin-text",
        className,
      )}
    >
      <p className="font-semibold">{title}</p>
      {message && (
        <p
          className={cn(
            "max-w-sm text-sm",
            brand === "kameleon" ? "text-kameleon-text-muted" : "text-admin-text-muted",
          )}
        >
          {message}
        </p>
      )}
      {onRetry && (
        <Button brand={brand} variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  brand = "admin",
  title,
  message,
  className,
  children,
}: {
  brand?: Brand;
  title: string;
  message?: string;
  className?: string;
  /** Optional action or explanatory footnote rendered under the message. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center",
        brand === "kameleon"
          ? "border-kameleon-copper/30 bg-kameleon-surface text-kameleon-text"
          : "border-admin-border bg-admin-surface text-admin-text",
        className,
      )}
    >
      <p className="font-semibold">{title}</p>
      {message && (
        <p
          className={cn(
            "max-w-md text-sm",
            brand === "kameleon" ? "text-kameleon-text-muted" : "text-admin-text-muted",
          )}
        >
          {message}
        </p>
      )}
      {children}
    </div>
  );
}
