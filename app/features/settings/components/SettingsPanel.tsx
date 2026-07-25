import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function SettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-lg py-0">
      <CardContent className="grid gap-4 p-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
