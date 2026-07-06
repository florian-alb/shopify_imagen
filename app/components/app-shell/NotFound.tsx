import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-4 py-8">
      <Card className="w-full border-white/10 bg-card/80">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">404</p>
          <h1 className="mt-2 text-2xl font-semibold">Page introuvable</h1>
          <Button variant="outline" className="mt-5" asChild>
            <Link to="/products">Retour aux produits</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
