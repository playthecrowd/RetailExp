"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CopyIcon } from "./icons";

/**
 * Copies the fully-qualified customer-facing URL, built from the current
 * origin at click time so nothing is hardcoded to a dev port or a specific
 * deployment host.
 */
export function CopyUrlButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleCopy}>
      <CopyIcon className="h-4 w-4" />
      {copied ? "Copied!" : "Copy URL"}
    </Button>
  );
}
