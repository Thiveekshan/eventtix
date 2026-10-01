import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/api/client";
import { EventCard } from "@/components/EventCard";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/States";
import { useErrorToast } from "@/lib/format";

export default function EventsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["events"], queryFn: api.getEvents });
  useErrorToast(error);

  const filtered = useMemo(
    () => (data ?? []).filter((e) => e.title.toLowerCase().includes(search.trim().toLowerCase())),
    [data, search],
  );

  return (
    <div>
      <PageHeader
        title="Upcoming events"
        subtitle="Find something great and grab your tickets."
        action={
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-card pl-9"
            />
          </div>
        }
      />
      {isLoading ? (
        <LoadingState label="Loading events…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : filtered.length === 0 ? (
        <EmptyState title={search ? "No events match your search" : "No events yet"}>
          {search ? "Try a different title." : "Check back soon."}
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
