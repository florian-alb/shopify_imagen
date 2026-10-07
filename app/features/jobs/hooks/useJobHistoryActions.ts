import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api, type Doc, type Id } from "@/lib/convex";

export function useJobHistoryActions({
  onRemoved,
  onArchiveChanged,
}: {
  onRemoved?: () => void;
  onArchiveChanged?: () => void;
} = {}) {
  const setArchived = useMutation(api.jobs.setArchived);
  const remove = useMutation(api.jobs.remove);
  const pending = useRef(false);
  const [busyJobId, setBusyJobId] = useState<Id<"generationJobs"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"generationJobs"> | null>(null);

  async function toggleArchived(job: Doc<"generationJobs">) {
    if (pending.current) return;
    pending.current = true;
    setBusyJobId(job._id);
    const archived = job.archivedAt == null;
    try {
      await setArchived({ jobId: job._id, archived });
      toast.success(archived ? "Job archivé" : "Job restauré dans l'historique", {
        description: archived && (job.status === "queued" || job.status === "running")
          ? "La génération continue en arrière-plan." : undefined,
      });
      onArchiveChanged?.();
    } catch (error) {
      toast.error("Impossible de modifier l'archive", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pending.current = false;
      setBusyJobId(null);
    }
  }

  async function confirmRemoval() {
    if (!deleteTarget || pending.current) return;
    pending.current = true;
    setBusyJobId(deleteTarget._id);
    try {
      await remove({ jobId: deleteTarget._id });
      setDeleteTarget(null);
      toast.success("Job supprimé de l'historique");
      onRemoved?.();
    } catch (error) {
      toast.error("Impossible de supprimer le job", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pending.current = false;
      setBusyJobId(null);
    }
  }

  function onDeleteOpenChange(open: boolean) {
    if (!open && !pending.current) setDeleteTarget(null);
  }

  return {
    busyJobId, deleteTarget, setDeleteTarget, toggleArchived, confirmRemoval, onDeleteOpenChange,
  };
}
