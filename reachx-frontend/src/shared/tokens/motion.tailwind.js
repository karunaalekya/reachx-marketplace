// Partial config - merge into tailwind.config.js's `theme.extend` alongside the existing
// brand/feedback/surface/tint token blocks. Two things this fixes relative to the last proposal:
//
// 1. Durations were written in seconds where milliseconds were meant (`250s` instead of `250ms`)
//    - as shipped that's a 4-minute accordion animation. Fixed below.
// 2. Reduced motion isn't a separate hand-rolled policy layer - Tailwind already ships
//    `motion-safe:` / `motion-reduce:` variants that read `prefers-reduced-motion` for you.
//    Apply animation classes as `motion-safe:animate-toast-slide-in` at the call site and add
//    a static `motion-reduce:opacity-100` fallback; no JS/media-query plumbing needed. This file
//    only defines the animations - the reduced-motion behavior is a per-usage class choice.
//
// No new dependency introduced (earlier draft referenced a Radix CSS var for an accordion
// component that isn't part of this stack - dropped here; add it back only if Radix is
// actually installed).
//
// Session 2 addition: `shell-reveal`, the one page-load choreography (shell -> header -> KPI/
// card stagger) defined once here and reused as-is by src/shared/components/StaggerReveal.tsx
// on every page, per PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3i - "repetition is the point,
// don't redesign this per page." Plain CSS keyframe, not Framer Motion: the Framer Motion
// decision in 3f scoped it to interactive/gesture moments (drawer slide-in, badge press) and
// kept "basic fades and loading states" on plain Tailwind/CSS - a page-load reveal is a loading
// state, not a gesture.

module.exports.motion = {
  transitionDuration: {
    150: "150ms", // standard interactive triggers (buttons, badges)
    300: "300ms", // layout expansions (rejection-reason drawer)
  },
  animation: {
    "toast-slide-in": "toastIn 300ms cubic-bezier(0.16, 1, 0.3, 1)",
    "shell-reveal": "shellReveal 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
  },
  keyframes: {
    toastIn: {
      from: { transform: "translateX(120%)", opacity: "0" },
      to: { transform: "translateX(0)", opacity: "1" },
    },
    shellReveal: {
      from: { opacity: "0", transform: "translateY(6px)" },
      to: { opacity: "1", transform: "translateY(0)" },
    },
  },
};
