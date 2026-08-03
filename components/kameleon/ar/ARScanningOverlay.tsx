"use client";

import type { ARPhase } from "@/lib/kameleon/ar/ar-types";
import { cn } from "@/lib/cn";

function instructionFor(phase: ARPhase): string {
  switch (phase) {
    case "requesting-session":
      return "Starting camera…";
    case "scanning":
      return "Move your phone slowly and point it toward the floor.";
    case "surface-found":
      return "Surface found. Tap to place.";
    case "placed":
      return "Move around to see your object from every angle.";
    case "tracking-lost":
      return "Tracking lost — hold your phone steady.";
    default:
      return "";
  }
}

/** Top instruction pill, rendered inside the WebXR DOM overlay while a session is active. */
export function ARScanningOverlay({ phase }: { phase: ARPhase }) {
  const text = instructionFor(phase);
  if (!text) return null;

  return (
    <div className="pointer-events-none flex justify-center px-6 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div
        aria-live="polite"
        className={cn(
          "rounded-full border px-4 py-2 text-center text-xs uppercase tracking-widest backdrop-blur-sm",
          phase === "surface-found" && "border-kameleon-copper bg-black/60 text-kameleon-copper-light",
          phase === "tracking-lost" && "border-kameleon-red bg-black/60 text-kameleon-red",
          phase !== "surface-found" && phase !== "tracking-lost" && "border-white/20 bg-black/50 text-kameleon-text",
        )}
      >
        {text}
      </div>
    </div>
  );
}
