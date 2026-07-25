import { Hand, Paintbrush, Pipette } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RetouchTool } from "./types";

const toolButtonClass =
  "rounded-[0.65rem] text-muted-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";
const mobileToolbarQuery = "(max-width: 900px)";

function subscribeToMobileToolbar(callback: () => void) {
  const mediaQuery = window.matchMedia(mobileToolbarQuery);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getMobileToolbarSnapshot() {
  return window.matchMedia(mobileToolbarQuery).matches;
}

function getMobileToolbarServerSnapshot() {
  return false;
}

export function RetouchToolSidebar({
  brushSettings,
  brushSettingsOpen,
  tool,
  onBrushSettingsOpenChange,
  onBrushSettingsToggle,
  onToolChange,
}: {
  brushSettings: ReactNode;
  brushSettingsOpen: boolean;
  tool: RetouchTool;
  onBrushSettingsOpenChange: (open: boolean) => void;
  onBrushSettingsToggle: () => void;
  onToolChange: (tool: RetouchTool) => void;
}) {
  const isMobileToolbar = useSyncExternalStore(
    subscribeToMobileToolbar,
    getMobileToolbarSnapshot,
    getMobileToolbarServerSnapshot,
  );

  return (
    <aside
      className="relative z-20 flex min-h-0 min-w-0 flex-col items-center gap-2 border-r bg-card/90 px-2 py-3 max-[900px]:flex-row max-[900px]:justify-center max-[900px]:border-b max-[900px]:border-r-0 max-[900px]:p-2"
      aria-label="Outils"
    >
      <Popover
        open={brushSettingsOpen}
        onOpenChange={onBrushSettingsOpenChange}
      >
        <PopoverAnchor asChild>
          <div>
            <ToolButton
              active={tool === "brush"}
              icon={<Paintbrush />}
              label="Pinceau"
              shortcut="B"
              onClick={onBrushSettingsToggle}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          side={isMobileToolbar ? "bottom" : "right"}
          align={isMobileToolbar ? "center" : "start"}
          sideOffset={8}
          collisionPadding={12}
          className="w-[min(16rem,calc(100vw-2rem))] gap-3 border bg-card p-3 shadow-md ring-0 max-[900px]:max-h-[min(60dvh,24rem)] max-[900px]:overflow-auto"
        >
          {brushSettings}
        </PopoverContent>
      </Popover>

      <ToolButton
        active={tool === "picker"}
        icon={<Pipette />}
        label="Pipette"
        shortcut="I"
        onClick={() => onToolChange("picker")}
      />
      <ToolButton
        active={tool === "hand"}
        icon={<Hand />}
        label="Main"
        shortcut="H"
        onClick={() => onToolChange("hand")}
      />
    </aside>
  );
}

function ToolButton({
  active,
  icon,
  label,
  shortcut,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "default" : "ghost"}
          size="icon"
          className={toolButtonClass}
          data-active={active}
          aria-pressed={active}
          aria-label={label}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label} ({shortcut})
      </TooltipContent>
    </Tooltip>
  );
}
