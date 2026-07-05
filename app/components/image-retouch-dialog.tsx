import {
  Check,
  FlipHorizontal2,
  FlipVertical2,
  GripHorizontal,
  Hand,
  Loader2,
  Minus,
  Paintbrush,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

export type RetouchTarget = {
  id: Id<"generatedImages">;
  url: string;
  label: string;
};

export type RetouchSaveMode = "version" | "overwrite";

type Tool = "brush" | "picker" | "hand";
type CanvasTransform = "rotateClockwise" | "flipHorizontal" | "flipVertical";

type Point = {
  x: number;
  y: number;
};

type ImageSize = {
  width: number;
  height: number;
};

type BrushPreview = {
  x: number;
  y: number;
  size: number;
  visible: boolean;
};

type CanvasSnapshot = {
  imageData: ImageData;
  width: number;
  height: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

type ToolbarDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

const HISTORY_LIMIT = 12;

const toolButtonClass =
  "rounded-[0.65rem] text-muted-foreground transition-all duration-150 hover:bg-foreground/5 hover:text-foreground active:translate-y-px active:scale-[0.98]";
const stepperClass =
  "grid grid-cols-[1.75rem_4.5rem_1.75rem] items-center gap-1";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseControlNumber(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHexInput(value: string) {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
}

function isValidHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(value);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.closest("input, textarea, select, [contenteditable='true']"),
  );
}

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
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const panRef = useRef<PanState | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const temporaryHandToolRef = useRef<Tool | null>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [brushColor, setBrushColor] = useState("#FFFFFF");
  const [brushColorInput, setBrushColorInput] = useState("#FFFFFF");
  const [brushSize, setBrushSize] = useState(60);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [loading, setLoading] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<Point | null>(null);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    pastCount: 0,
    futureCount: 0,
  });
  const [brushPreview, setBrushPreview] = useState<BrushPreview>({
    x: 0,
    y: 0,
    size: 0,
    visible: false,
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
  }, []);

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
      setError("Cette image ne permet pas la retouche dans le navigateur.");
    }
  }, [captureSnapshot, syncHistoryState]);

  const restoreSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.putImageData(snapshot.imageData, 0, 0);
    setImageSize({ width: snapshot.width, height: snapshot.height });
  }, []);

  const resetCanvas = useCallback(async () => {
    if (!target) return;

    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    setLoading(true);
    setError(null);
    setImageSize(null);
    setZoom(1);
    setTool("brush");
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

        setImageSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
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
  }, [onPrepareSource, resetHistory, target]);

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

  useEffect(() => {
    if (!target) return;

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
          if (historyState.canRedo) redo();
        } else if (historyState.canUndo) {
          undo();
        }
        return;
      }

      if (hasCommandModifier && key === "y") {
        event.preventDefault();
        if (historyState.canRedo) redo();
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
    historyState.canRedo,
    historyState.canUndo,
    redo,
    resizeBrush,
    target,
    tool,
    undo,
    updateZoom,
  ]);

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!imageSize || (!event.altKey && !event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    updateZoom(event.deltaY > 0 ? -0.15 : 0.15);
  };

  const renderToolButton = (
    nextTool: Tool,
    label: string,
    shortcut: string,
    icon: React.ReactNode,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={tool === nextTool ? "default" : "ghost"}
          size="icon"
          className={toolButtonClass}
          aria-pressed={tool === nextTool}
          aria-label={label}
          onClick={() => setTool(nextTool)}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label} ({shortcut})
      </TooltipContent>
    </Tooltip>
  );

  const brushSettingsContent = (
    <>
      <PopoverHeader className="gap-0">
        <div className="flex items-center justify-between gap-3">
          <PopoverTitle>Pinceau</PopoverTitle>
        </div>
      </PopoverHeader>
      <Separator />

      <FieldGroup className="gap-2">
        <Field
          orientation="horizontal"
          className="items-center gap-3 justify-end"
        >
          <FieldLabel className="w-16 shrink-0 text-xs">Taille</FieldLabel>
          <div className={stepperClass}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-md"
              onClick={() => resizeBrush(-4)}
              aria-label="Reduire la taille"
            >
              <Minus />
            </Button>
            <Input
              id="retouch-size"
              value={`${brushSize}px`}
              inputMode="numeric"
              className="h-7 rounded-md px-2 text-center tabular-nums"
              aria-label="Taille du pinceau"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                updateBrushSizeFromInput(event.currentTarget.value)
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-md"
              onClick={() => resizeBrush(4)}
              aria-label="Augmenter la taille"
            >
              <Plus />
            </Button>
          </div>
        </Field>

        <Field orientation="horizontal" className="items-center gap-3">
          <FieldLabel className="w-16 shrink-0 text-xs">Opacite</FieldLabel>
          <div className={stepperClass}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-md"
              onClick={() => resizeBrushOpacity(-10)}
              aria-label="Reduire l'opacite"
            >
              <Minus />
            </Button>
            <Input
              id="retouch-opacity"
              value={`${brushOpacity}%`}
              inputMode="numeric"
              className="h-7 rounded-md px-2 text-center tabular-nums"
              aria-label="Opacite du pinceau"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                updateBrushOpacityFromInput(event.currentTarget.value)
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-md"
              onClick={() => resizeBrushOpacity(10)}
              aria-label="Augmenter l'opacite"
            >
              <Plus />
            </Button>
          </div>
        </Field>

        <Field
          orientation="horizontal"
          className="items-center gap-3 justify-between"
        >
          <FieldLabel
            htmlFor="retouch-color"
            className="w-16 shrink-0 !flex-none text-xs"
          >
            Couleur
          </FieldLabel>
          <div className="grid w-[8.5rem] flex-none grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2">
            <Input
              id="retouch-color-picker"
              type="color"
              value={brushColor}
              onChange={(event) => commitBrushColor(event.target.value)}
              className="size-7 cursor-pointer rounded-md p-1"
              aria-label="Choisir une couleur"
            />
            <Input
              id="retouch-color"
              value={brushColorInput}
              className="h-7 w-full min-w-0 rounded-md px-2 font-mono uppercase tabular-nums"
              aria-label="Couleur du pinceau"
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => {
                if (!isValidHexColor(brushColorInput)) {
                  setBrushColorInput(brushColor);
                }
              }}
              onChange={(event) =>
                updateBrushColorFromInput(event.currentTarget.value)
              }
            />
          </div>
        </Field>
      </FieldGroup>
    </>
  );

  return (
    <TooltipProvider>
      <Dialog open={target !== null} onOpenChange={onOpenChange}>
        <DialogContent
          className="!h-[calc(100dvh-2rem)] !max-h-none !w-[calc(100vw-2rem)] !max-w-none overflow-hidden rounded-2xl p-0 sm:!max-w-none max-[900px]:!h-[100dvh] max-[900px]:!max-h-[100dvh] max-[900px]:!w-screen max-[900px]:!max-w-screen max-[900px]:rounded-none"
          showCloseButton={false}
        >
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
            <DialogHeader className="m-0 grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-card/95 px-4 py-2 max-[760px]:min-h-0 max-[760px]:grid-cols-1 max-[760px]:gap-2 max-[760px]:px-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold">
                  Retouche image
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Atelier de retouche locale avec pinceau, pipette, main,
                  historique, zoom et transformations.
                </DialogDescription>
                <p className="truncate text-xs text-muted-foreground">
                  {target?.label ?? "Image source"}
                </p>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2 max-[760px]:justify-between">
                {imageSize ? (
                  <Badge
                    variant="outline"
                    className="min-h-8 flex-none tabular-nums max-[640px]:hidden"
                  >
                    {imageSize.width} x {imageSize.height}px
                  </Badge>
                ) : null}

                <div
                  className="inline-flex min-h-8 items-center gap-0.5 rounded-lg border bg-background/80 px-1 text-xs tabular-nums text-muted-foreground"
                  aria-label="Zoom"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!imageSize}
                    onClick={() => updateZoom(-0.15)}
                    aria-label="Zoom arriere"
                  >
                    <ZoomOut />
                  </Button>
                  <span className="min-w-12 text-center max-[640px]:min-w-10">
                    {zoomPercent}%
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!imageSize}
                    onClick={() => updateZoom(0.15)}
                    aria-label="Zoom avant"
                  >
                    <ZoomIn />
                  </Button>
                </div>

                <div
                  className="inline-flex min-h-8 items-center gap-0.5 rounded-lg border bg-background/80 px-1"
                  aria-label="Historique"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!historyState.canUndo}
                    onClick={undo}
                    aria-label="Annuler"
                  >
                    <Undo2 />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!historyState.canRedo}
                    onClick={redo}
                    aria-label="Retablir"
                  >
                    <Redo2 />
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                  aria-label="Fermer"
                >
                  <X />
                </Button>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 overflow-hidden min-[901px]:grid-cols-[3.25rem_minmax(0,1fr)] max-[900px]:grid-rows-[auto_minmax(0,1fr)]">
              <aside
                className="relative z-20 flex min-h-0 min-w-0 flex-col items-center gap-2 border-r bg-card/90 px-2 py-3 max-[900px]:flex-row max-[900px]:justify-center max-[900px]:border-b max-[900px]:border-r-0 max-[900px]:p-2"
                aria-label="Outils"
              >
                <Popover open={tool === "brush"}>
                  <PopoverAnchor asChild>
                    <div>
                      {renderToolButton(
                        "brush",
                        "Pinceau",
                        "B",
                        <Paintbrush />,
                      )}
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    side="right"
                    align="start"
                    sideOffset={8}
                    className="w-64 gap-3 border bg-card p-3 shadow-md ring-0"
                  >
                    {brushSettingsContent}
                  </PopoverContent>
                </Popover>
                {renderToolButton("picker", "Pipette", "I", <Pipette />)}
                {renderToolButton("hand", "Main", "H", <Hand />)}
              </aside>

              <main
                ref={stageRef}
                className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-muted/40"
              >
                {loading ? (
                  <div className="absolute inset-4 z-20 grid content-center place-items-center gap-2 rounded-xl border border-dashed bg-background/85 text-sm text-muted-foreground backdrop-blur">
                    <Loader2 className="size-5 animate-spin" />
                    Chargement de l'image
                  </div>
                ) : null}

                <div
                  ref={scrollRef}
                  className="grid min-h-0 place-items-center overflow-auto p-5 max-[900px]:p-3"
                  onWheel={handleCanvasWheel}
                >
                  <div className="relative w-fit leading-none">
                    <canvas
                      ref={canvasRef}
                      className="block h-auto max-w-none touch-none rounded-md border bg-white shadow-[0_1px_2px_rgb(32_35_38/0.08),0_14px_38px_rgb(32_35_38/0.12)] data-[tool=brush]:cursor-none data-[tool=hand]:cursor-grab data-[tool=picker]:cursor-copy"
                      style={{ width: displayWidth }}
                      aria-label={`Retoucher ${target?.label ?? "image"}`}
                      onPointerEnter={updateBrushPreview}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={stopDrawing}
                      onPointerCancel={stopDrawing}
                      onPointerLeave={hideBrushPreview}
                      data-tool={tool}
                    />

                    {showBrushPreview ? (
                      <div
                        className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border-[1.5px] bg-primary/10 shadow-[0_0_0_1px_rgb(255_255_255/0.78),0_2px_8px_rgb(32_35_38/0.18)] will-change-transform"
                        style={{
                          width: brushPreview.size,
                          height: brushPreview.size,
                          borderColor: brushColor,
                          transform: `translate(${
                            brushPreview.x - brushPreview.size / 2
                          }px, ${brushPreview.y - brushPreview.size / 2}px)`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                <div
                  ref={floatingToolbarRef}
                  className={cn(
                    "absolute z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1 overflow-x-auto rounded-2xl border bg-background/95 p-1.5 shadow-md backdrop-blur",
                    toolbarPosition
                      ? "translate-x-0"
                      : "bottom-5 left-1/2 -translate-x-1/2",
                  )}
                  style={
                    toolbarPosition
                      ? { left: toolbarPosition.x, top: toolbarPosition.y }
                      : undefined
                  }
                  aria-label="Barre flottante de retouche"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-grab rounded-xl active:cursor-grabbing"
                        aria-label="Deplacer la barre d'outils"
                        onPointerDown={handleToolbarPointerDown}
                        onPointerMove={handleToolbarPointerMove}
                        onPointerUp={stopToolbarDrag}
                        onPointerCancel={stopToolbarDrag}
                      >
                        <GripHorizontal />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Deplacer la barre
                    </TooltipContent>
                  </Tooltip>

                  <Separator orientation="vertical" className="h-6" />

                  <div className="flex items-center gap-1" aria-label="Outils">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={tool === "brush" ? "default" : "ghost"}
                          size="icon-sm"
                          className="rounded-xl"
                          aria-pressed={tool === "brush"}
                          aria-label="Pinceau"
                          onClick={() => setTool("brush")}
                        >
                          <Paintbrush />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Pinceau (B)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={tool === "picker" ? "default" : "ghost"}
                          size="icon-sm"
                          className="rounded-xl"
                          aria-pressed={tool === "picker"}
                          aria-label="Pipette"
                          onClick={() => setTool("picker")}
                        >
                          <Pipette />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Pipette (I)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={tool === "hand" ? "default" : "ghost"}
                          size="icon-sm"
                          className="rounded-xl"
                          aria-pressed={tool === "hand"}
                          aria-label="Main"
                          onClick={() => setTool("hand")}
                        >
                          <Hand />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Main (H)</TooltipContent>
                    </Tooltip>
                  </div>

                  <Separator orientation="vertical" className="h-6" />

                  <div
                    className="flex items-center gap-1 pl-0.5"
                    aria-label="Transformer"
                  >
                    <span className="px-1 text-xs font-medium text-muted-foreground max-[640px]:sr-only">
                      Transformer
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-xl"
                          disabled={!canEdit}
                          onClick={() =>
                            applyCanvasTransform("rotateClockwise")
                          }
                          aria-label="Rotation"
                        >
                          <RotateCw />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Rotation</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-xl"
                          disabled={!canEdit}
                          onClick={() => applyCanvasTransform("flipHorizontal")}
                          aria-label="Miroir horizontal"
                        >
                          <FlipHorizontal2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Miroir horizontal
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-xl"
                          disabled={!canEdit}
                          onClick={() => applyCanvasTransform("flipVertical")}
                          aria-label="Miroir vertical"
                        >
                          <FlipVertical2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Miroir vertical
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-xl"
                          disabled={!imageSize || loading}
                          onClick={resetCanvas}
                          aria-label="Recharger"
                        >
                          <RotateCcw />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Recharger</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div
                  className="relative z-10 flex min-h-10 items-center justify-between gap-3 border-t bg-background/90 px-3 text-xs tabular-nums text-muted-foreground backdrop-blur max-[640px]:hidden"
                  aria-live="polite"
                >
                  <span className="truncate">{activeToolLabel}</span>
                  <span className="truncate text-center">
                    {zoomPercent}% · Cmd/Ctrl + molette
                  </span>
                  <span className="truncate text-right">{historyReadout}</span>
                </div>
              </main>
            </div>

            {error ? (
              <div className="border-t bg-card/90 px-4 py-2">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            <DialogFooter className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-none border-t bg-card/95 px-4 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-2 max-[640px]:px-3">
              <div
                className="flex min-w-0 gap-2 text-xs tabular-nums text-muted-foreground max-[640px]:hidden"
                aria-live="polite"
              >
                <span className="block truncate">{activeToolLabel}</span>
                <Separator orientation="vertical" />
                <span className="block truncate">{historyReadout}</span>
              </div>

              <div className="flex items-center justify-end gap-2 max-[640px]:grid max-[640px]:w-full max-[640px]:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                >
                  Fermer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || busy}
                  onClick={() => void save("version")}
                >
                  {busy ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Check data-icon="inline-start" />
                  )}
                  Enregistrer une version
                </Button>
                <Button
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => void save("overwrite")}
                  className="max-[640px]:col-span-2"
                >
                  {busy ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  Remplacer l'image
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
