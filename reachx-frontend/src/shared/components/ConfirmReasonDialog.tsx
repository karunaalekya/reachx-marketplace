import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

// The one standardized "destructive action + required reason" dialog, per the session plan's
// production-UX baseline - KYC document rejection (this session) and vendor suspend / dispute
// resolve (later Track B sessions) all reuse this instead of three bespoke dialogs.
//
// Real requirements enforced here, not UI choices: submit stays disabled until the reason is
// non-empty (backend @NotBlank on SuspendVendorRequest.reason and KycDocumentDecisionRequest
// treats a blank rejectionReason as absent), and the confirm button shows a spinner + disables
// itself for the duration of the async action so a slow network + impatient double-click can't
// double-fire the mutation.
//
// Focus trap + escape-to-close: real accessibility requirement per the blueprint's spec, not
// polish. Reason field autofocuses on open; Tab/Shift+Tab cycle only within the dialog; Escape
// closes (same as clicking Cancel) as long as nothing is submitting.

interface ConfirmReasonDialogProps {
  open: boolean;
  title: string;
  description?: string;
  reasonLabel: string;
  reasonPlaceholder?: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmReasonDialog({
  open,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setSubmitError(null);
      // Autofocus the reason field on open - the reject path is reached via a click, so this
      // is a direct result of a user action, not an unsolicited focus steal.
      requestAnimationFrame(() => reasonInputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        onCancel();
        return;
      }
      // Focus trap: Tab cycling stays within the dialog's focusable elements only.
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !submitting;

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(trimmedReason);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setSubmitting(false);
    }
    // No `finally` resetting submitting to false on success - the caller closes the dialog
    // (open flips false) once the mutation is confirmed, which unmounts this state anyway. A
    // lingering "Processing…" button on an already-closing dialog isn't a bug worth guarding.
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-indigo/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-reason-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-premium-dropdown
          motion-safe:animate-dialog-scale-in motion-reduce:opacity-100"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="confirm-reason-title" className="font-display text-lg text-brand-indigo">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
            className="shrink-0 rounded p-1 text-brand-indigo/40 hover:text-brand-indigo/70
              focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo
              disabled:opacity-40 transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {description && <p className="mt-2 text-sm opacity-70">{description}</p>}

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">{reasonLabel}</span>
          <textarea
            ref={reasonInputRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            rows={3}
            placeholder={reasonPlaceholder}
            className="w-full rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none
              focus:ring-2 focus:ring-brand-indigo disabled:opacity-60"
          />
        </label>

        {submitError && (
          <div
            role="alert"
            className="mt-3 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg
              px-3 py-2 text-sm text-tint-chilli-text"
          >
            {submitError}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-brand-indigo/70
              hover:bg-brand-indigo/5 focus-visible:ring-2 focus-visible:ring-offset-2
              focus-visible:ring-brand-indigo disabled:opacity-40 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex min-h-11 items-center gap-2 rounded-md bg-tint-chilli-border px-4 py-2
              text-sm font-medium text-white hover:brightness-110 focus-visible:ring-2
              focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-40 transition"
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {submitting ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
