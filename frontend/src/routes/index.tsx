import { createFileRoute } from "@tanstack/react-router";
import EventsPage from "@/pages/EventsPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Events — EventTix" },
      { name: "description", content: "Browse upcoming events and book tickets on EventTix." },
      { property: "og:title", content: "Events — EventTix" },
      {
        property: "og:description",
        content: "Browse upcoming events and book tickets on EventTix.",
      },
    ],
  }),
  component: EventsPage,
});
