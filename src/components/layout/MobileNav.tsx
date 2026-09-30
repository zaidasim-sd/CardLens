import { NavLink } from "react-router-dom";
import { Scan, ListChecks, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";

const navItems = [
  { name: "Scan Card", to: "/", icon: Scan, roles: ["exhibition_assistant"] },
  { name: "Submissions", to: "/submissions", icon: ListChecks, roles: ["exhibition_assistant"] },
  { name: "Users", to: "/users", icon: Users, roles: ["vision71_administrator"] },
];

export default function MobileNav() {
  const { user } = useAuth();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom,0px))] shrink-0 items-center justify-around border-t border-border/80 bg-background/95 px-4 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden">
      {navItems.filter((item) => user && item.roles.includes(user.role)).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex min-h-12 min-w-0 items-center justify-center gap-2 w-full px-2 py-2 text-xs font-semibold rounded-full transition-all duration-200 mx-1 cursor-pointer",
                isActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )
            }

          >
            <Icon className="w-4 h-4" />
            <span className="tracking-tight">{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
