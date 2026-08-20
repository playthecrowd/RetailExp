"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useGifting } from "@/lib/gifting/simulation/store";
import { AI_STAGE_LABELS } from "@/lib/gifting/simulation/types";
import type { GalleryItem } from "@/lib/gifting/simulation/types";
import {
  ActionTray,
  GuidanceTray,
  HelpDot,
  LiveRegion,
  Pager,
  PagerCount,
  PagerDots,
  Stage,
  StageBody,
  StageProvider,
  useStage,
} from "./shell";
import { Body, Button, Pill } from "./ui";

/**
 * The visitor's private gallery, as a swipeable deck.
 *
 * WHY A DECK RATHER THAN A FEED
 *   A vertical list of four large cards is four screens of scrolling on a
 *   phone, and it buries the return action at the bottom. One gift per screen
 *   with a swipe between them keeps every action fixed and reachable, and it
 *   is the interaction people already use for photos.
 *
 * OWNER-SCOPED BY CONSTRUCTION
 *   Everything shown comes from this session's own state. There is no query
 *   and no id in a URL to change — the same guarantee the real gallery will
 *   make with signed delivery, expressed the only way a prototype can.
 */
export function Gallery() {
  return (
    <StageProvider stepKey="gallery">
      <GalleryStage />
    </StageProvider>
  );
}

function GalleryStage() {
  const { gallery, dispatch, config, showToast } = useGifting();
  const { reveal, announce, setPinned } = useStage();
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);

  const item: GalleryItem | undefined = gallery[Math.min(index, gallery.length - 1)];
  const processing =
    item?.kind === "ai" && item.stage && item.stage !== "ready" && item.stage !== "failed";

  // A destructive confirmation must not fade away mid-decision.
  useEffect(() => setPinned(Boolean(confirming)), [confirming, setPinned]);

  useEffect(() => {
    if (item) announce(`${item.title}. ${item.subtitle}.`);
  }, [item, announce]);

  const backToLauncher = () => {
    dispatch({ type: "RESET_FLOW" });
    dispatch({ type: "SCENARIO", scenario: "launcher" });
  };

  if (!item) {
    return (
      <Stage media={<Backdrop />}>
        <GuidanceTray title="Your gallery is empty" onHelp={reveal} />
        <ActionTray forceVisible>
          <Button onClick={backToLauncher}>Back to demo launcher</Button>
        </ActionTray>
      </Stage>
    );
  }

  return (
    <Stage media={<Backdrop />}>
      <LiveRegion />
      <GuidanceTray
        title="Your gifts"
        instruction="Swipe to move between them. Only you can see these."
        onHelp={reveal}
      />
      <HelpDot onClick={reveal} />

      <StageBody>
        <Pager onIndexChange={setIndex}>
          {gallery.map((g) => (
            <GiftCard key={g.id} item={g} />
          ))}
        </Pager>
        <div className="mt-4 grid gap-2">
          <PagerDots count={gallery.length} index={index} />
          <PagerCount index={index} count={gallery.length} />
        </div>
      </StageBody>

      <ActionTray forceVisible>
        {confirming === item.id ? (
          <>
            <p className="px-1 pb-1 text-center text-[12px] text-gift-ink">
              Delete this gift permanently?
            </p>
            <Button
              variant="danger"
              onClick={() => {
                dispatch({ type: "DELETE_ITEM", id: item.id });
                setConfirming(null);
                showToast("Gift deleted");
                setIndex(0);
              }}
            >
              Yes, delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Chip disabled={Boolean(processing)} onClick={() => showToast("Playing gift")}>
                Play
              </Chip>
              <Chip disabled={Boolean(processing)} onClick={() => showToast("Download simulated")}>
                Download
              </Chip>
              <Chip
                disabled={Boolean(processing)}
                onClick={() => showToast("Share sheet simulated")}
              >
                Share
              </Chip>
              <Chip
                disabled={Boolean(processing)}
                onClick={() => {
                  void navigator.clipboard?.writeText(`https://example.com/g/${item.id}`);
                  showToast("Private link copied");
                }}
              >
                Copy link
              </Chip>
              {item.direction === "received" && config.regiftingEnabled && (
                <Chip
                  onClick={() => {
                    dispatch({ type: "START_CREATE", isRegift: true });
                    dispatch({ type: "SCENARIO", scenario: "regift" });
                  }}
                >
                  Regift
                </Chip>
              )}
              <Chip tone="danger" onClick={() => setConfirming(item.id)}>
                Delete
              </Chip>
            </div>
            <Button variant="ghost" onClick={backToLauncher}>
              Back to demo launcher
            </Button>
          </>
        )}
      </ActionTray>
    </Stage>
  );
}

function Backdrop() {
  return (
    <>
      <Image
        src="/demo/gifting/stills/gate-background.png"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-[rgba(250,249,246,0.78)]" />
    </>
  );
}

function GiftCard({ item }: { item: GalleryItem }) {
  const processing =
    item.kind === "ai" && item.stage && item.stage !== "ready" && item.stage !== "failed";
  return (
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-[rgba(250,249,246,0.9)] backdrop-blur-xl">
      <div className="relative aspect-[16/10] w-full">
        <Image
          src={item.media.thumb ?? item.media.poster}
          alt={item.media.alt}
          fill
          sizes="(max-width:480px) 100vw, 420px"
          className="object-cover"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Pill tone={item.direction === "received" ? "accent" : "neutral"}>
            {item.direction === "received" ? "Received" : "Created"}
          </Pill>
          {item.kind === "ai" && <Pill tone="warn">Scene</Pill>}
        </div>
        {processing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[2px]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gift-border border-t-gift-ink" />
            <span className="text-[12px] font-medium text-gift-ink">
              {AI_STAGE_LABELS[item.stage!]}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] text-gift-ink">{item.title}</p>
          <span className="shrink-0 text-[11px] text-gift-ink-faint">{item.createdLabel}</span>
        </div>
        <Body className="mt-1 text-[12px]">{item.subtitle}</Body>
        {item.stage === "failed" && (
          <p className="mt-2 text-[12px] text-gift-danger">
            Generation didn&apos;t complete. Credits were refunded.
          </p>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  tone = "neutral",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-full border px-4 text-[12px] transition-colors disabled:opacity-35 ${
        tone === "danger"
          ? "border-gift-danger/40 text-gift-danger"
          : "border-gift-border bg-white/70 text-gift-ink-soft hover:border-gift-border-strong hover:text-gift-ink"
      }`}
    >
      {children}
    </button>
  );
}
