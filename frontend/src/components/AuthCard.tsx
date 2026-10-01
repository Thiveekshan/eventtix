import type { ReactNode } from "react";
import { Ticket } from "lucide-react";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-8 shadow-card">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
          <Ticket className="h-5 w-5 text-primary-foreground" />
        </span>
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function FieldError({ msg }: { msg?: string | undefined }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}
