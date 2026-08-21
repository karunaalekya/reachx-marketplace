// Real, merged tailwind.config.js - Session 1 scaffold work.
//
// This merges the three previously-scattered fragments (tint-colors.tailwind.js,
// motion.tailwind.js) that lived under src/shared/tokens/ into one real config the build
// actually reads. premium-depth.tailwind.js is deliberately NOT merged here yet - see the
// note at the bottom of this file for why, and don't merge it early.
//
// brand.indigo / brand.saffron: REAL, client-confirmed, LOCKED (Raj confirmed #1E254C over the
// earlier #10142D pass on 2026-08-21 - most recent explicit client brief, already wired/verified,
// no further flip on this pending). indigo #1E254C - deep charcoal-navy anchor for structure/
// compliance/dense ledger reading. saffron #E05A10 - energetic true saffron/orange for actions/
// focus/selection, not pale gold.
//
// tint.neem/chilli/saffron border hex match the client's `feedback-neem`/`feedback-chilli`
// naming from their hex matrix - same colors, kept under the codebase's actual `tint.*`
// convention (what every badge/toast component imports) rather than duplicated under an unused
// second name.
//
// surface.storefront #FDFBF7 (warm muslin), surface.dashboard #FFFFFF, surface.cardMuted
// #F3F3F1 - ALL LOCKED. Full palette is now confirmed, no placeholders remaining.
const { tintColors } = require("./src/shared/tokens/tint-colors.tailwind.js");
const { motion } = require("./src/shared/tokens/motion.tailwind.js");
// Merged in Session 2: VendorDashboardShell.tsx and its card surfaces (Action Center, KYC
// panel) are the first real surfaces to exist for this, per the explicit hold note at the
// bottom of premium-depth.tailwind.js ("apply when Session 2 (shell)... actually builds those
// surfaces"). Canonical premium-card value per PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3f -
// the lighter one, not the heavier external-proposal variants that were discarded.
const { premiumDepth } = require("./src/shared/tokens/premium-depth.tailwind.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Syne: storefront display face only (not used anywhere in the vendor dashboard build).
        display: ["Syne", "sans-serif"],
        // Plus Jakarta Sans: everywhere else. Federo was explicitly dropped - do not reintroduce.
        sans: ["Plus Jakarta Sans", "sans-serif"],
      },
      colors: {
        brand: {
          saffron: "#E05A10",
          indigo: "#1E254C",
        },
        surface: {
          storefront: "#FDFBF7",
          dashboard: "#FFFFFF",
          cardMuted: "#F3F3F1",
        },
        ...tintColors,
      },
      transitionDuration: motion.transitionDuration,
      animation: motion.animation,
      keyframes: motion.keyframes,
      boxShadow: premiumDepth.boxShadow,
      transitionTimingFunction: premiumDepth.transitionTimingFunction,
    },
  },
  // Required because VerificationBadgeStack.tsx and OperationToast.tsx build class names
  // dynamically (`` `bg-tint-${variant}-bg` ``) - Tailwind's JIT compiler can only see classes
  // that appear as literal strings in source, so these would otherwise be purged from a real
  // production build. This was flagged as an unresolved risk in
  // PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3d - resolved here, verified by the build below.
  safelist: [
    {
      pattern: /^(bg|border|text)-tint-(neem|chilli|saffron|muted)-(bg|border|text)$/,
    },
  ],
  plugins: [],
};

// premium-depth.tailwind.js: merged above, this session (Session 2) - VendorDashboardShell.tsx
// and its card surfaces (Action Center, KYC panel) are now real, so shadow-premium-card/-hover/
// -dropdown have something to apply to. Applied against the real StatusBadge/InteractiveBadge,
// not a rebuilt version - see PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3c/3f.
