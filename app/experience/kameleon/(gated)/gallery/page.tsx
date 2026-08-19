import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { loadGallery } from "@/lib/testimonials/gallery";

/**
 * The stakeholder Gallery.
 *
 * Minimal on purpose: a grid of approved submissions with their captions. It
 * exists so approved media is actually visible to the people evaluating it —
 * without it, approval would be a state change nobody could see the result of.
 *
 * Inside the (gated) route group, so the access gate has already run. Dynamic,
 * because every media URL is signed per request and short-lived — caching this
 * page would cache bearer credentials, which is exactly what
 * lib/testimonials/delivery.ts exists to prevent.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kameleon — Gallery",
  robots: { index: false, follow: false },
};

export default async function GalleryPage() {
  const entries = await loadGallery();

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-kameleon-text/60">
          Stakeholder evaluation
        </p>
        <h1 className="font-[family-name:var(--font-kameleon-display)] text-3xl">
          Gallery
        </h1>
        <p className="mx-auto max-w-sm text-sm text-kameleon-text/70">
          Stories shared by people who have been through the experience, shown here
          after review.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-kameleon-text/70">Nothing has been approved yet.</p>
          <p className="max-w-xs text-xs text-kameleon-text/50">
            Approved stories appear here once their media has finished processing.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {entries.map((entry) => (
            <li
              key={entry.submissionId}
              className="flex flex-col gap-2 overflow-hidden rounded-xl border border-kameleon-text/15"
            >
              <div className="bg-black">
                {entry.mediaType === "video" ? (
                  <video
                    src={entry.mediaUrl}
                    poster={entry.posterUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-square w-full object-contain"
                  />
                ) : (
                  // Plain <img>, not next/image: the optimizer would fetch and
                  // CACHE this URL server-side, and a signed delivery URL is a
                  // bearer credential for its lifetime.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.mediaUrl}
                    alt={entry.caption ?? "A story shared by a visitor"}
                    className="aspect-square w-full object-cover"
                  />
                )}
              </div>

              {entry.caption && (
                <p className="px-3 pb-3 text-sm text-kameleon-text/85">{entry.caption}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-center pt-2">
        <LinkButton href="/experience/kameleon">Back to the experience</LinkButton>
      </div>
    </main>
  );
}
