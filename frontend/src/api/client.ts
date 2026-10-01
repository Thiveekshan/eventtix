// All REST API calls for EventTix live here.
export const API_URL: string =
  (import.meta.env["VITE_API_URL"] as string | undefined) || "http://localhost:3000";

export const TOKEN_KEY = "eventtix_token";
export const USER_KEY = "eventtix_user";

export type Role = "user" | "admin";
export interface User {
  id: string | number;
  name: string;
  email: string;
  role: Role;
}
export interface EventItem {
  id: string | number;
  title: string;
  description: string;
  venue: string;
  date: string;
  price: number;
  capacity: number;
  seatsAvailable: number;
}
export type EventInput = Omit<EventItem, "id" | "seatsAvailable">;
export interface Booking {
  id: string | number;
  event: { id: string | number; title: string; date: string; venue: string };
  quantity: number;
  totalPrice: number;
  status: string;
  createdAt: string;
}
export interface Health {
  status: string;
  database: string;
}
export interface VersionInfo {
  version: string;
  build: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Cannot reach the API. Is the server running?", 0);
  }

  if (res.status === 401 && !path.startsWith("/auth/")) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "/login";
    throw new ApiError("Your session has expired. Please log in again.", 401);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && typeof data.error === "string" && data.error) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  register: (b: { name: string; email: string; password: string }) =>
    request<{ user: User }>("/auth/register", { method: "POST", body: json(b) }),
  login: (b: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: json(b) }),

  getEvents: () => request<EventItem[]>("/events"),
  getEvent: (id: string) => request<EventItem>(`/events/${id}`),
  createEvent: (b: EventInput) => request<EventItem>("/events", { method: "POST", body: json(b) }),
  updateEvent: (id: string | number, b: EventInput) =>
    request<EventItem>(`/events/${id}`, { method: "PUT", body: json(b) }),
  deleteEvent: (id: string | number) => request<void>(`/events/${id}`, { method: "DELETE" }),

  createBooking: (b: { eventId: string | number; quantity: number }) =>
    request<unknown>("/bookings", { method: "POST", body: json(b) }),
  getBookings: () => request<Booking[]>("/bookings"),
  cancelBooking: (id: string | number) => request<Booking>(`/bookings/${id}`, { method: "DELETE" }),

  health: () => request<Health>("/health"),
  version: () => request<VersionInfo>("/version"),
};
