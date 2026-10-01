import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { ErrorState, LoadingState } from "@/components/States";
import { formatDate, formatPrice, isPast, useErrorToast } from "@/lib/format";

export default function EventDetailsPage({ id }: { id: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const {
    data: event,
    isLoading,
    error,
  } = useQuery({ queryKey: ["event", id], queryFn: () => api.getEvent(id) });
  useErrorToast(error);

  const book = useMutation({
    mutationFn: () => api.createBooking({ eventId: event!.id, quantity }),
    onSuccess: () => {
      toast.success("Booking confirmed!");
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      navigate({ to: "/bookings" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingState label="Loading event…" />;
  if (error || !event)
    return <ErrorState message={(error as Error)?.message ?? "Event not found"} />;

  const soldOut = event.seatsAvailable === 0;
  const past = isPast(event.date);
  const maxQty = Math.max(1, Math.min(6, event.seatsAvailable));
  const qty = Math.min(quantity, maxQty);
  const disabled = soldOut || past;

  return (
    <div>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> All events
      </Link>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border bg-card p-6 shadow-card sm:p-8">
          <div className="mb-4 flex flex-wrap gap-2">
            {soldOut && <Badge variant="destructive">Sold out</Badge>}
            {past && <Badge variant="secondary">Past event</Badge>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{event.title}</h1>
          <div className="mt-4 grid gap-2 text-muted-foreground sm:grid-cols-2">
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
              {event.seatsAvailable} / {event.capacity} seats available
            </p>
          </div>
          <p className="mt-6 whitespace-pre-line leading-relaxed">
            {event.description || "No description provided."}
          </p>
        </div>

        <aside className="h-fit rounded-xl border bg-card p-6 shadow-card lg:sticky lg:top-24">
          <p className="text-sm text-muted-foreground">Price per ticket</p>
          <p className="text-3xl font-bold text-primary">{formatPrice(event.price)}</p>
          {!user ? (
            <Button asChild variant="accent" className="mt-6 w-full">
              <Link to="/login">Log in to book</Link>
            </Button>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!disabled) book.mutate();
              }}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity</label>
                <Select
                  value={String(qty)}
                  onValueChange={(v) => setQuantity(Number(v))}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} ticket{n > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">
                  {formatPrice(event.price * qty)}
                </span>
              </div>
              <Button
                type="submit"
                variant="accent"
                className="w-full"
                disabled={disabled || book.isPending}
              >
                {soldOut
                  ? "Sold out"
                  : past
                    ? "Event has passed"
                    : book.isPending
                      ? "Booking…"
                      : "Book now"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">Max 6 tickets per booking</p>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
