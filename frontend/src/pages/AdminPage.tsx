import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { api, type EventInput, type EventItem } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { EventFormDialog } from "@/components/EventFormDialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/States";
import { formatDate, formatPrice, useErrorToast } from "@/lib/format";

export default function AdminPage() {
  const { ready, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [toDelete, setToDelete] = useState<EventItem | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["events"],
    queryFn: api.getEvents,
    enabled: isAdmin,
  });
  useErrorToast(error);

  const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });

  const save = useMutation({
    mutationFn: (b: EventInput) => (editing ? api.updateEvent(editing.id, b) : api.createEvent(b)),
    onSuccess: () => {
      toast.success(editing ? "Event updated" : "Event created");
      setFormOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: EventItem["id"]) => api.deleteEvent(id),
    onSuccess: () => {
      toast.success("Event deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setToDelete(null),
  });

  if (!ready) return <LoadingState />;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-xl font-bold text-primary">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
        <Button asChild variant="accent" className="mt-6">
          <Link to="/">Back to events</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Manage events"
        subtitle="Create, edit and remove events."
        action={
          <Button
            variant="accent"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Create event
          </Button>
        }
      />
      {isLoading ? (
        <LoadingState label="Loading events…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No events yet">Create your first event to get started.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">{ev.title}</TableCell>
                  <TableCell>{ev.venue}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(ev.date)}</TableCell>
                  <TableCell>{formatPrice(ev.price)}</TableCell>
                  <TableCell>
                    {ev.seatsAvailable} / {ev.capacity}
                  </TableCell>
                  <TableCell className="space-x-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(ev);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setToDelete(ev)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editing}
        saving={save.isPending}
        onSubmit={(b) => save.mutate(b)}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Events with active bookings can't be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) del.mutate(toDelete.id);
              }}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
