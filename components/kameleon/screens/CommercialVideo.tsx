"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MockVideoPlayer } from "@/components/kameleon/MockVideoPlayer";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { KameleonWordmark } from "@/components/kameleon/Wordmark";
import { PortraitGrid } from "@/components/kameleon/art/PortraitGrid";
import { playKameleonSound } from "@/lib/kameleon/sound";
import { getCommercialNode } from "@/lib/kameleon/live-content";
import { cn } from "@/lib/cn";

export function CommercialVideo({
  completed,
  onComplete,
  onContinue,
}: {
  completed: boolean;
  onComplete: () => void;
  onContinue: () => void;
}) {
  const [activating, setActivating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (completed) buttonRef.current?.focus();
  }, [completed]);

  function handleComplete() {
    playKameleonSound("commercialComplete");
    onComplete();
  }

  function handleAccessAr() {
    if (activating) return; // prevent duplicate activation (double-tap, double Enter)
    setActivating(true);
    onContinue();
  }

  const commercial = getCommercialNode();

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-32">
      <KameleonFlowHeader
        steps={[
          { id: "commercial", label: "Commercial", status: "current" },
          { id: "ar", label: "AR Intro", status: "upcoming" },
          { id: "journey", label: "Journey", status: "upcoming" },
        ]}
      />

      <div className="text-center">
        <KameleonWordmark className="text-base" />
      </div>

      <MockVideoPlayer
        title={commercial?.title ?? "The Perfect Pour"}
        durationSeconds={commercial?.durationSeconds ?? 30}
        posterLabel="Kameleon commercial — placeholder"
        captionText={commercial?.description ?? "Four cities. Four lives. One moment."}
        completionThreshold={1}
        onComplete={handleComplete}
        background={<PortraitGrid className="h-full w-full" />}
        src={commercial?.videoSource}
        posterSrc={commercial?.posterSource}
      />

      <p className="text-center text-[11px] uppercase tracking-widest text-kameleon-text-muted/70">
        Commercial · Step 1 of 4
      </p>

      {/* Accessible announcement — screen readers hear this the moment the action becomes available. */}
      <div aria-live="polite" className="sr-only">
        {completed ? "AR experience is now available." : ""}
      </div>

      {/* Bottom-fixed action tray, aligned to the same centered mobile frame as the rest of the app. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center transition-all duration-500 ease-out",
          completed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        )}
      >
        <div
          className="pointer-events-auto w-full max-w-[520px] bg-gradient-to-t from-kameleon-bg via-kameleon-bg/95 to-transparent px-4 pt-8"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <Button
            ref={buttonRef}
            brand="kameleon"
            size="lg"
            fullWidth
            disabled={!completed || activating}
            tabIndex={completed ? 0 : -1}
            onClick={handleAccessAr}
          >
            Access AR Experience
          </Button>
        </div>
      </div>
    </div>
  );
}
