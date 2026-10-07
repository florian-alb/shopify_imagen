import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Doc } from "@/lib/convex";

export function JobHistoryMenu({ job, busy, onArchive, onDelete }: {
  job: Doc<"generationJobs">;
  busy: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const archived = job.archivedAt != null;
  const active = job.status === "queued" || job.status === "running";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" disabled={busy}
          aria-label={`Actions du job ${job._id.slice(-6)}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuItem onSelect={onArchive}>
          {archived ? <ArchiveRestore /> : <Archive />}
          {archived ? "Restaurer dans l'historique" : "Archiver"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete} disabled={active}>
          <Trash2 /> Supprimer de l'historique
        </DropdownMenuItem>
        {active ? <DropdownMenuLabel className="font-normal text-muted-foreground">
          Terminez ou annulez le job pour le supprimer.
        </DropdownMenuLabel> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
