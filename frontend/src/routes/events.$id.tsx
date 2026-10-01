import { createFileRoute } from "@tanstack/react-router";
import EventDetailsPage from "@/pages/EventDetailsPage";

export const Route = createFileRoute("/events/$id")({
  head: () => ({
    meta: [
      { title: "Event details — EventTix" },
      { name: "description", content: "Event details and ticket booking on EventTix." },
      { property: "og:title", content: "Event details — EventTix" },
      { property: "og:description", content: "Event details and ticket booking on EventTix." },
    ],
  }),
  component: EventRoute,
});

function EventRoute() {
  const { id } = Route.useParams();
  return <EventDetailsPage id={id} />;
}
