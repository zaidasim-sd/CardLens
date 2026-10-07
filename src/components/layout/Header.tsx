import { NavLink } from "react-router-dom";
import { ScanLine, ClipboardList, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import UserProfileDropdown from "./UserProfileDropdown";
import pilot from "@/config/pilot";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { name: "Scan Card", to: "/scan", icon: ScanLine, roles: ["exhibition_assistant", "vision71_administrator"] },
  { name: "Review Queue", to: "/submissions", icon: ClipboardList, roles: ["exhibition_assistant", "aventure_reviewer"] },
  { name: "User accounts", to: "/users", icon: Users, roles: ["vision71_administrator"] },
];

export default function Header() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:bg-slate-900/95 dark:border-slate-800">
      <div className="portal-nav">
      {/* Brand Logo - Left */}
      <div className="flex items-center justify-start shrink-0 min-w-0">
        <NavLink
          to="/"
          className="flex items-center hover:opacity-90 transition-opacity"
          title="Lead71 by Vision71"
        >
          <img
            src="/lead71-logo.svg"
            alt="Lead71 by Vision71"
            className="portal-logo w-auto object-contain select-none  transition-transform hover:scale-[1.01]"
          />
        </NavLink>
      </div>

      {/* Center Nav Links on Desktop */}
      <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/60 shadow-xs">
        {navItems
          // SUBMISSION-ONLY PILOT: retain Review Queue navigation for restoration.
          .filter((item) => user && item.roles.includes(user.role) && (!pilot.submissionOnlyEnabled || item.to !== "/submissions") && (pilot.internalReviewEnabled || user.role !== "aventure_reviewer"))
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                state={item.to === "/scan" ? { openCamera: true } : undefined}
                className={({ isActive }) =>
                  cn(
                    item.to === "/scan" && "portal-scan-link",
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-white text-[#147c92] shadow-xs font-semibold dark:bg-slate-900 dark:text-blue-300"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80"
                  )
                }
              >
                <Icon className="w-4 h-4 text-[#269bb2] dark:text-blue-400" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
      </nav>

      {/* Right Side: Profile & Avatar Dropdown (Desktop & Mobile) */}
      <div className="flex items-center justify-end shrink-0 gap-2">
        {!user && <ThemeToggle />}
        {user && (
          <>
            {/* Desktop Profile Trigger with user name */}
            <div className="hidden sm:block">
              <UserProfileDropdown />
            </div>

            {/* Mobile Profile Trigger */}
            <div className="sm:hidden">
              <UserProfileDropdown isMobileCompact />
            </div>
          </>
        )}
      </div>
      </div>
    </header>
  );
}
