"use client";

import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import { CheckCircleIcon } from "@/components/kameleon/icons";
import { getPathway, getNode } from "@/lib/kameleon/live-content";
import type { ViewerProgress } from "@/lib/kameleon/pathway-model";

export function JourneyCompletion({
  progress,
  onExploreAnother,
  onReplay,
}: {
  progress: ViewerProgress;
  onExploreAnother: () => void;
  onReplay: () => void;
}) {
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied">("idle");
  const pathway = progress.pathwayId ? getPathway(progress.pathwayId) : undefined;
  const chapters = progress.history.length + 1;
  const choices = progress.history.length;
  const breadcrumb = [
    pathway ? getNode(pathway.rootNodeId)?.title : undefined,
    ...progress.history.map((h) => getNode(h.destinationNodeId)?.title),
  ].filter(Boolean) as string[];

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}`;
    const shareData = { title: "Kameleon", text: "I just completed the Kameleon journey.", url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareState("shared");
      } catch {
        // user cancelled — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <EnvironmentArt motif="the-table" className="absolute inset-0" priority />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-8 pt-10 text-center">
        <KameleonEmblem className="h-8 w-auto" />
        <div>
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Your worlds have merged
          </h1>
          <p className="mt-3 max-w-xs text-sm text-kameleon-text-muted">
            Four cities. Four lives. One connection — shaped by every choice you made.
          </p>
        </div>

        <span className="flex items-center gap-2 rounded-full border border-kameleon-copper/40 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-kameleon-copper-light">
          <CheckCircleIcon className="h-4 w-4" />
          Journey complete
        </span>

        <p className="text-sm text-kameleon-text-muted">
          <span className="font-semibold text-kameleon-text">{chapters}</span> chapters ·{" "}
          <span className="font-semibold text-kameleon-text">{choices}</span> choices ·{" "}
          <span className="font-semibold text-kameleon-text">1</span> unique path
        </p>
        {breadcrumb.length > 0 && (
          <p className="text-xs text-kameleon-text-muted">{breadcrumb.join(" → ")}</p>
        )}

        <div className="flex w-full max-w-sm flex-col gap-3">
          <LinkButton brand="kameleon" size="lg" fullWidth href="/experience/kameleon/rewards">
            Your Rewards
          </LinkButton>
          <button
            type="button"
            onClick={onExploreAnother}
            className="flex h-14 w-full items-center justify-center rounded-md bg-gradient-to-r from-kameleon-red to-kameleon-blue px-6 text-base font-medium uppercase tracking-wide text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-kameleon-bg"
          >
            Explore a different path
          </button>
          <Button brand="kameleon" variant="secondary" size="lg" fullWidth onClick={onReplay}>
            Replay your journey
          </Button>
          <Button brand="kameleon" variant="ghost" size="md" fullWidth onClick={handleShare}>
            {shareState === "copied" ? "Link copied!" : shareState === "shared" ? "Shared!" : "Share the experience"}
          </Button>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-kameleon-text-muted">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Your progress has been saved.
        </p>
      </div>
    </div>
  );
}
