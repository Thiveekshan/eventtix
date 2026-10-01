import { useEffect } from "react";
import { toast } from "sonner";

export const formatPrice = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();

/** Shows an error toast whenever a query error appears. */
export function useErrorToast(error: unknown) {
  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : "Something went wrong");
  }, [error]);
}
