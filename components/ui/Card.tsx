import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Brand = "admin" | "kameleon";

const brandStyles: Record<Brand, string> = {
  admin: "bg-admin-surface border border-admin-border text-admin-text",
  kameleon: "bg-kameleon-surface border border-kameleon-border text-kameleon-text",
};

export function Card({
  brand = "admin",
  padded = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { brand?: Brand; padded?: boolean }) {
  return (
    <div
      className={cn("rounded-xl", padded && "p-5", brandStyles[brand], className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm opacity-70", className)} {...props} />;
}
