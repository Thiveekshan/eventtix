import { createFileRoute } from "@tanstack/react-router";
import AdminPage from "@/pages/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — EventTix" },
      { name: "description", content: "Manage EventTix events." },
      { property: "og:title", content: "Admin — EventTix" },
      { property: "og:description", content: "Manage EventTix events." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});
