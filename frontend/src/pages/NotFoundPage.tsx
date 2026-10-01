import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-7xl font-bold text-accent">404</p>
      <h1 className="mt-4 text-2xl font-bold text-primary">Page not found</h1>
      <p className="mt-2 text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button asChild variant="accent" className="mt-6">
        <Link to="/">Back to events</Link>
      </Button>
    </div>
  );
}
