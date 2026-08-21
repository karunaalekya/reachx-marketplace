// Partial config - ON HOLD, not merged into tailwind.config.js yet.
//
// Pulled from an external design proposal that otherwise reintroduced problems already fixed in
// this project: a merged StatusBadge/InteractiveBadge component (regressing the accessibility
// split), wrong hex values for the tint tokens (a third drifted set, when tint-colors.tailwind.js
// exists specifically to stop that drift), and reopened locked typography (added Playfair
// Display/Inter fallbacks - not adopted). None of that is here.
//
// What *is* worth keeping: the soft depth-shadow scale and custom ease curve. Purely visual,
// doesn't touch color tokens, typography, or component structure, so it doesn't conflict with
// anything locked. Held rather than merged now because:
//   - VendorDashboardShell.tsx doesn't exist yet (that's Session 2, per the locked plan - this
//     proposal built it under a mislabeled "Session 1 Milestone Closeout").
//   - Applying shadows now with no shell/cards to attach them to has nothing to verify against.
//
// When Session 2 (shell) or Session 4 (close-out polish) actually builds those surfaces, apply
// `shadow-premium-card` to top-level containers (sidebar, header, main content panel) and
// `shadow-premium-hover` on interactive hover states - using the REAL StatusBadge/
// InteractiveBadge from shared/components/VerificationBadgeStack.tsx, not a rebuilt version.

module.exports.premiumDepth = {
  boxShadow: {
    "premium-card": "0 2px 12px -4px rgba(30, 37, 76, 0.04), 0 1px 4px -1px rgba(30, 37, 76, 0.02)",
    "premium-hover": "0 12px 24px -8px rgba(30, 37, 76, 0.08), 0 4px 12px -2px rgba(30, 37, 76, 0.03)",
    "premium-dropdown": "0 20px 32px -12px rgba(30, 37, 76, 0.12), 0 4px 14px 0 rgba(30, 37, 76, 0.04)",
  },
  transitionTimingFunction: {
    "premium-ease": "cubic-bezier(0.16, 1, 0.3, 1)",
  },
};
