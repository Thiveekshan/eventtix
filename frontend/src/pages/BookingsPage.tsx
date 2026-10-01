import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, type Booking } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/States";
import { formatDate, formatPrice, useErrorToast } from "@/lib/format";

export default function BookingsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toCancel, setToCancel] = useState<Booking | null>(null);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bookings"],
    queryFn: api.getBookings,
    enabled: !!user,
  });
  useErrorToast(error);

  const cancel = useMutation({
    mutationFn: (id: Booking["id"]) => api.cancelBooking(id),
    onSuccess: () => {
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setToCancel(null),
  });

  if (!ready || !user) return <LoadingState />;

  return (
    <div>
      <PageHeader title="My bookings" subtitle="Your tickets, all in one place." />
      {isLoading ? (
        <LoadingState label="Loading bookings…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No bookings yet">
          <Link to="/" className="text-accent hover:underline">
            Browse events
          </Link>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.event?.title}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {b.event ? formatDate(b.event.date) : "—"}
                  </TableCell>
                  <TableCell>{b.quantity}</TableCell>
                  <TableCell>{formatPrice(b.totalPrice)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={b.status === "confirmed" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {b.status === "confirmed" && (
                      <Button size="sm" variant="outline" onClick={() => setToCancel(b)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!toCancel} onOpenChange={(o) => !o && setToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {toCancel &&
                `${toCancel.quantity} ticket(s) for "${toCancel.event?.title}" will be released.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancel.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toCancel) cancel.mutate(toCancel.id);
              }}
            >
              {cancel.isPending ? "Cancelling…" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
