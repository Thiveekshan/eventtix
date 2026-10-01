import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api/client";
import { AuthCard, FieldError } from "@/components/AuthCard";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: api.register,
    onSuccess: () => {
      toast.success("Account created — please log in");
      navigate({ to: "/login" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse(form);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    m.mutate(r.data);
  };

  const field = (k: keyof Form, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        type={type}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
      <FieldError msg={errors[k]} />
    </div>
  );

  return (
    <AuthCard title="Create account" subtitle="Join EventTix in seconds">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {field("name", "Name")}
        {field("email", "Email", "email")}
        {field("password", "Password", "password")}
        <Button type="submit" variant="accent" className="w-full" disabled={m.isPending}>
          {m.isPending ? "Creating…" : "Register"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
