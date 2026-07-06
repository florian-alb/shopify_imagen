import type { Id } from "../../../convex/_generated/dataModel";

export type RetouchTarget = {
  id: Id<"generatedImages">;
  url: string;
  label: string;
};

export type RetouchSaveMode = "version" | "overwrite";

export type RetouchTool = "brush" | "picker" | "hand";

export type CanvasTransform =
  | "rotateClockwise"
  | "flipHorizontal"
  | "flipVertical";

export type Point = {
  x: number;
  y: number;
};

export type ImageSize = {
  width: number;
  height: number;
};

export type BrushPreview = {
  x: number;
  y: number;
  size: number;
  visible: boolean;
};

export type CanvasSnapshot = {
  imageData: ImageData;
  width: number;
  height: number;
};

export type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

export type ToolbarDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};
