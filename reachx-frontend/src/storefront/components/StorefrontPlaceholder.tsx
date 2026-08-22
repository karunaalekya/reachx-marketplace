import type { LucideIcon } from "lucide-react";

interface StorefrontPlaceholderProps {
  icon: LucideIcon;
  label: string;
  sessionNote: string;
}

export function StorefrontPlaceholder({ icon: Icon, label, sessionNote }: StorefrontPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
      <Icon size={32} className="text-brand-indigo/30" aria-hidden="true" />
      <p className="font-display text-lg text-brand-indigo">{label}</p>
      <p className="max-w-sm text-sm opacity-60">{sessionNote}</p>
    </div>
  );
}
