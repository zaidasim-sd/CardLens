import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle({ inProfile = false, disabled = false, menuItem = inProfile }: { inProfile?: boolean; disabled?: boolean; menuItem?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const label = `Switch to ${dark ? "light" : "dark"} mode`;
  return (
    <button type="button" disabled={disabled}
      className={inProfile
        ? "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39b3c8] disabled:opacity-60"
        : "theme-toggle"}
      role={menuItem ? "menuitem" : undefined} aria-label={label} title={label}
      onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun size={inProfile ? 16 : 18} aria-hidden="true" /> : <Moon size={inProfile ? 16 : 18} aria-hidden="true" />}
      {inProfile && <span>{label}</span>}
    </button>
  );
}
