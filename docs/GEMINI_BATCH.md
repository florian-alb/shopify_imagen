# Gemini image batches

## Why JSONL files are required

Gemini supports two batch input modes:

- Inline requests embed every request in the batch creation call and return every
  generated image inline in the batch operation response.
- File requests upload a JSONL input file through Gemini File API and return a
  JSONL result file.

This app always uses file requests for new Gemini image batches. Image outputs
are large base64 values: an inline batch of 40 generated images produced a
675 MiB operation response in development. A Convex Node action has a 512 MiB
memory limit, so parsing the full operation response with `response.json()` is
not viable.

Reference: [Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api).

## Submission flow

`generation.submitBatch` prepares one JSON object per image:

```json
{"key":"generatedImages id","request":{"contents":[],"generationConfig":{}}}
```

It then:

1. Uploads the JSONL text with Gemini File API resumable upload.
2. Calls `models/<model>:batchGenerateContent` with
   `input_config.file_name`.
3. Stores the returned `batches/<id>` name and the input `files/<id>` name on
   the Convex job.

The input file stays available until ingestion finishes, then cleanup removes
it. Gemini also expires File API files automatically.

## Poll and ingestion flow

`generation.submitBatch` schedules `generation.pollBatchJob` about 10 seconds
after a provider batch is created. If the provider is still pending, the job
polls again with a safe backoff: 10s, 20s, 45s, then 120s. The cron in
`convex/crons.ts` still runs every two minutes as a fallback for interrupted or
older jobs.

1. Polling requests only `name`, `done`, and `error` through the Google partial
   response `fields` parameter.
2. Once `done` is true, the action retrieves the small result file name.
3. It downloads the JSONL result file as a stream.
4. Each line is parsed, decoded, optimized to WebP, uploaded to R2, and recorded
   in Convex before the next line is processed.

The action never keeps the complete result file or every decoded image in
memory.

## Concurrency and retries

Cron polling and the `Force poll` button can race. An 11-minute ingestion lease
stored on `generationJobs.batchIngestionStartedAt` allows only one ingestion
attempt at a time. This is one minute longer than the 10-minute Convex Node
action limit. If an action is interrupted, the lease expires and a later cron
resumes the work.

Image completion and failure mutations are idempotent. A resumed ingestion
skips images already marked `generated`, `uploaded`, or `failed`, so counters
are not incremented twice.

## Legacy inline batch recovery

Jobs created before the JSONL migration have no `batchInputFileName`. They are
recovered automatically through a compatibility path:

1. Poll the operation with the same lightweight status request.
2. Stream the large legacy operation body.
3. Parse only the first inline response array incrementally.
4. Stop reading before Gemini sends the duplicate copy of the results.

Recovery can require several action runs if one Convex action cannot process all
images before its execution limit. Completed images are retained between runs.

## Chunk sizing

Gemini JSONL ingestion uses small chunks so a Convex action does not hold too
much image data in memory. Default chunk size is 6 images, or 2 images when any
pending image requires background removal. Set `GEMINI_INGEST_CHUNK_SIZE` in the
Convex environment to override this temporarily during operations.

## Operations

Inspect running batch jobs:

```bash
npx convex data generationJobs
```

Force an immediate cron poll:

```bash
npx convex run generation:pollBatches '{}'
```

Watch only generation logs:

```bash
npx convex logs --history 200 | rg '\[gen:batch\]|generation:poll'
```

The job detail screen also exposes `Force poll`. If ingestion is already
running, it reports that state instead of starting another download.

## Security

`GEMINI_API_KEY` is read only by Convex actions. Never place it in a `VITE_`
variable or commit it to the repository. Rotate the key immediately if it is
shared in a terminal transcript, issue, chat, or screenshot.
