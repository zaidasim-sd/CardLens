import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const label = `Switch to ${dark ? "light" : "dark"} mode`;
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label}
      onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
