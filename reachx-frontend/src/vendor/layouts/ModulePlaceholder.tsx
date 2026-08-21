import type { LucideIcon } from "lucide-react";

interface ModulePlaceholderProps {
  icon: LucideIcon;
  label: string;
  sessionNote: string;
}

// Nav item exists (real backend endpoint behind it, per the sidebar/IA decision in
// PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3g) but the screen itself isn't built this session -
// this renders that honestly instead of a fake table with placeholder rows.
export function ModulePlaceholder({ icon: Icon, label, sessionNote }: ModulePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
      <Icon size={32} className="text-brand-indigo/30" aria-hidden="true" />
      <p className="font-display text-lg text-brand-indigo">{label}</p>
      <p className="max-w-sm text-sm opacity-60">{sessionNote}</p>
    </div>
  );
}
