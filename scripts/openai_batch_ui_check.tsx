// Render production components with local records. No Convex client or provider calls.
// Run: rtk npx vite --config scripts/vite.openai-batch-ui.config.ts
import { createRoot } from "react-dom/client";
import { JobProgressCard } from "../app/features/jobs/components/JobProgressCard";
import { JobTechnicalDetails } from "../app/features/jobs/components/JobTechnicalDetails";
import { createBatchJobProgress } from "../app/features/jobs/lib/batchJobProgress";
import type { Doc, Id } from "../convex/_generated/dataModel";
import "../app/styles.css";

const scenario = new URL(window.location.href).searchParams.get("scenario") ?? "parallel";
const uncertain = scenario === "uncertain";
const completed = scenario === "completed";
const legacy = scenario === "legacy" || scenario === "gemini";
const jobId = "fixture-bulk-900" as Id<"generationJobs">;
const phases: Array<NonNullable<Doc<"generationBatchSegments">["phase"]>> = completed
  ? Array.from({ length: 9 }, () => "completed")
  : uncertain
    ? [...Array.from({ length: 7 }, () => "completed" as const), "uncertain", "preparing"]
    : [...Array.from({ length: 6 }, () => "completed" as const), "waiting", "recovering", "preparing"];
const segments: Doc<"generationBatchSegments">[] = phases.map((phase, index) => ({
  _id: `fixture-segment-${index + 1}` as Id<"generationBatchSegments">,
  _creationTime: 1,
  createdAt: 1,
  updatedAt: 1,
  jobId,
  provider: scenario === "gemini" ? "gemini" : "openai",
  status: phase === "completed" ? "completed" : phase === "preparing" || phase === "uncertain" ? "submitting" : "running",
  phase: legacy ? undefined : phase,
  imageCount: 100,
  preparedTasks: phase === "preparing" ? 50 : 100,
  ingestedCount: phase === "completed" ? 100 : phase === "recovering" ? 30 : 0,
  failedCount: 0,
  batchId: phase === "preparing" || phase === "uncertain" ? null : `batch_fixture_${index + 1}`,
  batchStatus: phase === "waiting" ? "in_progress" : phase === "recovering" || phase === "completed" ? "completed" : null,
  error: phase === "uncertain" ? "Connexion interrompue après la soumission. Recherche du batch accepté en cours." : null,
}));
const products = Array.from({ length: 300 }, (_, index) => `fixture-product-${index}` as Id<"products">);
const job: Doc<"generationJobs"> = {
  _id: jobId,
  _creationTime: 1,
  createdAt: 1,
  updatedAt: 1,
  mode: "bulk",
  executionMode: "batch",
  imageProvider: scenario === "gemini" ? "gemini" : "openai",
  imageModel: "gpt-image-2.5-sunburst",
  forceRegenerate: false,
  status: completed ? "completed" : "running",
  totalTasks: 900,
  completedTasks: completed ? 900 : uncertain ? 700 : 630,
  failedTasks: 0,
  productIds: products,
  selectedImageTypes: ["Hero", "Detail", "Lifestyle"],
  openAiDurable: legacy ? undefined : true,
  openAiBatchSize: 100,
  openAiBatchConcurrency: uncertain ? 2 : 3,
};
const images: Doc<"generatedImages">[] = segments.flatMap((segment, segmentIndex) =>
  Array.from({ length: 100 }, (_, index) => {
    const task = segmentIndex * 100 + index;
    const generated = segment.status === "completed" || segment.phase === "recovering" && index < 30;
    return {
      _id: `fixture-image-${task}` as Id<"generatedImages">,
      _creationTime: 1,
      createdAt: 1,
      updatedAt: 1,
      jobId,
      productId: products[Math.floor(task / 3)],
      imageType: ["Hero", "Detail", "Lifestyle"][task % 3],
      promptUsed: "Fixture prompt",
      batchSegmentId: segment._id,
      providerBatchId: segment.batchId,
      status: generated ? "generated" : segment.phase === "preparing" || segment.phase === "uncertain" ? "queued" : "generating",
      storageUrl: generated ? `https://example.invalid/generated-${task}.jpg` : null,
      costUsd: generated ? 0.04 : undefined,
      costRateMultiplier: 0.5,
    };
  }),
);
const batchProgress = createBatchJobProgress({ job, images, segments });
const percent = Math.round((job.completedTasks + job.failedTasks) / job.totalTasks * 100);

function Fixture() {
  return (
    <>
      <div className="border-b bg-muted px-4 py-3 text-center text-xs">
        Vérification locale · données fictives · aucun appel Convex, OpenAI ou Shopify
        <button className="ml-3 underline underline-offset-2" onClick={() => document.documentElement.classList.toggle("dark")}>Clair / sombre</button>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Bulk de 300 produits · 900 images</h1>
        <nav aria-label="Scénarios de vérification" className="my-4 flex flex-wrap gap-3 text-sm">
          {[
            ["parallel", "Phases simultanées"], ["uncertain", "Soumission incertaine"],
            ["completed", "Terminé"], ["legacy", "Ancien OpenAI"], ["gemini", "Gemini"],
          ].map(([value, label]) => (
            <a key={value} className="underline underline-offset-4" aria-current={scenario === value ? "page" : undefined} href={`?scenario=${value}`}>{label}</a>
          ))}
        </nav>
        <JobProgressCard job={job} jobCost={job.completedTasks * 0.04} progress={percent} batchProgress={batchProgress} />
        <JobTechnicalDetails job={job} images={images} segments={segments} />
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
