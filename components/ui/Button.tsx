"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

type Brand = "admin" | "kameleon";
type Variant = "primary" | "secondary" | "ghost" | "destructive" | "link";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-md",
  md: "h-11 px-4 text-sm rounded-md",
  lg: "h-14 px-6 text-base rounded-lg",
};

const adminVariants: Record<Variant, string> = {
  primary:
    "bg-admin-primary text-admin-primary-foreground hover:bg-admin-primary-hover focus-visible:ring-admin-primary focus-visible:ring-offset-admin-bg",
  secondary:
    "bg-admin-surface text-admin-text border border-admin-border hover:bg-admin-surface-muted focus-visible:ring-admin-primary focus-visible:ring-offset-admin-bg",
  ghost:
    "bg-transparent text-admin-text hover:bg-admin-surface-muted focus-visible:ring-admin-primary focus-visible:ring-offset-admin-bg",
  destructive:
    "bg-admin-danger text-white hover:opacity-90 focus-visible:ring-admin-danger focus-visible:ring-offset-admin-bg",
  link: "bg-transparent text-admin-primary underline-offset-4 hover:underline h-auto px-0 focus-visible:ring-admin-primary",
};

// Kameleon buttons favor large tactile targets, restrained animation, and a
// brushed-copper look per the approved design language.
const kameleonVariants: Record<Variant, string> = {
  primary:
    "bg-kameleon-copper text-kameleon-bg hover:bg-kameleon-copper-light tracking-wide uppercase focus-visible:ring-kameleon-focus-ring focus-visible:ring-offset-kameleon-bg",
  secondary:
    "bg-transparent border border-kameleon-copper text-kameleon-copper-light hover:bg-kameleon-surface-raised tracking-wide uppercase focus-visible:ring-kameleon-focus-ring focus-visible:ring-offset-kameleon-bg",
  ghost:
    "bg-transparent text-kameleon-text-muted hover:text-kameleon-text focus-visible:ring-kameleon-focus-ring focus-visible:ring-offset-kameleon-bg",
  destructive:
    "bg-kameleon-red text-kameleon-text hover:opacity-90 focus-visible:ring-kameleon-focus-ring focus-visible:ring-offset-kameleon-bg",
  link: "bg-transparent text-kameleon-copper-light underline-offset-4 hover:underline h-auto px-0 focus-visible:ring-kameleon-focus-ring",
};

function buttonClasses({
  brand = "admin",
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  brand?: Brand;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
}) {
  const variants = brand === "kameleon" ? kameleonVariants : adminVariants;
  return cn(base, sizes[size], variants[variant], fullWidth && "w-full", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  brand?: Brand;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      brand = "admin",
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClasses({ brand, variant, size, fullWidth, className })}
        {...props}
      >
        {loading && <Spinner size={size === "lg" ? "md" : "sm"} className="shrink-0" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export interface LinkButtonProps extends ComponentProps<typeof Link> {
  brand?: Brand;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/** Same visual system as Button, for navigation that should look like a button. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ brand = "admin", variant = "primary", size = "md", fullWidth = false, className, ...props }, ref) => {
    return (
      <Link ref={ref} className={buttonClasses({ brand, variant, size, fullWidth, className })} {...props} />
    );
  },
);

LinkButton.displayName = "LinkButton";
