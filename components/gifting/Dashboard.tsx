"use client";

import { useState, type ReactNode } from "react";
import { DASHBOARD_FIXTURES, INTRO_POSTER_OPTIONS } from "@/lib/gifting/simulation/fixtures";
import { useGifting } from "@/lib/gifting/simulation/store";
import type { GateKind } from "@/lib/gifting/simulation/types";
import { Body, Card, Eyebrow, Pill, Still, Toggle } from "./ui";

/**
 * The client dashboard, simulated.
 *
 * WHAT THIS IS FOR
 *   Confirming what a client will manage and how it is organised — sixteen
 *   sections, in the order they will actually appear. The tables are fixtures;
 *   the CONTROLS are not. Every toggle here writes to the same store the
 *   visitor flow reads, so turning the age gate off or switching to 18+ and
 *   then running the recipient scenario shows the change immediately. That is
 *   the part worth approving, because it is the part that proves the flow is
 *   configuration rather than hard-coded screens.
 *
 * SCOPED TO ONE TENANT
 *   Every number and row below comes from the gifting fixtures module and is
 *   labelled Gifting Demo Client 1. Nothing here reads or writes another
 *   client's data, because there is no data layer at all.
 */

const SECTIONS = [
  "Overview",
  "Experience Settings",
  "Entry Codes",
  "Gift Reveal",
  "Eligibility Gates",
  "Brand Intro",
  "Visitor Form",
  "Gift Creation",
  "AI Templates",
  "Physical Products",
  "Visitors",
  "Gift Messages",
  "AI Jobs",
  "Media Library",
  "Credits & Usage",
  "Team & Access",
] as const;

type Section = (typeof SECTIONS)[number];

export function GiftingDashboard({ onExit }: { onExit?: () => void }) {
  const [section, setSection] = useState<Section>("Overview");

  return (
    <div className="min-h-dvh bg-gift-bg text-gift-ink">
      <header className="border-b border-gift-border bg-gift-surface">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <nav className="flex items-center gap-2 text-[12px] text-gift-ink-faint">
            <span>Experiences</span>
            <span aria-hidden="true">/</span>
            <span className="text-gift-ink">Gifting Demo Client 1</span>
          </nav>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[20px] font-light tracking-tight">Gifting Demo</h1>
            <div className="flex items-center gap-2">
              <Pill tone="warn">Preview</Pill>
              <Pill tone="neutral">retail_gifting</Pill>
              {onExit && (
                <button
                  type="button"
                  onClick={onExit}
                  className="min-h-11 rounded-full border border-gift-border px-4 text-[12px] text-gift-ink-soft hover:border-gift-border-strong hover:text-gift-ink"
                >
                  Exit
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 lg:flex lg:gap-8">
        {/* Horizontal scroller on a phone, sidebar on a desktop. Sixteen
            sections do not fit anywhere on a 390px screen, and hiding them
            behind a hamburger would defeat the point of the review. */}
        <nav className="-mx-5 mb-6 overflow-x-auto px-5 lg:mx-0 lg:mb-0 lg:w-56 lg:shrink-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(s)}
                  className={`min-h-11 whitespace-nowrap rounded-full px-4 text-left text-[12px] transition-colors lg:w-full lg:rounded-lg ${
                    section === s
                      ? "bg-gift-ink text-white"
                      : "text-gift-ink-soft hover:bg-gift-surface hover:text-gift-ink"
                  }`}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <SectionBody section={section} />
        </main>
      </div>
    </div>
  );
}

function SectionBody({ section }: { section: Section }) {
  const { config, dispatch, templates, credits } = useGifting();
  const f = DASHBOARD_FIXTURES;

  switch (section) {
    case "Overview":
      return (
        <Panel title="Overview" note="Live counts for this experience.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Visitors" value={f.overview.visitors} />
            <Stat label="Gifts created" value={f.overview.giftsCreated} />
            <Stat label="Gifts received" value={f.overview.giftsReceived} />
            <Stat label="Gifts opened" value={f.overview.giftsOpened} />
            <Stat label="AI completed" value={f.overview.aiCompleted} />
            <Stat label="AI failed" value={f.overview.aiFailed} />
            <Stat label="Credits available" value={credits.available} />
            <Stat
              label="Balance"
              value={credits.available < credits.lowBalanceThreshold ? "Low" : "Healthy"}
              tone={credits.available < credits.lowBalanceThreshold ? "bad" : "good"}
            />
          </div>
          <div className="mt-4">
            {/* A landscape source at a landscape ratio. The first media-library
                entry is a 9:16 poster, and cropping that to 3:1 showed one
                zoomed inch of a bottle. */}
            <Still
              src="/demo/gifting/stills/hero-product.png"
              alt="Gifting Demo experience preview"
              ratio="aspect-[16/7]"
            />
          </div>
        </Panel>
      );

    case "Experience Settings":
      return (
        <Panel title="Experience Settings" note="General configuration and publishing.">
          <KeyValue rows={[
            ["Client", "Gifting Demo Client 1"],
            ["Experience", "Gifting Demo"],
            ["Template", "retail_gifting"],
            ["Route", "/experience/gifting-demo-client-1"],
            ["Publication", "Draft — preview only"],
            ["Theme", "Neutral luxury"],
          ]} />
        </Panel>
      );

    case "Entry Codes":
      return (
        <Panel title="Entry Codes" note="Package Codes and Gift Message Codes.">
          <Table
            head={["Package Code", "Status", "Batch", "Recipient"]}
            rows={f.packages.map((p) => [
              <span key="c" className="font-mono tracking-wider">{p.code}</span>,
              <StatusPill key="s" status={p.status} />,
              p.batch,
              p.recipient,
            ])}
          />
        </Panel>
      );

    case "Gift Reveal":
      return (
        <Panel title="Gift Reveal" note="What the recipient sees first.">
          <KeyValue rows={[
            ["Heading", "You Received a Gift From {sender}"],
            ["Sender format", "First name"],
            ["Replay allowed", "Yes"],
            ["Continue", "Straight to the eligibility gate"],
          ]} />
          <div className="mt-4 max-w-xs">
            <Still src="/demo/gifting/stills/poster-gift-reveal.png" alt="Gift reveal poster" ratio="aspect-[9/16]" />
          </div>
        </Panel>
      );

    case "Eligibility Gates":
      return (
        <Panel title="Eligibility Gates" note="Shown after the personalised reveal.">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["disabled", "age_18", "age_21", "acknowledgement"] as GateKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => dispatch({ type: "GATE_KIND", kind })}
                className={`min-h-12 rounded-xl border px-4 text-left text-[13px] transition-colors ${
                  config.gateKind === kind
                    ? "border-gift-champagne bg-gift-champagne/10 text-gift-ink"
                    : "border-gift-border bg-gift-surface text-gift-ink-soft hover:border-gift-border-strong"
                }`}
              >
                {kind === "disabled" && "No gate"}
                {kind === "age_18" && "18+"}
                {kind === "age_21" && "21+"}
                {kind === "acknowledgement" && "Custom acknowledgement"}
              </button>
            ))}
          </div>
          {config.gateKind !== "disabled" && (
            <Card className="mt-4 p-4">
              <Eyebrow>Preview</Eyebrow>
              <p className="mt-2 text-[15px] text-gift-ink">{config.gateHeading}</p>
              <Body className="mt-1 text-[12px]">{config.gateBody}</Body>
              <div className="mt-3 flex gap-2 text-[11px]">
                <span className="rounded-full bg-gift-ink px-3 py-1.5 text-white">
                  {config.gateConfirmLabel}
                </span>
                <span className="rounded-full border border-gift-border px-3 py-1.5 text-gift-ink-soft">
                  {config.gateDeclineLabel}
                </span>
              </div>
            </Card>
          )}
        </Panel>
      );

    case "Brand Intro":
      return (
        <Panel title="Brand Intro" note="A separate, generic film — never merged with the personal reveal.">
          <Toggle
            checked={config.introEnabled}
            onChange={(v) => dispatch({ type: "CONFIG", patch: { introEnabled: v } })}
            label="Show the brand intro"
            description="Plays after the eligibility gate."
          />
          <div className="mt-4">
            <Eyebrow>Poster</Eyebrow>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {INTRO_POSTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => dispatch({ type: "CONFIG", patch: { introPosterId: option.id } })}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    config.introPosterId === option.id
                      ? "border-gift-champagne ring-1 ring-gift-champagne"
                      : "border-gift-border hover:border-gift-border-strong"
                  }`}
                >
                  <Still src={option.src} alt={option.label} ratio="aspect-[3/4]" className="rounded-none" />
                  <span className="block px-2 py-1.5 text-[11px] text-gift-ink-soft">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      );

    case "Visitor Form":
      return (
        <Panel title="Visitor Form" note="Quick sign-up shown before the gift experience.">
          <div className="grid gap-2">
            <Toggle
              checked={config.phoneRequired}
              onChange={(v) => dispatch({ type: "CONFIG", patch: { phoneRequired: v } })}
              label="Require mobile number"
              description="Optional by default."
            />
            <Toggle
              checked={config.marketingConsentEnabled}
              onChange={(v) => dispatch({ type: "CONFIG", patch: { marketingConsentEnabled: v } })}
              label="Offer marketing consent"
              description="Separate from Terms and Privacy, which are always required."
            />
          </div>
        </Panel>
      );

    case "Gift Creation":
      return (
        <Panel title="Gift Creation" note="What senders may create.">
          <div className="grid gap-2">
            <Toggle
              checked={config.standardGiftingEnabled}
              onChange={(v) => dispatch({ type: "CONFIG", patch: { standardGiftingEnabled: v } })}
              label="Standard video gifting"
              description="Works without scene generation or credits."
            />
            <Toggle
              checked={config.aiGiftingEnabled}
              onChange={(v) => dispatch({ type: "CONFIG", patch: { aiGiftingEnabled: v } })}
              label="AI scene gifting"
              description="Requires an active template and available credits."
            />
            <Toggle
              checked={config.regiftingEnabled}
              onChange={(v) => dispatch({ type: "CONFIG", patch: { regiftingEnabled: v } })}
              label="Allow regifting"
              description="A new assignment is created; history is preserved."
            />
          </div>
        </Panel>
      );

    case "AI Templates":
      return (
        <Panel title="AI Templates" note="Controlled scenes. Visitors cannot write prompts.">
          <div className="grid gap-3 sm:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="overflow-hidden">
                <Still src={t.thumbnail} alt={t.title} ratio="aspect-[3/2]" className="rounded-none" />
                <div className="p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13px] text-gift-ink">{t.title}</p>
                    <span className="shrink-0 text-[11px] text-gift-ink-faint">{t.creditPrice}c</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "TOGGLE_TEMPLATE", id: t.id })}
                    className={`mt-2 min-h-11 w-full rounded-full border px-3 text-[11px] transition-colors ${
                      t.active
                        ? "border-gift-success/40 bg-gift-success/10 text-gift-success"
                        : "border-gift-border text-gift-ink-faint"
                    }`}
                  >
                    {t.active ? "Active" : "Inactive"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </Panel>
      );

    case "Physical Products":
      return (
        <Panel title="Physical Products" note="Packages and their assignment history.">
          <Table
            head={["Package", "Status", "Batch", "Assigned to"]}
            rows={f.packages.map((p) => [
              <span key="c" className="font-mono tracking-wider">{p.code}</span>,
              <StatusPill key="s" status={p.status} />,
              p.batch,
              p.recipient,
            ])}
          />
        </Panel>
      );

    case "Visitors":
      return (
        <Panel title="Visitors" note="Only visitors attached to this client.">
          <Table
            head={["Name", "Email", "Sent", "Received", "Last active"]}
            rows={f.visitors.map((v) => [v.name, v.email, String(v.sent), String(v.received), v.last])}
          />
        </Panel>
      );

    case "Gift Messages":
      return (
        <Panel title="Gift Messages" note="Sender, recipient and both code states.">
          <Table
            head={["Sender", "Recipient", "Package", "Message", "Source", "Completed"]}
            rows={f.giftMessages.map((g) => [
              g.sender,
              g.recipient,
              <StatusPill key="p" status={g.packageStatus} />,
              <StatusPill key="m" status={g.messageStatus} />,
              <StatusPill key="s" status={g.source} />,
              <StatusPill key="c" status={g.completed} />,
            ])}
          />
        </Panel>
      );

    case "AI Jobs":
      return (
        <Panel title="AI Jobs" note="Provider expense and retail charge are tracked separately.">
          <Table
            head={["Job", "Template", "Provider", "Status", "Attempts", "Expense", "Charge"]}
            rows={f.aiJobs.map((j) => [
              <span key="i" className="font-mono text-[11px]">{j.id}</span>,
              j.template,
              j.provider,
              <StatusPill key="s" status={j.status} />,
              String(j.attempts),
              j.expense,
              j.charge,
            ])}
          />
        </Panel>
      );

    case "Media Library":
      return (
        <Panel title="Media Library" note="Every replaceable asset in this experience.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {f.mediaLibrary.map((m) => (
              <Card key={m.name} className="overflow-hidden">
                <Still src={m.src} alt={m.name} ratio="aspect-[3/2]" className="rounded-none" />
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="text-[12px] text-gift-ink">{m.name}</span>
                  <Pill>{m.kind}</Pill>
                </div>
              </Card>
            ))}
          </div>
        </Panel>
      );

    case "Credits & Usage":
      return (
        <Panel title="Credits & Usage" note="An append-only ledger; the balance is its sum.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Available" value={credits.available} />
            <Stat label="Reserved" value={credits.reserved} />
            <Stat label="Consumed" value={credits.consumed} />
            <Stat label="Promotional" value={credits.promotional} />
          </div>
          <div className="mt-4">
            <Table
              head={["Entry", "Amount", "Note", "When"]}
              rows={f.creditHistory.map((c) => [c.type, c.amount, c.note, c.when])}
            />
          </div>
        </Panel>
      );

    case "Team & Access":
      return (
        <Panel title="Team & Access" note="Administrators for this tenant only.">
          <Table
            head={["Name", "Email", "Role", "Status"]}
            rows={f.team.map((t) => [t.name, t.email, t.role, <StatusPill key="s" status={t.status} />])}
          />
        </Panel>
      );

    default:
      return null;
  }
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[16px] font-medium text-gift-ink">{title}</h2>
      {note && <Body className="mt-1 text-[12px]">{note}</Body>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-gift-border bg-gift-surface p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-gift-ink-faint">{label}</p>
      <p
        className={`mt-1 text-[22px] font-light ${
          tone === "bad" ? "text-gift-danger" : tone === "good" ? "text-gift-success" : "text-gift-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function KeyValue({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gift-border bg-gift-surface">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={`flex items-baseline justify-between gap-4 px-4 py-3 ${i > 0 ? "border-t border-gift-border" : ""}`}
        >
          <span className="text-[11px] uppercase tracking-[0.14em] text-gift-ink-faint">{k}</span>
          <span className="text-right text-[13px] text-gift-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div className="min-w-[34rem] overflow-hidden rounded-xl border border-gift-border bg-gift-surface">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gift-border">
              {head.map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gift-ink-faint"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i > 0 ? "border-t border-gift-border" : ""}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-[12px] text-gift-ink">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ready" || status === "active" || status === "Active" || status === "assigned"
      ? "good"
      : status === "failed" || status === "revoked"
        ? "bad"
        : status === "generating" || status === "processing" || status === "pending" || status === "Invited"
          ? "warn"
          : "neutral";
  return <Pill tone={tone}>{status}</Pill>;
}
