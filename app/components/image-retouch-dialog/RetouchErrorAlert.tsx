import { Alert, AlertDescription } from "@/components/ui/alert";

export function RetouchErrorAlert({ error }: { error: string }) {
  return (
    <div className="border-t bg-card/90 px-4 py-2">
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    </div>
  );
}
