import { useCallback, useRef, useState, type RefObject } from "react";
import type { CanvasSnapshot, ImageSize } from "./types";

const HISTORY_LIMIT = 12;

export function useCanvasHistory({
  canvasRef,
  onError,
  onImageSizeChange,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onError: (message: string) => void;
  onImageSizeChange: (size: ImageSize) => void;
}) {
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    pastCount: 0,
    futureCount: 0,
  });

  const syncHistoryState = useCallback(() => {
    const next = {
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
      pastCount: undoStackRef.current.length,
      futureCount: redoStackRef.current.length,
    };

    setHistoryState((current) =>
      current.canUndo === next.canUndo &&
      current.canRedo === next.canRedo &&
      current.pastCount === next.pastCount &&
      current.futureCount === next.futureCount
        ? current
        : next,
    );
  }, []);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const captureSnapshot = useCallback((): CanvasSnapshot | null => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return null;

    return {
      imageData: context.getImageData(0, 0, canvas.width, canvas.height),
      width: canvas.width,
      height: canvas.height,
    };
  }, [canvasRef]);

  const pushHistory = useCallback(() => {
    try {
      const snapshot = captureSnapshot();
      if (!snapshot) return;

      undoStackRef.current = [...undoStackRef.current, snapshot].slice(
        -HISTORY_LIMIT,
      );
      redoStackRef.current = [];
      syncHistoryState();
    } catch {
      onError("Cette image ne permet pas la retouche dans le navigateur.");
    }
  }, [captureSnapshot, onError, syncHistoryState]);

  const restoreSnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = snapshot.width;
      canvas.height = snapshot.height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.putImageData(snapshot.imageData, 0, 0);
      onImageSizeChange({ width: snapshot.width, height: snapshot.height });
    },
    [canvasRef, onImageSizeChange],
  );

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    const current = captureSnapshot();
    if (!current || !previous) return;

    redoStackRef.current.push(current);
    restoreSnapshot(previous);
    syncHistoryState();
  }, [captureSnapshot, restoreSnapshot, syncHistoryState]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    const current = captureSnapshot();
    if (!current || !next) return;

    undoStackRef.current.push(current);
    restoreSnapshot(next);
    syncHistoryState();
  }, [captureSnapshot, restoreSnapshot, syncHistoryState]);

  return {
    historyState,
    pushHistory,
    redo,
    resetHistory,
    restoreSnapshot,
    undo,
  };
}
