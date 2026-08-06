import { kameleonPathways, getNode } from "@/lib/kameleon/live-content";
import { EnvironmentArt } from "@/components/kameleon/art/EnvironmentArt";
import { DecanterIcon, ToastIcon, BrushIcon, FireworkIcon } from "@/components/kameleon/icons";
import { cn } from "@/lib/cn";
import { playKameleonSound } from "@/lib/kameleon/sound";

const motifIcon = {
  "private-pour": DecanterIcon,
  "social-shift": ToastIcon,
  create: BrushIcon,
  arrive: FireworkIcon,
} as const;

export function ChooseFirstPath({
  onSelect,
  onViewMap,
}: {
  onSelect: (pathwayId: string) => void;
  onViewMap: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-2">
      <div className="shrink-0 pt-1 text-center">
        <div className="mx-auto mb-1.5 h-px w-24 bg-gradient-to-r from-transparent via-kameleon-red to-transparent" />
        <p className="text-[11px] uppercase tracking-widest text-kameleon-text-muted">Kameleon · Chapter 1</p>
        <h1 className="mt-0.5 font-display text-lg font-semibold uppercase leading-tight tracking-wide text-kameleon-copper-light">
          Where will the night take you?
        </h1>
        <p className="mt-0.5 text-xs text-kameleon-text-muted">Choose a world. Your decision shapes what happens next.</p>
      </div>

      {/* Four compact horizontal cards. Rows use 1fr (no minimum), so the
          grid always shrink-to-fits the space actually left between the
          header and the footer nav — never a scroll container, even on the
          shortest tested viewport. Each card's own max-h caps growth on
          taller screens (target ~90-125px) instead of a row-level floor,
          which would force overflow instead of shrinking. */}
      <div className="grid min-h-0 flex-1 grid-rows-4 content-center gap-1.5 py-1.5">
        {kameleonPathways.map((pathway, index) => {
          const root = getNode(pathway.rootNodeId);
          const Icon = motifIcon[pathway.motif];
          return (
            <button
              key={pathway.id}
              type="button"
              onClick={() => {
                playKameleonSound("pathwaySelected");
                onSelect(pathway.id);
              }}
              className={cn(
                "grid h-full max-h-32 min-w-0 grid-cols-[minmax(105px,42%)_1fr] self-center overflow-hidden rounded-2xl border bg-kameleon-surface text-left transition-colors",
                pathway.accent === "red" ? "border-l-4 border-l-kameleon-red" : "border-l-4 border-l-kameleon-blue",
                "border-kameleon-border hover:border-kameleon-copper/60",
              )}
            >
              {/* Landscape thumbnail — the dedicated pathway-card crop, not a square icon. */}
              <EnvironmentArt
                motif={pathway.motif}
                className="h-full w-full"
                priority={index === 0}
                thumbnailKind="pathway-card"
                gradientOverlay={false}
              />
              <div className="flex min-w-0 items-center justify-between gap-2 px-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 shrink-0 text-kameleon-copper-light" />
                    <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-kameleon-text">
                      {pathway.label}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-kameleon-text-muted">{pathway.subtitle}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-widest text-kameleon-text-muted">
                    {root ? Math.round(root.duration / 60) : 4} min · 360°
                  </p>
                </div>
                <span aria-hidden="true" className="shrink-0 text-lg text-kameleon-copper-light">
                  →
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onViewMap}
        className="shrink-0 text-center text-xs font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
      >
        View your path
      </button>

      <nav
        aria-label="Kameleon sections"
        className="mt-1.5 flex shrink-0 justify-around border-t border-kameleon-border pt-1.5 text-[11px] text-kameleon-text-muted"
      >
        <span className="flex flex-col items-center gap-1 text-kameleon-red">
          <span className="h-2 w-2 rounded-full bg-kameleon-red" />
          Journey
        </span>
        <span className="flex flex-col items-center gap-1">Paths</span>
        <span className="flex flex-col items-center gap-1">Profile</span>
      </nav>
    </div>
  );
}
