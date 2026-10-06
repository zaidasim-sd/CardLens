import { useState, useRef, useEffect } from "react";
import { LogOut, LoaderCircle, ChevronDown, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type Role } from "@/auth/AuthContext";
import { cn } from "@/lib/utils";

const roleLabels: Record<Role, { title: string; badgeClass: string }> = {
  exhibition_assistant: {
    title: "Exhibition Assistant",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  },
  aventure_reviewer: {
    title: "Reviewer",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  },
  vision71_administrator: {
    title: "System Administrator",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  },
  vision71_support: {
    title: "Technical Support",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
};

function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface UserProfileDropdownProps {
  className?: string;
  isMobileCompact?: boolean;
}

export default function UserProfileDropdown({ className, isMobileCompact = false }: UserProfileDropdownProps) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      toast.error("Could not complete sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!user) return null;

  const initials = getInitials(user.name);
  const roleConfig = roleLabels[user.role] || {
    title: user.role,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div ref={dropdownRef} className={cn("relative inline-block text-left", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isSigningOut}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "group flex items-center gap-2 rounded-full p-1 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40",
          open ? "bg-slate-100 ring-2 ring-blue-500/20 dark:bg-slate-800" : "hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
        )}
      >
        {/* Avatar Ring */}
        <div className="relative flex h-9 w-9 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[#e8f6f8] !text-[#147c92] text-white font-bold text-xs border border-[#cce9ee] ring-2 ring-white dark:ring-slate-900 transition-transform group-hover:scale-105">
          <span>{initials}</span>
        </div>

        {/* Name and Chevron (Visible on desktop or when expanded) */}
        {!isMobileCompact && (
          <div className="hidden sm:flex items-center gap-1.5 pr-2 pl-0.5 text-left">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
              {user.name.split(" ")[0] || user.name}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 dark:text-slate-500",
                open && "rotate-180 text-blue-600"
              )}
            />
          </div>
        )}

        {isMobileCompact && (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:text-slate-600",
              open && "rotate-180 text-blue-600"
            )}
          />
        )}
      </button>

      {/* Floating Dropdown Menu */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-slate-200/90 bg-white/98 p-2.5 shadow-2xl shadow-slate-900/15 backdrop-blur-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150 dark:bg-slate-900/98 dark:border-slate-800 dark:shadow-black/40"
        >
          {/* User Info Header */}
          <div className="flex items-start gap-3 rounded-xl bg-slate-50/80 p-3.5 dark:bg-slate-800/50">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e8f6f8] !text-[#147c92] text-white font-bold text-sm shadow-md ring-2 ring-white dark:ring-slate-800">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white" title={user.name}>
                  {user.name}
                </p>
              </div>

              {/* Role Badge */}
              <div className="mt-1 flex items-center">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
                    roleConfig.badgeClass
                  )}
                >
                  {roleConfig.title}
                </span>
              </div>

              {/* Email */}
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            </div>
          </div>

          {/* Section Divider */}
          <div className="my-2 border-t border-slate-100 dark:border-slate-800" />

          {/* Logout Button */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            className="signout-action flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 active:bg-red-100/80 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <span className="signout-icon" aria-hidden="true">
              {isSigningOut
                ? <LoaderCircle className="signout-spinner h-4 w-4" />
                : <LogOut className="signout-door h-4 w-4" />}
            </span>
            <span role="status">{isSigningOut ? "Signing out…" : "Sign out of Lead71"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
