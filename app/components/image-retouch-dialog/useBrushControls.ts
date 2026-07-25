import { useCallback, useState } from "react";
import {
  clamp,
  isValidHexColor,
  normalizeHexInput,
  parseControlNumber,
} from "./lib";

export function useBrushControls() {
  const [brushColor, setBrushColor] = useState("#FFFFFF");
  const [brushColorInput, setBrushColorInput] = useState("#FFFFFF");
  const [brushSize, setBrushSize] = useState(60);
  const [brushOpacity, setBrushOpacity] = useState(100);

  const commitBrushColor = useCallback((nextColor: string) => {
    const normalized = normalizeHexInput(nextColor);
    if (!isValidHexColor(normalized)) return;
    setBrushColor(normalized);
    setBrushColorInput(normalized);
  }, []);

  const updateBrushColorFromInput = useCallback((nextColor: string) => {
    const normalized = normalizeHexInput(nextColor);
    setBrushColorInput(normalized);
    if (isValidHexColor(normalized)) {
      setBrushColor(normalized);
    }
  }, []);

  const resetBrushColorInput = useCallback(() => {
    setBrushColorInput(brushColor);
  }, [brushColor]);

  const resizeBrush = useCallback((delta: number) => {
    setBrushSize((value) => clamp(value + delta, 4, 500));
  }, []);

  const resizeBrushOpacity = useCallback((delta: number) => {
    setBrushOpacity((value) => clamp(value + delta, 10, 100));
  }, []);

  const updateBrushSizeFromInput = useCallback((value: string) => {
    const parsed = parseControlNumber(value);
    if (parsed === null) return;
    setBrushSize(clamp(parsed, 4, 140));
  }, []);

  const updateBrushOpacityFromInput = useCallback((value: string) => {
    const parsed = parseControlNumber(value);
    if (parsed === null) return;
    setBrushOpacity(clamp(parsed, 10, 100));
  }, []);

  return {
    brushColor,
    brushColorInput,
    brushOpacity,
    brushSize,
    commitBrushColor,
    resetBrushColorInput,
    resizeBrush,
    resizeBrushOpacity,
    setBrushOpacity,
    updateBrushColorFromInput,
    updateBrushOpacityFromInput,
    updateBrushSizeFromInput,
  };
}
