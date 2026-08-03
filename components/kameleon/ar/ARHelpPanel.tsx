"use client";

export function ARHelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="AR help"
    >
      <div className="w-full max-w-sm rounded-2xl border border-kameleon-copper/40 bg-kameleon-surface p-5">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
          AR help
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-kameleon-text-muted">
          <li>Move your phone slowly to scan the floor in front of you.</li>
          <li>Tap the screen once the copper ring appears to place the object.</li>
          <li>Walk around the object to view it from any angle.</li>
          <li>Reposition places it somewhere new; Reset clears it entirely.</li>
          <li>Exit AR or Enter the Journey at any time.</li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-kameleon-copper-light py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
