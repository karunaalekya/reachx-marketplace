// Skeleton, not a full-page spinner - per the plan's production-UX baseline. Uses the
// skeleton-shimmer animation merged into tailwind.config.js this session (was held at
// interaction.tailwind.js pending a real surface - this grid is that surface).
interface ProductGridSkeletonProps {
  count?: number;
}

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-brand-indigo/10 bg-white">
      <div
        className="aspect-square w-full bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted
          bg-[length:200%_100%] motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60"
        aria-hidden="true"
      />
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
        <div className="h-3 w-1/2 rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
        <div className="h-4 w-1/3 rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: ProductGridSkeletonProps) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
      role="status"
      aria-label="Loading products"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
