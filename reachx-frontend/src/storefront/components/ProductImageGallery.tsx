import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

interface ProductImageGalleryProps {
  images: string[];
  productName: string;
}

export function ProductImageGallery({ images, productName }: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus-trap + Escape-to-close on the zoom dialog, per the plan's cross-cutting accessibility
  // requirement ("focus-trap on any drawer/dialog"). Minimal trap: Tab/Shift+Tab wraps within
  // the dialog's own focusable elements rather than escaping to the page behind it.
  useEffect(() => {
    if (!zoomOpen) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setZoomOpen(false);
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [zoomOpen]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-cardMuted text-sm font-medium text-slate-400">
        No image available
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setZoomOpen(true)}
        className="group relative block w-full overflow-hidden rounded-lg bg-surface-cardMuted
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
        aria-label={`Zoom in on ${productName} image ${activeIndex + 1}`}
      >
        <img
          src={images[activeIndex]}
          alt={`${productName} - view ${activeIndex + 1}`}
          className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
        />
        <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-brand-indigo shadow-premium-card">
          <ZoomIn size={16} aria-hidden="true" />
        </span>
      </button>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              aria-current={i === activeIndex}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron
                ${i === activeIndex ? "border-brand-saffron" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {zoomOpen && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} zoomed image`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-indigo/90 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomOpen(false);
          }}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Close zoomed image"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white
              hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={22} aria-hidden="true" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => (i - 1 + images.length) % images.length)}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white
                  hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4"
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => (i + 1) % images.length)}
                aria-label="Next image"
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white
                  hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-20"
              >
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            </>
          )}

          <img
            src={images[activeIndex]}
            alt={`${productName} - view ${activeIndex + 1}`}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      )}
    </div>
  );
}
