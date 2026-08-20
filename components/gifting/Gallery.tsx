"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useGifting } from "@/lib/gifting/simulation/store";
import { AI_STAGE_LABELS } from "@/lib/gifting/simulation/types";
import type { GalleryItem } from "@/lib/gifting/simulation/types";
import {
  ActionDock,
  BottomSheet,
  Guidance,
  LiveRegion,
  Pager,
  PagerIndicator,
  RecallDot,
  Stage,
  StageContent,
  StageProvider,
  useStage,
} from "./shell";
import { Body, Button, Pill } from "./ui";

/**
 * The visitor's private gallery, as a swipeable deck.
 *
 * ONE CARD, ONE ROW OF CONTROLS
 *   The previous version stacked a six-chip grid under every card, which on a
 *   phone left the card itself a letterbox strip and made six equally-weighted
 *   options out of one obvious action. Now the card gets the screen, the dock
 *   holds a single row — the primary action plus Share, Download and More —
 *   and the rarely-used, consequential things (Regift, Delete) live behind
 *   More in a sheet, where a mis-tap cannot destroy anything.
 *
 * OWNER-SCOPED BY CONSTRUCTION
 *   Everything shown comes from this session's own state. There is no query
 *   and no id in a URL to change — the same guarantee the real gallery will
 *   make with signed delivery, expressed the only way a prototype can.
 */
export function Gallery({ onExit }: { onExit: () => void }) {
  return (
    <StageProvider stepKey="gallery" theme="gallery">
      <GalleryStage onExit={onExit} />
    </StageProvider>
  );
}

function GalleryStage({ onExit }: { onExit: () => void }) {
  const { gallery, dispatch, config, showToast } = useGifting();
  const { announce, setPinned } = useStage();
  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const item: GalleryItem | undefined = gallery[Math.min(index, gallery.length - 1)];
  const processing =
    item?.kind === "ai" && item.stage && item.stage !== "ready" && item.stage !== "failed";

  // A destructive decision must not be taken while instructions are animating.
  useEffect(() => setPinned(sheetOpen), [sheetOpen, setPinned]);

  useEffect(() => {
    if (item) announce(`${item.title}. ${item.subtitle}.`);
  }, [item, announce]);

  if (!item) {
    return (
      <Stage media={<Backdrop />}>
        <Guidance
          title="Nothing here yet"
          instruction="Gifts you receive or create will appear here."
          onExit={onExit}
        />
        <RecallDot />
        <ActionDock>
          <Button onClick={onExit}>Back</Button>
        </ActionDock>
      </Stage>
    );
  }

  const primaryLabel = processing
    ? "Still Preparing"
    : item.kind === "ai"
      ? "Play Gift"
      : "View Gift";

  return (
    <Stage media={<Backdrop />}>
      <LiveRegion />
      <Guidance
        title="My Gifts"
        instruction="Swipe to move between them. Only you can see these."
        onExit={onExit}
      />
      <RecallDot />

      <StageContent fill>
        <Pager onIndexChange={setIndex} className="flex-1">
          {gallery.map((g) => (
            <GiftCard key={g.id} item={g} />
          ))}
        </Pager>
        <div className="mt-3 shrink-0">
          <PagerIndicator index={index} count={gallery.length} />
        </div>
      </StageContent>

      <ActionDock>
        <Button disabled={Boolean(processing)} onClick={() => showToast(`Opening ${item.title}`)}>
          {primaryLabel}
        </Button>
        {/* One row. Everything here is safe to tap by accident. */}
        <div className="grid grid-cols-3 gap-2">
          <Chip
            disabled={Boolean(processing)}
            onClick={() => {
              void navigator.clipboard?.writeText(`https://example.com/g/${item.id}`);
              showToast("Private link copied");
            }}
          >
            Share
          </Chip>
          <Chip disabled={Boolean(processing)} onClick={() => showToast("Saving to your device")}>
            Download
          </Chip>
          <Chip onClick={() => setSheetOpen(true)}>More</Chip>
        </div>
      </ActionDock>

      <BottomSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setConfirming(false);
        }}
        title={item.title}
      >
        {confirming ? (
          <div className="grid gap-2">
            <p className="text-center text-[13px] text-gift-ink">
              Delete this gift? This cannot be undone.
            </p>
            <Button
              variant="danger"
              onClick={() => {
                dispatch({ type: "DELETE_ITEM", id: item.id });
                setSheetOpen(false);
                setConfirming(false);
                setIndex(0);
                showToast("Gift deleted");
              }}
            >
              Yes, Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep It
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            {item.direction === "received" && config.regiftingEnabled && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSheetOpen(false);
                  dispatch({ type: "START_CREATE", isRegift: true });
                  dispatch({ type: "SCENARIO", scenario: "regift" });
                }}
              >
                Pass This On
              </Button>
            )}
            <Button variant="ghost" onClick={() => showToast("Gift details saved")}>
              Gift Details
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
      </BottomSheet>
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

/** One gift, filling the card slot rather than sitting in a letterbox. */
function GiftCard({ item }: { item: GalleryItem }) {
  const processing =
    item.kind === "ai" && item.stage && item.stage !== "ready" && item.stage !== "failed";
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/60 bg-[rgba(250,249,246,0.9)] backdrop-blur-xl">
      <div className="relative min-h-0 flex-1">
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
      <div className="shrink-0 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[15px] text-gift-ink">{item.title}</p>
          <span className="shrink-0 text-[11px] text-gift-ink-faint">{item.createdLabel}</span>
        </div>
        <Body className="mt-0.5 truncate text-[12px]">{item.subtitle}</Body>
        {item.stage === "failed" && (
          <p className="mt-2 text-[12px] text-gift-danger">
            This one didn&apos;t finish. Your credits were returned.
          </p>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 rounded-full border border-gift-border bg-white/70 px-3 text-[12px] text-gift-ink-soft transition-colors hover:border-gift-border-strong hover:text-gift-ink disabled:opacity-35"
    >
      {children}
    </button>
  );
}
