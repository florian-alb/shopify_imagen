import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrushSettings } from "./image-retouch-dialog/BrushSettings";
import { RetouchCanvasStage } from "./image-retouch-dialog/RetouchCanvasStage";
import { RetouchDialogFooter } from "./image-retouch-dialog/RetouchDialogFooter";
import { RetouchDialogHeader } from "./image-retouch-dialog/RetouchDialogHeader";
import { RetouchErrorAlert } from "./image-retouch-dialog/RetouchErrorAlert";
import { RetouchToolSidebar } from "./image-retouch-dialog/RetouchToolSidebar";
import { clamp } from "./image-retouch-dialog/lib";
import { useBrushControls } from "./image-retouch-dialog/useBrushControls";
import { useCanvasHistory } from "./image-retouch-dialog/useCanvasHistory";
import { useRetouchKeyboard } from "./image-retouch-dialog/useRetouchKeyboard";
import type {
  BrushPreview,
  CanvasTransform,
  ImageSize,
  PanState,
  Point,
  RetouchSaveMode,
  RetouchTarget,
  RetouchTool,
  ToolbarDragState,
} from "./image-retouch-dialog/types";
export type {
  RetouchSaveMode,
  RetouchTarget,
} from "./image-retouch-dialog/types";

type Tool = RetouchTool;

export function ImageRetouchDialog({
  target,
  saving,
  onOpenChange,
  onPrepareSource,
  onSave,
}: {
  target: RetouchTarget | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onPrepareSource?: (target: RetouchTarget) => Promise<string>;
  onSave: (
    target: RetouchTarget,
    blob: Blob,
    mode: RetouchSaveMode,
  ) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const floatingToolbarRef = useRef<HTMLDivElement | null>(null);
  const toolbarDragRef = useRef<ToolbarDragState | null>(null);
  const loadTokenRef = useRef(0);
  const panRef = useRef<PanState | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);

  const [tool, setTool] = useState<Tool>("hand");
  const [brushSettingsOpen, setBrushSettingsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [loading, setLoading] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<Point | null>(null);
  const [brushPreview, setBrushPreview] = useState<BrushPreview>({
    x: 0,
    y: 0,
    size: 0,
    visible: false,
  });
  const {
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
  } = useBrushControls();
  const { historyState, pushHistory, redo, resetHistory, undo } =
    useCanvasHistory({
      canvasRef,
      onError: setError,
      onImageSizeChange: setImageSize,
    });

  const getFitToHeightZoom = useCallback((size: ImageSize) => {
    const scrollHeight =
      scrollRef.current?.clientHeight ??
      stageRef.current?.clientHeight ??
      window.innerHeight;
    const compactPadding = window.matchMedia?.("(max-width: 900px)").matches
      ? 24
      : 40;
    const availableHeight = Math.max(120, scrollHeight - compactPadding);
    const baseDisplayHeight =
      Math.min(size.width, 1280) * (size.height / size.width);

    if (!Number.isFinite(baseDisplayHeight) || baseDisplayHeight <= 0) {
      return 1;
    }

    return clamp(availableHeight / baseDisplayHeight, 0.05, 2.4);
  }, []);

  const resetCanvas = useCallback(async () => {
    if (!target) return;

    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    setLoading(true);
    setError(null);
    setImageSize(null);
    setZoom(1);
    setTool("hand");
    setBrushSettingsOpen(false);
    setToolbarPosition(null);
    resetHistory();

    try {
      const sourceUrl = onPrepareSource
        ? await onPrepareSource(target)
        : target.url;
      if (loadTokenRef.current !== loadToken) return;

      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(
          `Image download failed with status ${response.status}.`,
        );
      }

      const imageBlob = await response.blob();
      if (!imageBlob.size) throw new Error("L'image source est vide.");

      const objectUrl = URL.createObjectURL(imageBlob);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (loadTokenRef.current !== loadToken) return;

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !context) return;

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);

        try {
          context.getImageData(0, 0, 1, 1);
        } catch {
          setError(
            "Cette image bloque encore la lecture des pixels. La source doit passer par le proxy de retouche.",
          );
        }

        const nextImageSize = {
          width: image.naturalWidth,
          height: image.naturalHeight,
        };

        setImageSize(nextImageSize);
        setZoom(getFitToHeightZoom(nextImageSize));
        setLoading(false);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (loadTokenRef.current !== loadToken) return;
        setLoading(false);
        setError("Impossible de charger cette image pour la retouche.");
      };

      image.src = objectUrl;
    } catch (loadError) {
      if (loadTokenRef.current !== loadToken) return;
      setLoading(false);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger cette image pour la retouche.",
      );
    }
  }, [getFitToHeightZoom, onPrepareSource, resetHistory, target]);

  useEffect(() => {
    if (!target) return;
    const timeoutId = window.setTimeout(resetCanvas, 0);
    return () => window.clearTimeout(timeoutId);
  }, [resetCanvas, target]);

  const canvasPoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    },
    [],
  );

  const updateBrushPreview = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || tool !== "brush" || loading || error || !imageSize) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const scaledSize = Math.max(4, brushSize * (rect.width / canvas.width));

      setBrushPreview({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        size: scaledSize,
        visible: true,
      });
    },
    [brushSize, error, imageSize, loading, tool],
  );

  const hideBrushPreview = useCallback(() => {
    setBrushPreview((current) =>
      current.visible ? { ...current, visible: false } : current,
    );
  }, []);

  const pickColor = useCallback(
    (point: Point) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !context) return;

      try {
        const pixel = context.getImageData(point.x, point.y, 1, 1).data;
        commitBrushColor(
          `#${[pixel[0], pixel[1], pixel[2]]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`,
        );
        setTool("brush");
      } catch {
        setError("La pipette ne peut pas lire les pixels de cette image.");
      }
    },
    [commitBrushColor],
  );

  const drawTo = useCallback(
    (point: Point) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      context.save();
      context.globalAlpha = brushOpacity / 100;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = brushSize;
      context.strokeStyle = brushColor;
      context.fillStyle = brushColor;

      const previous = lastPointRef.current;
      if (!previous) {
        context.beginPath();
        context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      }

      context.restore();
      lastPointRef.current = point;
    },
    [brushColor, brushOpacity, brushSize],
  );

  const applyCanvasTransform = useCallback(
    (transform: CanvasTransform) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageSize || loading || error) return;

      const source = document.createElement("canvas");
      source.width = canvas.width;
      source.height = canvas.height;
      const sourceContext = source.getContext("2d");
      if (!sourceContext) return;

      sourceContext.drawImage(canvas, 0, 0);
      pushHistory();

      const width = canvas.width;
      const height = canvas.height;

      if (transform === "rotateClockwise") {
        canvas.width = height;
        canvas.height = width;
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) return;

        context.translate(height, 0);
        context.rotate(Math.PI / 2);
        context.drawImage(source, 0, 0);
      } else {
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) return;

        context.clearRect(0, 0, width, height);
        context.save();
        if (transform === "flipHorizontal") {
          context.translate(width, 0);
          context.scale(-1, 1);
        } else {
          context.translate(0, height);
          context.scale(1, -1);
        }
        context.drawImage(source, 0, 0);
        context.restore();
      }

      setImageSize({ width: canvas.width, height: canvas.height });
      hideBrushPreview();
    },
    [error, hideBrushPreview, imageSize, loading, pushHistory],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!imageSize || loading || error) return;

    if (tool === "hand") {
      const scroll = scrollRef.current;
      if (!scroll) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: scroll.scrollLeft,
        scrollTop: scroll.scrollTop,
      };
      hideBrushPreview();
      return;
    }

    updateBrushPreview(event);
    const point = canvasPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "picker") {
      pickColor(point);
      return;
    }

    pushHistory();
    drawingRef.current = true;
    lastPointRef.current = null;
    drawTo(point);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "hand" && panRef.current?.pointerId === event.pointerId) {
      const scroll = scrollRef.current;
      if (!scroll) return;

      scroll.scrollLeft =
        panRef.current.scrollLeft - (event.clientX - panRef.current.startX);
      scroll.scrollTop =
        panRef.current.scrollTop - (event.clientY - panRef.current.startY);
      return;
    }

    updateBrushPreview(event);
    if (!drawingRef.current || tool !== "brush") return;

    const point = canvasPoint(event);
    if (point) drawTo(point);
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }

    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const save = async (mode: RetouchSaveMode) => {
    if (!target || !imageSize) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    setLocalSaving(true);
    setError(null);

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          canvas.toBlob((nextBlob) => {
            if (nextBlob) resolve(nextBlob);
            else reject(new Error("Impossible d'exporter la retouche."));
          }, "image/png");
        } catch (exportError) {
          reject(exportError);
        }
      });

      await onSave(target, blob, mode);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer la retouche.",
      );
    } finally {
      setLocalSaving(false);
    }
  };

  const updateZoom = useCallback((delta: number) => {
    setZoom((value) => clamp(value + delta, 0.35, 2.4));
  }, []);

  const clampToolbarPosition = useCallback((point: Point): Point => {
    const stage = stageRef.current;
    const toolbar = floatingToolbarRef.current;
    if (!stage || !toolbar) return point;

    const stageRect = stage.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const margin = 12;
    const maxX = Math.max(margin, stageRect.width - toolbarRect.width - margin);
    const maxY = Math.max(
      margin,
      stageRect.height - toolbarRect.height - margin,
    );

    return {
      x: clamp(point.x, margin, maxX),
      y: clamp(point.y, margin, maxY),
    };
  }, []);

  const handleToolbarPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const stage = stageRef.current;
    const toolbar = floatingToolbarRef.current;
    if (!stage || !toolbar) return;

    const stageRect = stage.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    toolbarDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - toolbarRect.left,
      offsetY: event.clientY - toolbarRect.top,
    };
    setToolbarPosition(
      clampToolbarPosition({
        x: toolbarRect.left - stageRect.left,
        y: toolbarRect.top - stageRect.top,
      }),
    );
  };

  const handleToolbarPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = toolbarDragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;

    const stageRect = stage.getBoundingClientRect();
    setToolbarPosition(
      clampToolbarPosition({
        x: event.clientX - stageRect.left - drag.offsetX,
        y: event.clientY - stageRect.top - drag.offsetY,
      }),
    );
  };

  const stopToolbarDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (toolbarDragRef.current?.pointerId === event.pointerId) {
      toolbarDragRef.current = null;
    }
  };

  const displayWidth = imageSize ? Math.min(imageSize.width, 1280) * zoom : 720;
  const busy = Boolean(saving || localSaving);
  const canEdit = Boolean(imageSize && !loading && !error);
  const showBrushPreview =
    brushPreview.visible &&
    tool === "brush" &&
    canEdit &&
    brushPreview.size > 0;
  const zoomPercent = Math.round(zoom * 100);
  const activeToolLabel =
    tool === "brush" ? "Pinceau" : tool === "picker" ? "Pipette" : "Main";
  const historyReadout = historyState.pastCount
    ? `${historyState.pastCount} retour${
        historyState.pastCount > 1 ? "s" : ""
      } disponible${historyState.pastCount > 1 ? "s" : ""}${
        historyState.futureCount
          ? ` · ${historyState.futureCount} avance${
              historyState.futureCount > 1 ? "s" : ""
            }`
          : ""
      }`
    : "Aucune modification";

  const selectTool = useCallback((nextTool: Tool) => {
    setTool(nextTool);
    if (nextTool !== "brush") {
      setBrushSettingsOpen(false);
    }
  }, []);

  const toggleBrushSettings = useCallback(() => {
    setTool("brush");
    setBrushSettingsOpen((open) => !open);
  }, []);

  useRetouchKeyboard({
    canRedo: historyState.canRedo,
    canUndo: historyState.canUndo,
    enabled: Boolean(target),
    redo,
    resizeBrush,
    setBrushOpacity,
    setTool,
    setZoom,
    tool,
    undo,
    updateZoom,
  });

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!imageSize || (!event.altKey && !event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    updateZoom(event.deltaY > 0 ? -0.15 : 0.15);
  };

  const brushSettingsContent = (
    <BrushSettings
      brushColor={brushColor}
      brushColorInput={brushColorInput}
      brushOpacity={brushOpacity}
      brushSize={brushSize}
      busy={busy}
      onBrushColorBlur={resetBrushColorInput}
      onBrushColorInputChange={updateBrushColorFromInput}
      onBrushOpacityInputChange={updateBrushOpacityFromInput}
      onBrushSizeInputChange={updateBrushSizeFromInput}
      onClose={() => setBrushSettingsOpen(false)}
      onCommitBrushColor={commitBrushColor}
      onResizeBrush={resizeBrush}
      onResizeBrushOpacity={resizeBrushOpacity}
    />
  );

  return (
    <TooltipProvider>
      <Dialog open={target !== null} onOpenChange={onOpenChange}>
        <DialogContent
          className="!h-[calc(100dvh-2rem)] !max-h-none !w-[calc(100vw-2rem)] !max-w-none overflow-hidden rounded-2xl p-0 sm:!max-w-none max-[900px]:!h-[100dvh] max-[900px]:!max-h-[100dvh] max-[900px]:!w-screen max-[900px]:!max-w-screen max-[900px]:rounded-none"
          showCloseButton={false}
        >
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
            <RetouchDialogHeader
              busy={busy}
              canRedo={historyState.canRedo}
              canUndo={historyState.canUndo}
              imageSize={imageSize}
              targetLabel={target?.label ?? "Image source"}
              zoomPercent={zoomPercent}
              onClose={() => onOpenChange(false)}
              onRedo={redo}
              onUndo={undo}
              onZoomIn={() => updateZoom(0.15)}
              onZoomOut={() => updateZoom(-0.15)}
            />

            <div className="grid min-h-0 overflow-hidden min-[901px]:grid-cols-[3.25rem_minmax(0,1fr)] max-[900px]:grid-rows-[auto_minmax(0,1fr)]">
              <RetouchToolSidebar
                brushSettings={brushSettingsContent}
                brushSettingsOpen={brushSettingsOpen}
                tool={tool}
                onBrushSettingsOpenChange={setBrushSettingsOpen}
                onBrushSettingsToggle={toggleBrushSettings}
                onToolChange={selectTool}
              />

              <RetouchCanvasStage
                activeToolLabel={activeToolLabel}
                brushColor={brushColor}
                brushPreview={brushPreview}
                canEdit={canEdit}
                canReload={Boolean(imageSize && !loading)}
                canvasRef={canvasRef}
                displayWidth={displayWidth}
                floatingToolbarRef={floatingToolbarRef}
                historyReadout={historyReadout}
                loading={loading}
                scrollRef={scrollRef}
                showBrushPreview={showBrushPreview}
                stageRef={stageRef}
                targetLabel={target?.label ?? "image"}
                tool={tool}
                toolbarPosition={toolbarPosition}
                zoomPercent={zoomPercent}
                onCanvasPointerCancel={stopDrawing}
                onCanvasPointerDown={handlePointerDown}
                onCanvasPointerEnter={updateBrushPreview}
                onCanvasPointerLeave={hideBrushPreview}
                onCanvasPointerMove={handlePointerMove}
                onCanvasPointerUp={stopDrawing}
                onCanvasWheel={handleCanvasWheel}
                onReset={resetCanvas}
                onToolChange={selectTool}
                onToolbarPointerCancel={stopToolbarDrag}
                onToolbarPointerDown={handleToolbarPointerDown}
                onToolbarPointerMove={handleToolbarPointerMove}
                onToolbarPointerUp={stopToolbarDrag}
                onTransform={applyCanvasTransform}
              />
            </div>

            {error ? <RetouchErrorAlert error={error} /> : null}

            <RetouchDialogFooter
              activeToolLabel={activeToolLabel}
              busy={busy}
              canEdit={canEdit}
              historyReadout={historyReadout}
              onSave={(mode) => void save(mode)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
