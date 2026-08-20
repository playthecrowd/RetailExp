"use client";

import { useState } from "react";
import { useGifting } from "@/lib/gifting/simulation/store";
import { AI_STAGE_LABELS } from "@/lib/gifting/simulation/types";
import type { GalleryItem } from "@/lib/gifting/simulation/types";
import { Body, Button, Card, Eyebrow, Frame, Pill, Rule, Still, Title } from "./ui";

/**
 * The visitor's private gallery.
 *
 * OWNER-SCOPED BY CONSTRUCTION
 *   Everything shown comes from this session's own state. There is no query,
 *   no id in a URL and nothing to change to see somebody else's gifts — which
 *   is the same guarantee the real gallery will make with signed delivery,
 *   expressed the only way a prototype can express it.
 *
 * A PROCESSING GIFT IS A REAL CARD
 *   Not a spinner in a corner. It carries its stage name and its actions are
 *   reduced to what is actually possible, so a visitor who walked away from
 *   the generation screen finds it exactly where they expect it.
 */

export function Gallery() {
  const { gallery, dispatch, config } = useGifting();
  const received = gallery.filter((g) => g.direction === "received");
  const created = gallery.filter((g) => g.direction === "created");

  return (
    <Frame className="pt-8">
      <Rule className="mb-8" />
      <Eyebrow>Private gallery</Eyebrow>
      <Title className="mt-2">Your gifts</Title>
      <Body className="mt-3">
        Only you can see these. Links you share are private and can be revoked.
      </Body>

      {received.length > 0 && (
        <>
          <SectionHeading>Received</SectionHeading>
          <div className="grid gap-4">
            {received.map((item) => (
              <GiftCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {created.length > 0 && (
        <>
          <SectionHeading>Created by you</SectionHeading>
          <div className="grid gap-4">
            {created.map((item) => (
              <GiftCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {gallery.length === 0 && (
        <Card className="mt-8 p-8 text-center">
          <Body>Nothing here yet.</Body>
        </Card>
      )}

      <div className="mt-8 grid gap-2">
        {config.standardGiftingEnabled && (
          <Button
            onClick={() => {
              dispatch({ type: "START_CREATE", isRegift: false });
              dispatch({ type: "SCENARIO", scenario: "create" });
            }}
          >
            Create another gift
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            dispatch({ type: "RESET_FLOW" });
            dispatch({ type: "SCENARIO", scenario: "launcher" });
          }}
        >
          Back to demo launcher
        </Button>
      </div>
    </Frame>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-gift-ink-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-gift-border" />
    </div>
  );
}

function GiftCard({ item }: { item: GalleryItem }) {
  const { dispatch, config, showToast } = useGifting();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const processing = item.kind === "ai" && item.stage && item.stage !== "ready" && item.stage !== "failed";
  const failed = item.stage === "failed";

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <Still src={item.media.thumb ?? item.media.poster} alt={item.media.alt} ratio="aspect-[16/10]" className="rounded-none" />
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

        {failed && (
          <p className="mt-2 text-[12px] text-gift-danger">
            Generation didn&apos;t complete. Credits were refunded.
          </p>
        )}

        {!confirmingDelete ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {!processing && <Action onClick={() => showToast("Playing gift")}>Play</Action>}
            {!processing && <Action onClick={() => showToast("Download simulated")}>Download</Action>}
            {!processing && <Action onClick={() => showToast("Share sheet simulated")}>Share</Action>}
            {!processing && (
              <Action
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `https://example.com/g/${item.id}`,
                  );
                  showToast("Private link copied");
                }}
              >
                Copy link
              </Action>
            )}
            {item.direction === "received" && config.regiftingEnabled && (
              <Action
                onClick={() => {
                  dispatch({ type: "START_CREATE", isRegift: true });
                  dispatch({ type: "SCENARIO", scenario: "regift" });
                }}
              >
                Regift
              </Action>
            )}
            <Action tone="danger" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Action>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-gift-danger/30 bg-gift-danger/5 p-3">
            <p className="text-[12px] text-gift-ink">Delete this gift permanently?</p>
            <div className="mt-2 flex gap-2">
              <Action
                tone="danger"
                onClick={() => {
                  dispatch({ type: "DELETE_ITEM", id: item.id });
                  showToast("Gift deleted");
                }}
              >
                Yes, delete
              </Action>
              <Action onClick={() => setConfirmingDelete(false)}>Cancel</Action>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Action({
  children,
  onClick,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-[12px] transition-colors ${
        tone === "danger"
          ? "border-gift-danger/40 text-gift-danger hover:bg-gift-danger/5"
          : "border-gift-border bg-gift-surface text-gift-ink-soft hover:border-gift-border-strong hover:text-gift-ink"
      }`}
    >
      {children}
    </button>
  );
}
