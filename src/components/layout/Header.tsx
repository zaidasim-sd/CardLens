import { NavLink } from "react-router-dom";
import { Scan, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Scan Card", to: "/", icon: Scan },
  { name: "Review Queue", to: "/verified", icon: ListChecks },
];

export default function Header() {
  return (
    <header className="relative fixed inset-x-0 top-0 z-40 flex h-20 sm:h-22 shrink-0 items-center justify-between border-b border-border/80 bg-background/95 px-3 sm:px-6 md:px-8 backdrop-blur-md md:sticky">
      {/* Official CardSnap by V71 Logo Area (Left-most, Enlarged & Professional) */}
      <div className="flex items-center justify-start shrink-0">
        <NavLink
          to="/"
          className="flex items-center py-1.5 hover:opacity-90 transition-opacity min-w-0"
          title="CardSnap by Vision71"
        >
          <img
            src="/CardSnapLogo_Black.png"
            alt="CardSnap by Vision71"
            className="h-14 sm:h-16 md:h-17 w-auto object-contain select-none dark:invert transition-transform hover:scale-[1.02]"
          />
        </NavLink>
      </div>

      {/* Navigation Links - Centered on Desktop (Hidden on Mobile, Mobile uses fixed bottom nav bar) */}
      <nav className="hidden md:flex md:absolute md:left-1/2 md:-translate-x-1/2 items-center gap-1.5 bg-slate-100/80 dark:bg-slate-900/80 p-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                )
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

    </header>
  );
}
