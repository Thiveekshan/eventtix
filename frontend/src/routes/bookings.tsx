import { createFileRoute } from "@tanstack/react-router";
import BookingsPage from "@/pages/BookingsPage";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "My bookings — EventTix" },
      { name: "description", content: "View and cancel your EventTix ticket bookings." },
      { property: "og:title", content: "My bookings — EventTix" },
      { property: "og:description", content: "View and cancel your EventTix ticket bookings." },
    ],
  }),
  component: BookingsPage,
});
