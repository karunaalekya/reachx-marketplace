import type { ReactNode } from "react";

// Fixed, literal delay classes - NOT built with a template string (`` `[animation-delay:${n}ms]` ``).
// Tailwind's JIT scanner only sees classes that appear as literal text in source; a
// template-constructed one would hit the exact purge risk already flagged and safelisted for
// once elsewhere (VerificationBadgeStack/OperationToast's dynamic tint classes). Five fixed
// slots is enough for shell -> header -> up to 3 KPI/card slots without needing a safelist entry
// for this.
const DELAY_CLASSES = [
  "motion-safe:[animation-delay:0ms]",
  "motion-safe:[animation-delay:50ms]",
  "motion-safe:[animation-delay:100ms]",
  "motion-safe:[animation-delay:150ms]",
  "motion-safe:[animation-delay:200ms]",
] as const;

interface StaggerRevealProps {
  /** Position in the reveal sequence: 0 = shell, 1 = header, 2-4 = KPI/card slots. */
  index: 0 | 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

// The one page-load choreography for this project (shell -> header -> KPI stagger, ~50ms apart,
// ~420ms total = 200ms last-slot delay + 220ms animation), defined once here per
// PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3i and reused as-is by every later page - do not
// redesign this per module, repetition is the point.
export function StaggerReveal({ index, children, className = "" }: StaggerRevealProps) {
  return (
    <div
      className={`opacity-0 motion-reduce:opacity-100 motion-safe:animate-shell-reveal ${DELAY_CLASSES[index]} ${className}`}
    >
      {children}
    </div>
  );
}
