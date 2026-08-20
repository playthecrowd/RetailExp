"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MediaRef } from "@/lib/gifting/simulation/types";

/**
 * The shared surface of the gifting prototype.
 *
 * WHY THESE ARE PRIMITIVES RATHER THAN PER-SCREEN MARKUP
 *   Sixteen dashboard sections and two multi-step visitor journeys is a lot of
 *   places to accidentally invent a slightly different button. Everything that
 *   repeats lives here once, so the whole demo reads as one product rather
 *   than as twenty screens built in a row.
 *
 * NO EMPTY MEDIA, ANYWHERE
 *   Every video in this prototype is a poster with a video layered over it, so
 *   there is never a black rectangle while something loads — which is a stated
 *   requirement and also the single fastest way to make a demo look unfinished.
 */

export function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("min-h-dvh w-full bg-gift-bg text-gift-ink", className)}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {children}
    </div>
  );
}

/** The phone-width column everything sits in. Mobile-first: it is a full-width
 *  column on a phone and a centred card on a desktop, never a stretched form. */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[30rem] px-5 pb-10", className)}>{children}</div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-gift-ink-faint">
      {children}
    </p>
  );
}

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("text-[1.6rem] leading-tight font-light tracking-tight text-gift-ink", className)}>
      {children}
    </h1>
  );
}

export function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm leading-relaxed text-gift-ink-soft", className)}>{children}</p>;
}

/** A hairline with a champagne centre. The one decorative flourish in the
 *  whole system, used to mark the top of a screen. */
export function Rule({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="h-px flex-1 bg-gift-border" />
      <span className="h-px w-8 bg-gift-champagne" />
      <span className="h-px flex-1 bg-gift-border" />
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  className?: string;
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  full = true,
  type = "button",
  className,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // 48px tall: comfortably past the 44px floor, because every one of
        // these is tapped with a thumb.
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[13px] font-medium tracking-wide transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gift-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-gift-bg",
        "disabled:cursor-not-allowed disabled:opacity-40",
        full && "w-full",
        variant === "primary" && "bg-gift-ink text-white hover:bg-[#3d4044]",
        variant === "secondary" &&
          "border border-gift-border-strong bg-gift-surface text-gift-ink hover:border-gift-ink-faint",
        variant === "ghost" && "text-gift-ink-soft hover:text-gift-ink",
        variant === "danger" && "border border-gift-danger/40 text-gift-danger hover:bg-gift-danger/5",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  onClick,
  selected,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "w-full rounded-2xl border bg-gift-surface text-left transition-colors",
        selected ? "border-gift-champagne ring-1 ring-gift-champagne" : "border-gift-border",
        onClick && "hover:border-gift-border-strong",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  required,
  autoCapitalize,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  required?: boolean;
  autoCapitalize?: "none" | "characters";
  inputMode?: "text" | "email" | "tel" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-gift-ink-faint">
        {label}
        {required && <span className="ml-1 text-gift-champagne">*</span>}
      </span>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-12 w-full rounded-xl border border-gift-border bg-gift-surface px-4 text-[15px] text-gift-ink placeholder:text-gift-ink-faint/70 focus:border-gift-champagne focus:outline-none focus:ring-1 focus:ring-gift-champagne"
      />
      {hint && <span className="mt-1 block text-[11px] text-gift-ink-faint">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-gift-border-strong text-gift-ink accent-[#2e3033] focus-visible:ring-2 focus-visible:ring-gift-champagne"
      />
      <span className="text-[13px] leading-snug text-gift-ink-soft">{children}</span>
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-gift-border bg-gift-surface px-4 py-2.5 text-left transition-colors hover:border-gift-border-strong"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-gift-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-gift-ink-faint">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-gift-ink" : "bg-gift-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
        tone === "neutral" && "bg-gift-surface-sunk text-gift-ink-soft",
        tone === "good" && "bg-gift-success/10 text-gift-success",
        tone === "warn" && "bg-gift-champagne/15 text-[#8a7134]",
        tone === "bad" && "bg-gift-danger/10 text-gift-danger",
        tone === "accent" && "bg-gift-blue/10 text-gift-blue",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Poster-backed video.
 *
 * The poster is a real <Image> underneath the <video>, not the video's own
 * poster attribute, so the frame is filled the instant the screen paints and
 * stays filled if the file is slow or missing entirely. That is what stops the
 * demo ever showing an empty black box.
 */
export function VideoPanel({
  source,
  autoPlay = false,
  onEnded,
  className,
  rounded = true,
}: {
  source: MediaRef;
  autoPlay?: boolean;
  onEnded?: () => void;
  className?: string;
  rounded?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoPlay) return;
    void video.play().catch(() => {
      // Autoplay refusal is normal and not an error: the poster is already
      // showing and the Play control is right there.
    });
  }, [autoPlay, source.video]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  return (
    <div
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden bg-gift-surface-sunk",
        rounded && "rounded-2xl",
        className,
      )}
    >
      <Image
        src={source.poster}
        alt={source.alt}
        fill
        sizes="(max-width: 480px) 100vw, 480px"
        className="object-cover"
        priority
      />
      {source.video && (
        <video
          ref={videoRef}
          src={source.video}
          playsInline
          {...{ "webkit-playsinline": "true" }}
          muted={muted}
          preload="metadata"
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setEnded(true);
            onEnded?.();
          }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            playing || ended ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {source.video && (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="absolute inset-0 flex items-center justify-center focus-visible:outline-none"
          >
            {!playing && (
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/70 bg-black/25 backdrop-blur-sm transition-transform hover:scale-105">
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-white" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                </svg>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = !video.muted;
              setMuted(video.muted);
            }}
            className="absolute bottom-3 right-3 min-h-11 min-w-11 rounded-full bg-black/35 px-3 text-[11px] text-white backdrop-blur-sm"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        </>
      )}
    </div>
  );
}

/** A framed still for places that never had a video — thumbnails, product
 *  shots, gate art. Same rounding and same fallback tint as VideoPanel so the
 *  two never look like different components. */
export function Still({
  src,
  alt,
  ratio = "aspect-[3/2]",
  className,
  priority,
}: {
  src: string;
  alt: string;
  ratio?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-2xl bg-gift-surface-sunk", ratio, className)}>
      <Image src={src} alt={alt} fill sizes="(max-width: 480px) 100vw, 480px" className="object-cover" priority={priority} />
    </div>
  );
}

/** A step marker. Deliberately not a percentage — the visitor is walking a
 *  known number of screens, and saying which one is honest and calming. */
export function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-0.5 flex-1 rounded-full transition-colors",
            i < current ? "bg-gift-champagne" : "bg-gift-border",
          )}
        />
      ))}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-5">
      <div className="rounded-full bg-gift-ink px-5 py-3 text-[12px] text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}

/** A code, shown the way a code should be: monospaced, letter-spaced, and
 *  tappable to copy. */
export function CodeChip({
  code,
  label,
  onCopy,
}: {
  code: string;
  label?: string;
  onCopy?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="w-full rounded-xl border border-dashed border-gift-border-strong bg-gift-surface px-4 py-3 text-left transition-colors hover:border-gift-champagne"
    >
      {label && (
        <span className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-gift-ink-faint">
          {label}
        </span>
      )}
      <span className="block font-mono text-[15px] tracking-[0.18em] text-gift-ink">{code}</span>
    </button>
  );
}
