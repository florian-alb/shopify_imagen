import { useCallback, useState } from "react";

import {
  getLightboxNextIndex,
  normalizeLightboxIndex,
} from "./navigation";
import type { LightboxImage, LightboxState, UseLightboxResult } from "./types";

export function useLightbox(): UseLightboxResult {
  const [state, setState] = useState<LightboxState>(null);

  const open = useCallback((images: LightboxImage[], index = 0) => {
    if (!images.length) return;
    setState({
      images,
      index: normalizeLightboxIndex(index, images.length),
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  const setIndex = useCallback((index: number) => {
    setState((current) =>
      current
        ? {
            ...current,
            index: normalizeLightboxIndex(index, current.images.length),
          }
        : current,
    );
  }, []);

  const move = useCallback((delta: number) => {
    setState((current) =>
      current
        ? {
            ...current,
            index: getLightboxNextIndex(
              current.index,
              delta,
              current.images.length,
            ),
          }
        : current,
    );
  }, []);

  return { state, open, close, setIndex, move };
}
