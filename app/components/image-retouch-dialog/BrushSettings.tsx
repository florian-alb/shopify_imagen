import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { isValidHexColor } from "./lib";

const stepperClass =
  "grid w-[8.5rem] flex-none grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1";

export function BrushSettings({
  brushColor,
  brushColorInput,
  brushOpacity,
  brushSize,
  busy,
  onBrushColorBlur,
  onBrushColorInputChange,
  onBrushOpacityInputChange,
  onBrushSizeInputChange,
  onClose,
  onCommitBrushColor,
  onResizeBrush,
  onResizeBrushOpacity,
}: {
  brushColor: string;
  brushColorInput: string;
  brushOpacity: number;
  brushSize: number;
  busy: boolean;
  onBrushColorBlur: () => void;
  onBrushColorInputChange: (value: string) => void;
  onBrushOpacityInputChange: (value: string) => void;
  onBrushSizeInputChange: (value: string) => void;
  onClose: () => void;
  onCommitBrushColor: (value: string) => void;
  onResizeBrush: (delta: number) => void;
  onResizeBrushOpacity: (delta: number) => void;
}) {
  return (
    <>
      <PopoverHeader className="gap-0">
        <div className="flex items-center justify-between gap-3">
          <PopoverTitle>Pinceau</PopoverTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onClick={onClose}
            aria-label="Fermer"
          >
            <X />
          </Button>
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
              onClick={() => onResizeBrush(-4)}
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
                onBrushSizeInputChange(event.currentTarget.value)
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-md"
              onClick={() => onResizeBrush(4)}
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
              onClick={() => onResizeBrushOpacity(-10)}
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
                onBrushOpacityInputChange(event.currentTarget.value)
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-md"
              onClick={() => onResizeBrushOpacity(10)}
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
              onChange={(event) => onCommitBrushColor(event.target.value)}
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
                  onBrushColorBlur();
                }
              }}
              onChange={(event) =>
                onBrushColorInputChange(event.currentTarget.value)
              }
            />
          </div>
        </Field>
      </FieldGroup>
    </>
  );
}
