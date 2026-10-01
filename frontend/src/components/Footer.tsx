import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function Footer() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    retry: false,
    refetchInterval: 30000,
  });
  const version = useQuery({ queryKey: ["version"], queryFn: api.version, retry: false });

  const offline = health.isError;
  const ok = health.data?.status === "ok";

  return (
    <footer className="mt-auto border-t bg-card">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground">
        <span>© EventTix</span>
        <div className="flex items-center gap-4">
          {version.data && (
            <span>
              API v{version.data.version} · build {version.data.build}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${health.isLoading ? "bg-muted-foreground" : ok ? "bg-success" : "bg-destructive"}`}
            />
            {health.isLoading
              ? "Checking API…"
              : offline
                ? "API offline"
                : ok
                  ? "API status: online"
                  : "API status: degraded"}
          </span>
        </div>
      </div>
    </footer>
  );
}
