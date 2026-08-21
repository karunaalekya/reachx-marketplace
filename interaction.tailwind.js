// Partial config - NOT merged into tailwind.config.js yet. Proposed for the next frontend
// session (storefront + admin console build), same pattern as motion.tailwind.js and
// premium-depth.tailwind.js: documented reasoning, held until real surfaces exist to apply it
// to, then merged deliberately - not applied speculatively.
//
// Nothing here touches brand/tint/surface color tokens, typography, or the locked
// StatusBadge/InteractiveBadge split - purely new interaction/motion primitives for surfaces
// that don't exist yet (storefront product cards, order-status stepper, toast stack).

module.exports.interaction = {
  animation: {
    // Shared shimmer sweep for skeleton loaders - one definition reused by every panel
    // (KYC, Orders, Payouts, storefront grid) instead of each component inventing its own,
    // per the same "repetition is the point" reasoning StaggerReveal already documents.
    "skeleton-shimmer": "skeletonShimmer 1.6s ease-in-out infinite",
    // Single pulse for a cart-badge count bump on add-to-cart, once the storefront exists.
    "badge-pulse": "badgePulse 400ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  keyframes: {
    skeletonShimmer: {
      "0%": { backgroundPosition: "-200% 0" },
      "100%": { backgroundPosition: "200% 0" },
    },
    badgePulse: {
      "0%": { transform: "scale(1)" },
      "40%": { transform: "scale(1.25)" },
      "100%": { transform: "scale(1)" },
    },
  },
};

// Usage notes for the next session, not enforced here:
//
// 1. Toast stacking (closes the real gap FRONTEND_STATE.md already flags - OperationToast's
//    fixed position can't show more than one at a time): this needs a <ToastStack> container
//    component that renders each active OperationToast with a `translate-y-[{index * 72}px]`
//    offset, not a new animation token - the slide-in animation itself (motion.tailwind.js's
//    toast-slide-in) is already correct and should be reused as-is.
//
// 2. Card hover lift for storefront product cards, once built:
//      className="transition hover:-translate-y-0.5 hover:shadow-premium-hover"
//    Reuses the existing shadow-premium-hover token (premium-depth.tailwind.js) - already
//    defined, currently unused anywhere in the codebase.
//
// 3. Order-status stepper: a connected-dot progress component for OrderStatus/ShipmentStatus,
//    NOT a new animation - this is a layout/SVG component decision for whoever builds
//    OrdersPanel's next pass, not a token.
//
// 4. Skeleton shimmer usage:
//      className="motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60
//                 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted
//                 bg-[length:200%_100%]"
//    Same motion-safe/motion-reduce discipline as every other animation in this project.
