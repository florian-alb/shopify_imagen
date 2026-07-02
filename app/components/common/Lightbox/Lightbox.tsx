import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect } from "react";

import { getLightboxNextIndex } from "./navigation";
import type { LightboxState } from "./types";

export function Lightbox({
  state,
  onIndexChange,
  onClose,
}: {
  state: LightboxState;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = state !== null;
  const images = state?.images ?? [];
  const index = state?.index ?? 0;
  const current = open ? images[index] : null;
  const hasMultiple = images.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (!images.length) return;
      onIndexChange(getLightboxNextIndex(index, delta, images.length));
    },
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => !next && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 outline-none sm:p-10"
          onClick={onClose}
        >
          <DialogPrimitive.Title className="sr-only">
            {current?.label ?? "Image preview"}
          </DialogPrimitive.Title>
          {current ? (
            <img
              src={current.url}
              alt={current.label ?? "Image"}
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
          {current?.label ? (
            <span className="mt-3 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
              {current.label}
              {hasMultiple ? ` · ${index + 1} / ${images.length}` : ""}
            </span>
          ) : null}

          <DialogPrimitive.Close
            className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
            onClick={(event) => event.stopPropagation()}
          >
            <X className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {hasMultiple ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 sm:left-6"
                onClick={(event) => {
                  event.stopPropagation();
                  go(-1);
                }}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 sm:right-6"
                onClick={(event) => {
                  event.stopPropagation();
                  go(1);
                }}
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
