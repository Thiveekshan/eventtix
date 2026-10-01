import { Link } from "@tanstack/react-router";
import { Calendar, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EventItem } from "@/api/client";
import { formatDate, formatPrice, isPast } from "@/lib/format";

export function EventCard({ event }: { event: EventItem }) {
  const soldOut = event.seatsAvailable === 0;
  const past = isPast(event.date);
  return (
    <Link
      to="/events/$id"
      params={{ id: String(event.id) }}
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card-hover"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-snug text-primary group-hover:text-accent">
          {event.title}
        </h3>
        {soldOut ? (
          <Badge variant="destructive">Sold out</Badge>
        ) : past ? (
          <Badge variant="secondary">Past</Badge>
        ) : null}
      </div>
      <div className="space-y-1.5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {event.venue}
        </p>
        <p className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {formatDate(event.date)}
        </p>
        <p className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          {event.seatsAvailable} of {event.capacity} seats available
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <span className="text-xl font-bold text-primary">{formatPrice(event.price)}</span>
        <span className="text-sm font-medium text-accent">View details →</span>
      </div>
    </Link>
  );
}
