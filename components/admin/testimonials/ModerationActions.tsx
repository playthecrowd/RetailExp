"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, Select, Textarea } from "@/components/ui/form";
import {
  approveSubmissionAction,
  rejectSubmissionAction,
  removeSubmissionAction,
} from "@/app/admin/(protected)/clients/kameleon/testimonials/actions";
import { IDLE_MODERATION_STATE } from "@/lib/testimonials/moderation-state";
import {
  REJECTION_REASONS,
  IMMEDIATE_PURGE_REASONS,
  MAX_MODERATION_NOTE_LENGTH,
} from "@/lib/testimonials/rejection-reasons";
import type { ModerationItem } from "@/lib/testimonials/moderation";

/**
 * Approve, Reject and Remove, each behind a confirmation step.
 *
 * Approval is NOT single-click: it publishes someone else's face to a public
 * gallery, and the dialog says so before the moderator commits. Rejection
 * requires a reason from the server-enforced allow-list.
 *
 * REMOVE IS THE ONLY WAY BACK. There is no publication kill switch by design,
 * so an approved item is live until somebody removes it individually. It is
 * also the mechanism for honouring a takedown request, which is why two of its
 * reasons shorten the retention window to immediate.
 *
 * Nothing here decides anything. The submission id is the only value sent, and
 * the Server Action re-authorizes, re-validates and re-checks the reason. No
 * client id, experience id, reviewer id or provider identifier appears in this
 * component's props or its form fields — the DTO cannot carry them.
 */

function Dialog({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Escape closes, and focus moves into the dialog so a keyboard user is not
    // left tabbing through the page behind it.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLElement>("select, textarea, button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-md rounded-xl border border-admin-border bg-admin-surface p-5 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

export function ModerationActions({ item }: { item: ModerationItem }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveSubmissionAction,
    IDLE_MODERATION_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectSubmissionAction,
    IDLE_MODERATION_STATE,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeSubmissionAction,
    IDLE_MODERATION_STATE,
  );

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  // Dialog visibility is DERIVED, not synchronised in an effect: a success
  // closes the dialog because the decision is made, and the buttons disappear
  // with it. Writing this as setState-inside-useEffect would introduce an
  // extra render pass and a window where a confirmed decision still shows its
  // confirmation dialog.
  const approveDialogOpen = approveOpen && approveState.status !== "success";
  const rejectDialogOpen = rejectOpen && rejectState.status !== "success";
  const removeDialogOpen = removeOpen && removeState.status !== "success";

  const feedback =
    approveState.status !== "idle"
      ? approveState
      : rejectState.status !== "idle"
        ? rejectState
        : removeState.status !== "idle"
          ? removeState
          : null;

  // Only a pending submission can be approved or rejected — the database
  // enforces the same transitions, so this hides controls that would fail.
  // A local success also disarms the controls immediately, rather than leaving
  // a live Approve button on a card whose decision has already been recorded
  // but whose revalidated data has not arrived yet.
  const actionable =
    item.moderationStatus === "pending" &&
    approveState.status !== "success" &&
    rejectState.status !== "success";

  // The database refuses approval while delivery_ready_at is null, so offering
  // the button would be inviting a moderator to perform an action guaranteed
  // to fail. Rejection has no such requirement and stays available — a
  // submission that will never be publishable is exactly one a moderator may
  // want to reject now.
  //
  // This is a courtesy, not a control: the Server Action reads no readiness
  // value from the browser and the database re-checks regardless.
  const canApprove = item.deliveryReady;

  // approved -> removed and rejected -> removed are the only legal removals;
  // pending -> removed is not, and the database refuses it. A pending item is
  // withdrawn by rejecting it, which reaches the same purge.
  const removable =
    (item.moderationStatus === "approved" || item.moderationStatus === "rejected") &&
    removeState.status !== "success";

  return (
    <div className="flex flex-col gap-2">
      {actionable && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setApproveOpen(true)}
              disabled={!canApprove || approvePending || rejectPending}
              aria-describedby={!canApprove ? `approve-blocked-${item.submissionId}` : undefined}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={approvePending || rejectPending}
            >
              Reject
            </Button>
          </div>
          {!canApprove && (
            <p id={`approve-blocked-${item.submissionId}`} className="text-xs text-admin-text-muted">
              Approval is unavailable until the media finishes processing and a delivery
              version is ready. You can still reject it.
            </p>
          )}
        </div>
      )}

      {removable && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setRemoveOpen(true)}
            disabled={removePending}
          >
            Remove
          </Button>
        </div>
      )}

      {feedback?.message && (
        <p
          role="status"
          className={
            feedback.status === "success"
              ? "text-sm text-admin-text-muted"
              : "rounded-md bg-admin-danger-bg px-2.5 py-1.5 text-sm text-admin-danger"
          }
        >
          {feedback.message}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveOpen(false)} labelledBy="approve-title">
        <h2 id="approve-title" className="text-base font-semibold">
          Approve this submission?
        </h2>
        <p className="mt-2 text-sm text-admin-text-muted">
          Approving makes it eligible for the public Kameleon Gallery. It appears there
          once every delivery requirement is satisfied — it is not published instantly.
        </p>

        <form action={approveAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="submissionId" value={item.submissionId} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`approve-note-${item.submissionId}`}>
              Moderation note <span className="text-admin-text-muted">(optional)</span>
            </Label>
            <Textarea
              id={`approve-note-${item.submissionId}`}
              name="moderationNote"
              rows={2}
              maxLength={MAX_MODERATION_NOTE_LENGTH}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={approvePending}>
              {approvePending ? "Approving…" : "Confirm approval"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectOpen(false)} labelledBy="reject-title">
        <h2 id="reject-title" className="text-base font-semibold">
          Reject this submission?
        </h2>
        <p className="mt-2 text-sm text-admin-text-muted">
          It will never reach the Gallery. The media is retained privately for 30 days as
          an audit record, then deleted at the provider. A rejected submission cannot
          later be approved.
        </p>

        <form action={rejectAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="submissionId" value={item.submissionId} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-reason-${item.submissionId}`}>Reason (required)</Label>
            <Select id={`reject-reason-${item.submissionId}`} name="rejectionReason" required defaultValue="">
              <option value="" disabled>
                Choose a reason…
              </option>
              {REJECTION_REASONS.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-note-${item.submissionId}`}>
              Moderation note <span className="text-admin-text-muted">(optional)</span>
            </Label>
            <Textarea
              id={`reject-note-${item.submissionId}`}
              name="moderationNote"
              rows={2}
              maxLength={MAX_MODERATION_NOTE_LENGTH}
            />
          </div>

          {rejectState.status === "error" && rejectState.message && (
            <p role="alert" className="rounded-md bg-admin-danger-bg px-2.5 py-1.5 text-sm text-admin-danger">
              {rejectState.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="destructive" loading={rejectPending}>
              {rejectPending ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      <Dialog open={removeDialogOpen} onClose={() => setRemoveOpen(false)} labelledBy="remove-title">
        <h2 id="remove-title" className="text-base font-semibold">
          Remove this submission?
        </h2>
        <p className="mt-2 text-sm text-admin-text-muted">
          It leaves the Gallery immediately. Its media is deleted at the provider within
          30 days — or on the next sweep if you choose one of the two reasons marked
          below. Removal cannot be undone.
        </p>

        <form action={removeAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="submissionId" value={item.submissionId} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`remove-reason-${item.submissionId}`}>Reason (required)</Label>
            <Select id={`remove-reason-${item.submissionId}`} name="rejectionReason" required defaultValue="">
              <option value="" disabled>
                Choose a reason…
              </option>
              {REJECTION_REASONS.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.label}
                  {(IMMEDIATE_PURGE_REASONS as readonly string[]).includes(reason.id)
                    ? " — deletes immediately"
                    : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`remove-note-${item.submissionId}`}>
              Moderation note <span className="text-admin-text-muted">(optional)</span>
            </Label>
            {/* Internal only, retained indefinitely. A takedown request should be
                referenced by ticket, never by pasting the requester's contact
                details into a field that outlives the media. */}
            <Textarea
              id={`remove-note-${item.submissionId}`}
              name="moderationNote"
              rows={2}
              maxLength={MAX_MODERATION_NOTE_LENGTH}
              placeholder="Internal reference only — no contact details"
            />
          </div>

          {removeState.status === "error" && removeState.message && (
            <p role="alert" className="rounded-md bg-admin-danger-bg px-2.5 py-1.5 text-sm text-admin-danger">
              {removeState.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="destructive" loading={removePending}>
              {removePending ? "Removing…" : "Confirm removal"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
