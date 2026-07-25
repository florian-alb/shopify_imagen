import { useEffect, useRef } from "react";
import { isEditableShortcutTarget } from "./lib";
import type { RetouchTool } from "./types";

export function useRetouchKeyboard({
  canRedo,
  canUndo,
  enabled,
  redo,
  resizeBrush,
  setBrushOpacity,
  setTool,
  setZoom,
  tool,
  undo,
  updateZoom,
}: {
  canRedo: boolean;
  canUndo: boolean;
  enabled: boolean;
  redo: () => void;
  resizeBrush: (delta: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setTool: (tool: RetouchTool) => void;
  setZoom: (zoom: number) => void;
  tool: RetouchTool;
  undo: () => void;
  updateZoom: (delta: number) => void;
}) {
  const temporaryHandToolRef = useRef<RetouchTool | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat && tool !== "hand") {
          temporaryHandToolRef.current = tool;
          setTool("hand");
        }
        return;
      }

      if (hasCommandModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) redo();
        } else if (canUndo) {
          undo();
        }
        return;
      }

      if (hasCommandModifier && key === "y") {
        event.preventDefault();
        if (canRedo) redo();
        return;
      }

      if (hasCommandModifier && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        updateZoom(0.15);
        return;
      }

      if (hasCommandModifier && event.key === "-") {
        event.preventDefault();
        updateZoom(-0.15);
        return;
      }

      if (hasCommandModifier && event.key === "0") {
        event.preventDefault();
        setZoom(1);
        return;
      }

      if (hasCommandModifier || event.altKey) return;

      if (event.key === "[") {
        event.preventDefault();
        resizeBrush(event.shiftKey ? -10 : -4);
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        resizeBrush(event.shiftKey ? 10 : 4);
        return;
      }

      if (!event.shiftKey && key === "b") {
        event.preventDefault();
        setTool("brush");
        return;
      }

      if (!event.shiftKey && key === "i") {
        event.preventDefault();
        setTool("picker");
        return;
      }

      if (!event.shiftKey && key === "h") {
        event.preventDefault();
        setTool("hand");
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        setBrushOpacity(event.key === "0" ? 100 : Number(event.key) * 10);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableShortcutTarget(event.target)) {
        return;
      }

      const previousTool = temporaryHandToolRef.current;
      if (!previousTool) return;

      event.preventDefault();
      temporaryHandToolRef.current = null;
      setTool(previousTool);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      temporaryHandToolRef.current = null;
    };
  }, [
    canRedo,
    canUndo,
    enabled,
    redo,
    resizeBrush,
    setBrushOpacity,
    setTool,
    setZoom,
    tool,
    undo,
    updateZoom,
  ]);
}
