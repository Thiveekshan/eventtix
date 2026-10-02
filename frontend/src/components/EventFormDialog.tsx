import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventInput, EventItem } from "@/api/client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: EventItem | null;
  saving: boolean;
  onSubmit: (data: EventInput) => void;
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

const empty = { title: "", description: "", venue: "", date: "", price: "", capacity: "" };

export function EventFormDialog({ open, onOpenChange, event, saving, onSubmit }: Props) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      event
        ? {
            title: event.title,
            description: event.description,
            venue: event.venue,
            date: toLocalInput(event.date),
            price: String(event.price),
            capacity: String(event.capacity),
          }
        : empty,
    );
  }, [open, event]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs["title"] = "Title is required";
    if (!form.venue.trim()) errs["venue"] = "Venue is required";
    if (!form.date) errs["date"] = "Date is required";
    if (form.price === "" || Number(form.price) < 0) errs["price"] = "Enter a valid price";
    if (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1)
      errs["capacity"] = "Capacity must be at least 1";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({
      title: form.title.trim(),
      description: form.description.trim(),
      venue: form.venue.trim(),
      date: new Date(form.date).toISOString(),
      price: Number(form.price),
      capacity: Number(form.capacity),
    });
  };

  const field = (k: keyof typeof empty, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={set(k)} {...props} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Create event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {field("title", "Title")}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={set("description")}
            />
          </div>
          {field("venue", "Venue")}
          {field("date", "Date & time", { type: "datetime-local" })}
          <div className="grid grid-cols-2 gap-4">
            {field("price", "Price", { type: "number", min: 0, step: "0.01" })}
            {field("capacity", "Capacity", { type: "number", min: 1, step: 1 })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={saving}>
              {saving ? "Saving…" : event ? "Save changes" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
