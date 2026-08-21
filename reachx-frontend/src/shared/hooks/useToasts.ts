import { useCallback, useState } from "react";

// Deliberately minimal: an array of active toasts a component can render with OperationToast.
// This is NOT the global notification-center/toast-stacking system floated in later design
// discussion (top-right stack, newest-first, persistent notification center) - that's real new
// scope with its own open questions (where does it live in the tree? one instance app-wide or
// per-page?) and hasn't been decided. This hook only does what Session 1 actually needs: let
// KycVerificationPanel show a toast after an upload succeeds or fails.

export type ToastVariant = "neem" | "chilli" | "saffron";

export interface ActiveToast {
  id: string;
  variant: ToastVariant;
  message: string;
  subText?: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const pushToast = useCallback(
    (variant: ToastVariant, message: string, subText?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Replaces, doesn't append: OperationToast renders at a fixed bottom-5/right-5 position
      // with no per-instance offset, so two at once would render exactly on top of each other.
      // A real stacking system (top-right, newest-first, vertical offset per toast) is a
      // separate, undecided piece of scope - not invented here as a side effect of this wiring.
      setToasts([{ id, variant, message, subText }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return { toasts, pushToast, dismissToast };
}
