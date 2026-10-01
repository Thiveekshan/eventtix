import { createFileRoute } from "@tanstack/react-router";
import LoginPage from "@/pages/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — EventTix" },
      { name: "description", content: "Log in to EventTix to book and manage tickets." },
      { property: "og:title", content: "Log in — EventTix" },
      { property: "og:description", content: "Log in to EventTix to book and manage tickets." },
    ],
  }),
  component: LoginPage,
});
