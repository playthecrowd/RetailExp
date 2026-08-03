"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "./icons";

export function ExperiencePreviewModal({ path, label = "Preview" }: { path: string; label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Experience preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-admin-border bg-admin-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-admin-border px-4 py-3">
              <span className="text-sm font-medium">Experience preview</span>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-admin-text-muted hover:bg-admin-surface-muted"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="aspect-[9/19.5] w-full bg-black">
              <iframe src={path} title="Experience preview" className="h-full w-full border-0" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
