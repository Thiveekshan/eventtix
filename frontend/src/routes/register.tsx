import { createFileRoute } from "@tanstack/react-router";
import RegisterPage from "@/pages/RegisterPage";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — EventTix" },
      { name: "description", content: "Create an EventTix account to start booking tickets." },
      { property: "og:title", content: "Register — EventTix" },
      {
        property: "og:description",
        content: "Create an EventTix account to start booking tickets.",
      },
    ],
  }),
  component: RegisterPage,
});
