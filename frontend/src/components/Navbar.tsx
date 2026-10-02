import { Link, useNavigate } from "@tanstack/react-router";
import { Ticket, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const linkCls =
  "rounded-md px-3 py-2 text-sm font-medium text-primary-foreground/75 hover:text-primary-foreground transition-colors";
const activeCls = { className: "text-primary-foreground bg-primary-foreground/10" };

export function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-primary shadow-md">
      <nav className="container mx-auto flex h-16 items-center gap-2 px-4">
        <Link
          to="/"
          className="mr-4 flex items-center gap-2 text-lg font-bold text-primary-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
            <Ticket className="h-4 w-4 text-accent-foreground" />
          </span>
          <span>EventTix</span>
        </Link>
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          <Link to="/" className={linkCls} activeProps={activeCls} activeOptions={{ exact: true }}>
            Events
          </Link>
          {user && (
            <Link to="/bookings" className={linkCls} activeProps={activeCls}>
              My Bookings
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className={linkCls} activeProps={activeCls}>
              Admin
            </Link>
          )}
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-primary-foreground/70 sm:inline">{user.name}</span>
            <Button
              variant="nav"
              size="sm"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        ) : (
          <Button asChild variant="accent" size="sm">
            <Link to="/login">Login</Link>
          </Button>
        )}
      </nav>
    </header>
  );
}
