import Image from "next/image";
import { cn } from "@/lib/cn";
import { Skyline } from "./Skyline";
import { DecanterIcon, ToastIcon, BrushIcon, FireworkIcon } from "../icons";
import {
  kameleonFullscreenPhotos,
  kameleonPhotoFocalPoint,
  kameleonPathwayThumbnails,
  kameleonDecisionThumbnails,
} from "@/lib/kameleon/production-assets";

export type EnvironmentMotif = "private-pour" | "social-shift" | "create" | "arrive" | "the-table";

const motifConfig: Record<
  EnvironmentMotif,
  { gradient: string; skylineTone: "neutral" | "red" | "blue" | "sunset"; icon: typeof DecanterIcon; glow: string }
> = {
  "private-pour": {
    gradient: "from-[#241a14] via-kameleon-surface to-black",
    skylineTone: "neutral",
    icon: DecanterIcon,
    glow: "bg-kameleon-red/20",
  },
  "social-shift": {
    gradient: "from-[#131a24] via-kameleon-surface to-black",
    skylineTone: "blue",
    icon: ToastIcon,
    glow: "bg-kameleon-blue/20",
  },
  create: {
    gradient: "from-[#241418] via-kameleon-surface to-black",
    skylineTone: "neutral",
    icon: BrushIcon,
    glow: "bg-kameleon-red/20",
  },
  arrive: {
    gradient: "from-[#2a1710] via-kameleon-surface to-black",
    skylineTone: "sunset",
    icon: FireworkIcon,
    glow: "bg-kameleon-blue/15",
  },
  "the-table": {
    gradient: "from-[#241a14] via-kameleon-surface to-black",
    skylineTone: "neutral",
    icon: ToastIcon,
    glow: "bg-kameleon-copper/20",
  },
};

/**
 * Shared, parameterized "environment scene" used across every screen that
 * needs pathway/environment imagery. Now backed by real production
 * photography (docs/KAMELEON_ASSET_MANIFEST.md) with the same CSS/SVG
 * composition as a graceful fallback if a photo is ever missing — so this
 * component's contract never changes for callers regardless of asset
 * availability.
 */
export function EnvironmentArt({
  motif,
  photoSrc,
  className,
  priority = false,
  gradientOverlay = true,
  thumbnailKind,
  children,
}: {
  /**
   * A curated illustrated motif (see EnvironmentMotif) OR — for real,
   * per-pathway content such as the character pathways — an arbitrary
   * pathway/node slug with no entry in motifConfig. When `photoSrc` isn't
   * given and the motif is unrecognized, this renders a neutral fallback
   * instead of throwing (there's no dedicated illustrated fallback for
   * every possible real pathway).
   */
  motif: string;
  /** Real photo URL to render instead of the motif-driven bundled art (used for real, non-curated pathway content). Takes priority over `motif` for photo selection. */
  photoSrc?: string;
  className?: string;
  /** Set true only for the single most important image on the current screen (LCP). */
  priority?: boolean;
  /** Adds a bottom-to-top dark gradient for text legibility over the photo. */
  gradientOverlay?: boolean;
  /**
   * When set, prefer the dedicated pre-composed crop for this motif
   * (public/assets/kameleon/{pathway-thumbnails,decision-thumbnails}/) over
   * cropping the full-screen photo. Falls back to the full-screen-photo crop
   * for any motif with no dedicated file (currently "the-table" only — see
   * lib/kameleon/production-assets.ts).
   */
  thumbnailKind?: "pathway-card" | "decision";
  children?: React.ReactNode;
}) {
  const config = motifConfig[motif as EnvironmentMotif];
  const dedicatedThumbnail =
    thumbnailKind === "pathway-card"
      ? kameleonPathwayThumbnails[motif as EnvironmentMotif]
      : thumbnailKind === "decision"
        ? kameleonDecisionThumbnails[motif as EnvironmentMotif]
        : undefined;
  const photo = photoSrc ?? dedicatedThumbnail ?? kameleonFullscreenPhotos[motif as EnvironmentMotif];
  // A dedicated crop is already composed at its target ratio (16:9 or 3:2),
  // so it renders centered; only the full-screen source needs the per-motif
  // focal point to keep the subject in frame when cropped to a narrower box.
  const objectPosition = photoSrc ? "center" : dedicatedThumbnail ? "center" : kameleonPhotoFocalPoint[motif as EnvironmentMotif];

  // The outer div is fully caller-controlled (sizing: h-64, aspect-[16/9],
  // absolute inset-0, h-full w-full, etc.) and deliberately carries no
  // hardcoded position class of its own — `cn` here does no Tailwind
  // dedupe/merge (see lib/cn.ts), so a hardcoded "relative" would silently
  // beat a caller-supplied "absolute" in the compiled stylesheet regardless
  // of class-string order, collapsing the box to the photo's natural size.
  // The inner div owns "relative" purely to anchor the `fill` image/overlay.
  // Real, remote (Supabase Storage signed-URL) photos bypass next/image —
  // they're not in the local static-import set next/image expects and carry
  // their own signed query string that shouldn't be re-optimized.
  if (photoSrc) {
    return (
      <div className={cn("overflow-hidden bg-kameleon-bg", className)}>
        <div className="relative h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoSrc}
            alt=""
            loading={priority ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition }}
          />
          {gradientOverlay && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
          )}
          {children}
        </div>
      </div>
    );
  }

  if (photo) {
    return (
      <div className={cn("overflow-hidden bg-kameleon-bg", className)}>
        <div className="relative h-full w-full">
          <Image
            src={photo}
            alt=""
            fill
            priority={priority}
            loading={priority ? undefined : "lazy"}
            sizes="(max-width: 520px) 100vw, 520px"
            className="object-cover"
            style={{ objectPosition }}
          />
          {gradientOverlay && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
          )}
          {children}
        </div>
      </div>
    );
  }

  // Fallback: CSS/SVG composition (no photography available for this motif,
  // or an unrecognized motif — e.g. a real character-pathway slug with no
  // curated illustrated fallback).
  const fallback = config ?? {
    gradient: "from-[#1c1410] via-kameleon-surface to-black",
    skylineTone: "neutral" as const,
    icon: ToastIcon,
    glow: "bg-kameleon-copper/15",
  };
  const Icon = fallback.icon;
  return (
    <div className={cn("overflow-hidden bg-gradient-to-b", fallback.gradient, className)}>
      <div className={cn("relative h-full w-full")}>
        <div className={cn("absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl", fallback.glow)} />
        <Icon className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-kameleon-copper-light/10" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 opacity-60">
          <Skyline tone={fallback.skylineTone} />
        </div>
        {gradientOverlay && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
        )}
        {children}
      </div>
    </div>
  );
}
