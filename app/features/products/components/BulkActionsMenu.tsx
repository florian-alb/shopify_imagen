import { ChevronDown, FlipHorizontal2, Images } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BulkActionsMenu({
  disabled,
  onReorder,
  onFlip,
}: {
  disabled?: boolean;
  onReorder: () => void;
  onFlip: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-7"
          disabled={disabled}
        >
          Actions bulk
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Opération à lancer</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 sm:min-h-7" onSelect={onReorder}>
          <Images />
          Réorganiser les images
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 sm:min-h-7" onSelect={onFlip}>
          <FlipHorizontal2 />
          Miroir horizontal
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
