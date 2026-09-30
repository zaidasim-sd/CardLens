import { NavLink } from "react-router-dom";
import { Scan, ListChecks, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";

const navItems = [
  { name: "Scan Card", to: "/", icon: Scan, roles: ["exhibition_assistant"] },
  { name: "Review Queue", to: "/submissions", icon: ListChecks, roles: ["exhibition_assistant", "aventure_reviewer"] },
  { name: "Users", to: "/users", icon: Users, roles: ["vision71_administrator"] },
];

export default function MobileNav() {
  const { user } = useAuth();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.75rem+env(safe-area-inset-bottom,0px))] shrink-0 items-center justify-around border-t border-slate-200/90 bg-white/95 px-3 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden dark:bg-slate-900/95 dark:border-slate-800">
      {navItems
        .filter((item) => user && item.roles.includes(user.role))
        .map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 min-w-0 items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer",
                  isActive
                    ? "bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/60 dark:text-blue-300"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate">{item.name}</span>
            </NavLink>
          );
        })}
    </nav>
  );
}
