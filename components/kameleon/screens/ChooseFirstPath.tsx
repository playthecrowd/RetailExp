import { kameleonPathways, getNode } from "@/lib/kameleon/live-content";
import { cn } from "@/lib/cn";
import { playKameleonSound } from "@/lib/kameleon/sound";

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
        <p className="text-[11px] uppercase tracking-widest text-kameleon-text-muted">
          Four Different Lives. Four Pathways.
        </p>
        <h1 className="mt-0.5 font-display text-lg font-semibold uppercase leading-tight tracking-wide text-kameleon-copper-light">
          Whose Journey Will You Follow?
        </h1>
      </div>

      {/* 2x2 grid — each card's real approved photo as the thumbnail, name
          and career as live UI text (never baked into the image). Grid rows
          use 1fr so this always shrink-to-fits the space between header and
          footer nav instead of introducing a scrollbar. */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 content-center gap-2 py-2">
        {kameleonPathways.map((pathway, index) => {
          const root = getNode(pathway.rootNodeId);
          const posterSrc = root?.posterSource ?? "";
          return (
            <button
              key={pathway.id}
              type="button"
              onClick={() => {
                playKameleonSound("pathwaySelected");
                onSelect(pathway.id);
              }}
              className={cn(
                "group relative flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-kameleon-surface text-left transition-colors",
                pathway.accent === "red" ? "border-t-4 border-t-kameleon-red" : "border-t-4 border-t-kameleon-blue",
                "border-kameleon-border hover:border-kameleon-copper/60",
              )}
            >
              {posterSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={posterSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  loading={index === 0 ? "eager" : "lazy"}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

              <div className="relative mt-auto flex flex-col gap-0.5 p-2.5">
                <p className="font-display text-base font-semibold uppercase tracking-wide text-white">
                  {pathway.label}
                </p>
                <p className="truncate text-[11px] text-white/75">{pathway.subtitle}</p>
                <p className="truncate text-[10px] uppercase tracking-widest text-kameleon-copper-light">
                  {pathway.description}
                </p>
                <span
                  aria-hidden="true"
                  className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-white/30 bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
                >
                  Choose {pathway.label} →
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
