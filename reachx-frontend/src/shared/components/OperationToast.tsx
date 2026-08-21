import { useEffect } from "react";
import { CheckCircle2, XCircle, Bell, X } from "lucide-react";

// Variant names match the project's actual tint tokens (neem/chilli/saffron) rather than a
// separate success/alert/info vocabulary - one status naming system app-wide, same reasoning
// VerificationBadgeStack.tsx documents for its own STATUS_CONFIG map.
type ToastVariant = "neem" | "chilli" | "saffron";

interface OperationToastProps {
  id: string;
  variant: ToastVariant;
  message: string;
  subText?: string;
  onClose: (id: string) => void;
}

const VARIANT_CONFIG: Record<ToastVariant, { Icon: typeof CheckCircle2 }> = {
  neem: { Icon: CheckCircle2 },
  chilli: { Icon: XCircle },
  saffron: { Icon: Bell },
};

export function OperationToast({ id, variant, message, subText, onClose }: OperationToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 4000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const { Icon } = VARIANT_CONFIG[variant];

  return (
    <div
      role="alert"
      className={`fixed bottom-5 right-5 z-50 flex w-full max-w-sm items-start gap-3 rounded-md
        border-l-4 bg-white p-4 shadow-xl font-sans
        border-tint-${variant}-border
        motion-safe:animate-toast-slide-in motion-reduce:opacity-100`}
    >
      <Icon size={20} className={`shrink-0 mt-0.5 text-tint-${variant}-text`} aria-hidden="true" />
      <div className="flex-1 space-y-0.5">
        <p className="text-xs font-bold leading-tight text-brand-indigo">{message}</p>
        {subText && <p className="text-[11px] font-medium text-slate-400">{subText}</p>}
      </div>
      <button
        type="button"
        onClick={() => onClose(id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded text-slate-300 hover:text-slate-500
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-indigo"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
