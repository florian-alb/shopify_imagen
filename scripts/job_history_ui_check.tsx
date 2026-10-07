// Local interactive fixture. No Convex client, storage or provider calls.
// Run: rtk npx vite --config scripts/vite.openai-batch-ui.config.ts
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Tabs, TabsList, TabsTrigger } from "../app/components/ui/tabs";
import { DeleteJobDialog } from "../app/features/jobs/components/DeleteJobDialog";
import { JobHistoryMenu } from "../app/features/jobs/components/JobHistoryMenu";
import type { Doc, Id } from "../convex/_generated/dataModel";
import "../app/styles.css";

const completed: Doc<"generationJobs"> = {
  _id: "fixture-completed" as Id<"generationJobs">, _creationTime: 1, createdAt: 1, updatedAt: 1,
  status: "completed", mode: "bulk", executionMode: "batch", imageProvider: "openai",
  productIds: [], selectedImageTypes: ["Hero", "Detail", "Lifestyle"], forceRegenerate: false,
  totalTasks: 900, completedTasks: 900, failedTasks: 0,
};

function Fixture() {
  const [jobs, setJobs] = useState([completed, {
    ...completed, _id: "fixture-running" as Id<"generationJobs">, status: "running" as const, completedTasks: 300,
  }]);
  const [archived, setArchived] = useState(false);
  const [target, setTarget] = useState<Doc<"generationJobs"> | null>(null);
  const [message, setMessage] = useState("");
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <p className="mb-6 text-sm text-muted-foreground">Vérification locale · données fictives · aucun appel fournisseur</p>
      <h1 className="mb-4 text-2xl font-semibold">Générations</h1>
      <Tabs value={archived ? "archived" : "history"} onValueChange={value => setArchived(value === "archived")}>
        <TabsList aria-label="Vue de l'historique des générations">
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="archived">Archivés</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="my-4 divide-y rounded-lg border">
        {jobs.filter(job => (job.archivedAt != null) === archived).map(job => (
          <div key={job._id} className="flex items-center justify-between gap-3 p-4" data-job-id={job._id}>
            <div><p className="font-medium">Job {job._id.slice(-6)}</p><p className="text-sm text-muted-foreground">{job.status} · {job.completedTasks} / 900 images</p></div>
            <JobHistoryMenu job={job} busy={false} onArchive={() => {
              setJobs(rows => rows.map(row => row._id === job._id ? { ...row, archivedAt: archived ? undefined : Date.now() } : row));
              setMessage(archived ? "Job restauré" : "Job archivé");
            }} onDelete={() => setTarget(job)} />
          </div>
        ))}
      </div>
      <p role="status">{message}</p>
      <DeleteJobDialog target={target} busy={false} onOpenChange={open => { if (!open) setTarget(null); }} onConfirm={() => {
        setJobs(rows => rows.filter(row => row._id !== target?._id));
        setTarget(null);
        setMessage("Job supprimé de l'historique");
      }} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
