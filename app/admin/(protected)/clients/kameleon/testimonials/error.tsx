"use client";

import { ErrorState } from "@/components/ui/states";

/**
 * The moderation queue reads through the trusted server client, so a failure
 * here can carry infrastructure detail: a Postgres message, a column name, a
 * connection string fragment.
 *
 * None of it is rendered. The `error` prop is deliberately not destructured
 * and `error.message` is deliberately not shown — Next.js already redacts
 * server error messages in production, and relying on that alone would mean a
 * development build leaks what a production build hides. Nothing is logged
 * from here either: this runs in the browser, and a submission id, provider
 * identifier or signed URL in a console line is exactly as exposed as one on
 * the page.
 *
 * The submission UUID is never included in user-facing error copy.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-5xl">
      <ErrorState
        title="The moderation queue could not be loaded"
        message="Something went wrong reading submissions. Try again, and if it keeps happening check the server logs."
        onRetry={reset}
      />
    </div>
  );
}
