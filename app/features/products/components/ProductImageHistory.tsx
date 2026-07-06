import { Link } from "@tanstack/react-router";
import { ChevronRight, ListChecks, Trash2 } from "lucide-react";

import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Doc } from "@/lib/convex";

export function ProductImageHistory({
  productId,
  images,
  hasProductJobs,
  onDelete,
}: {
  productId: string;
  images: Doc<"generatedImages">[];
  hasProductJobs: boolean;
  onDelete: (image: Doc<"generatedImages">) => void;
}) {
  return (
    <Card className="mb-4 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg">Historique prompts et images</CardTitle>
        {hasProductJobs ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/jobs" search={{ productId }}>
              <ListChecks data-icon="inline-start" />
              Jobs
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {images.length ? (
          <Accordion type="multiple" className="gap-3">
            {images.map((image) => (
              <HistoryItem
                key={image._id}
                image={image}
                onDelete={() => onDelete(image)}
              />
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun historique de generation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryItem({
  image,
  onDelete,
}: {
  image: Doc<"generatedImages">;
  onDelete: () => void;
}) {
  const providerLabel =
    image.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI";

  return (
    <AccordionItem
      value={image._id}
      className="rounded-lg border px-3 last:border-b"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2">
          {image.imageType}
          <Separator orientation="vertical" className="h-4" />
          <ImageStateBadge image={image} />
          <Badge variant="outline">{providerLabel}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid gap-3 pt-2">
          {image.error ? (
            <Alert variant="destructive">
              <AlertDescription>{image.error}</AlertDescription>
            </Alert>
          ) : null}
          {image.storageUrl ? (
            <a
              className="break-all text-sm underline underline-offset-4"
              href={image.storageUrl}
              target="_blank"
              rel="noreferrer"
            >
              {image.storageUrl}
            </a>
          ) : null}
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {image.promptUsed}
          </pre>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 data-icon="inline-start" />
              Delete everywhere
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
