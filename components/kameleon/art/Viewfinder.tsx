/**
 * Circular "camera preview" composition for screen 03 — a bottle scene
 * inside a corner-bracket viewfinder ring, standing in for what the camera
 * will see once permission is granted. Uses the real approved KAMELEON
 * bottle photo (the Director's Edit commercial's own clean bottle hero
 * frame — same asset already used as PP-FINAL's poster), not a vector
 * silhouette.
 */
export function Viewfinder({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative mx-auto flex h-56 w-56 items-center justify-center overflow-hidden rounded-full border-2 border-kameleon-copper bg-gradient-to-br from-kameleon-blue/20 via-kameleon-surface to-kameleon-red/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/kameleon/ar/kameleon-bottle.png"
          alt="KAMELEON bottle"
          className="h-[92%] w-[92%] object-contain"
        />
        {/* corner brackets */}
        {[
          "left-4 top-4 border-l-2 border-t-2",
          "right-4 top-4 border-r-2 border-t-2",
          "left-4 bottom-4 border-l-2 border-b-2",
          "right-4 bottom-4 border-r-2 border-b-2",
        ].map((pos) => (
          <span key={pos} className={`absolute h-5 w-5 border-kameleon-copper ${pos}`} aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}
