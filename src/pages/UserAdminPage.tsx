import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type Role, type SignedInUser } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { ConstantContactSettings } from "@/components/ConstantContactSettings";
import "./admin.css";
import { cardApi } from "@/lib/cardApi";
import { cn } from "@/lib/utils";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Shield,
  Clock,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  Scan,
  ListChecks,
  LifeBuoy,
  RefreshCw,
  FileSpreadsheet,
  User as UserIcon,
  Check,
} from "lucide-react";

// Temporarily hidden admin tools. Set to true to restore all three sections.
const SHOW_ADVANCED_ADMIN_TOOLS = false;

interface RoleOption {
  value: Role;
  label: string;
  badgeLabel: string;
  description: string;
  icon: typeof Scan;
  badgeClass: string;
}

const roleOptions: RoleOption[] = [
  {
    value: "exhibition_assistant",
    label: "Capturer",
    badgeLabel: "Exhibition Assistant",
    description: "Captures business cards and submits drafts during the event",
    icon: Scan,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  },
  {
    value: "aventure_reviewer",
    label: "Reviewer",
    badgeLabel: "Aventure Reviewer",
    description: "Reviews submitted cards and requests corrections in the queue",
    icon: ListChecks,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    value: "vision71_administrator",
    label: "Administrator",
    badgeLabel: "System admin",
    description: "Full management of named accounts, retention, and export queues",
    icon: ShieldCheck,
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  },
  {
    value: "vision71_support",
    label: "Vision71 Support",
    badgeLabel: "Technical Support",
    description: "Temporary operational support account with 24-hour expiration",
    icon: LifeBuoy,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
];

function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function UserAdminPage() {
  const { user, csrfToken } = useAuth();
  const [users, setUsers] = useState<SignedInUser[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "exhibition_assistant" as Role,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  const toggleRoleDropdown = () => {
    if (!roleDropdownOpen && roleDropdownRef.current) {
      const rect = roleDropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropUp(spaceBelow < 260 && spaceAbove > 260);
    }
    setRoleDropdownOpen((prev) => !prev);
  };

  const [retentionHours, setRetentionHours] = useState(24);
  const [recordId, setRecordId] = useState("");
  const [userToRemove, setUserToRemove] = useState<SignedInUser | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setRoleDropdownOpen(false);
      }
    }
    if (roleDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [roleDropdownOpen]);

  const load = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/users", { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to load accounts.");
      setUsers(body.users || []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to load accounts." });
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "vision71_administrator") {
      void load();
      void apiFetch("/api/retention")
        .then((body) => setRetentionHours(body.retentionHours))
        .catch(() => {});
    }
  }, [load, user]);

  if (user?.role !== "vision71_administrator") return <Navigate to="/" replace />;

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create account.");
      setForm({ name: "", email: "", password: "", role: "exhibition_assistant" });
      setMessage({ type: "success", text: `Account for ${body.user?.name || "user"} created successfully.` });
      await load();
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "Account creation failed." });
    } finally {
      setCreating(false);
    }
  }

  async function confirmRemove() {
    if (!userToRemove) return;
    const id = userToRemove.id;
    setRemovingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not remove account.");
      setMessage({ type: "success", text: `Account ${userToRemove.name} removed.` });
      setUserToRemove(null);
      await load();
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "Failed to remove account." });
    } finally {
      setRemovingId(null);
    }
  }

  async function saveRetention(event: FormEvent) {
    event.preventDefault();
    setSavingRetention(true);
    setMessage(null);
    try {
      const body = await apiFetch("/api/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionHours }),
      });
      setRetentionHours(body.retentionHours);
      setMessage({ type: "success", text: `Card image retention set to ${body.retentionHours} hours.` });
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "Retention could not be updated." });
    } finally {
      setSavingRetention(false);
    }
  }

  async function deleteRecord(event: FormEvent) {
    event.preventDefault();
    setDeletingRecord(true);
    setMessage(null);
    try {
      await cardApi.delete(recordId.trim());
      setRecordId("");
      setMessage({ type: "success", text: "Record and its associated card image deleted permanently." });
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "The record could not be deleted." });
    } finally {
      setDeletingRecord(false);
    }
  }

  async function downloadApproved() {
    setExporting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/export", { credentials: "include" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "The CSV could not be created.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lead71-approved-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "Approved contacts exported to CSV." });
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "Export failed." });
    } finally {
      setExporting(false);
    }
  }

  const teamMembers = users.filter(account => account.role !== "vision71_administrator");

  const selectedRoleOption = roleOptions.find((r) => r.value === form.role) || roleOptions[0];
  const SelectedIcon = selectedRoleOption.icon;

  return (
    <div className="admin-page mx-auto max-w-4xl space-y-5 py-4 sm:py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <Shield className="h-4 w-4" />
            <span>Administration Console</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Team & settings
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Manage your team, card storage, and approved contact transfers.
          </p>
        </div>

        {/* Quick Refresh */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loadingUsers}
          className="self-start sm:self-auto h-9 text-xs gap-1.5 rounded-xl border-slate-200 dark:border-slate-700"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loadingUsers && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Global Status Banner */}
      {message && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2.5 rounded-2xl border p-4 text-xs font-medium animate-in fade-in-50 duration-150",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
              : "border-red-200 bg-red-50/90 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200"
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          )}
          <span className="leading-relaxed">{message.text}</span>
        </div>
      )}

      {/* ── Section 1: Create Account Card ── */}
      <div
        className={cn(
          "rounded-2xl border border-slate-200/90 bg-white/95 p-4 sm:p-6 shadow-2xs dark:bg-slate-900/95 dark:border-slate-800 relative transition-all",
          roleDropdownOpen ? "z-40" : "z-10"
        )}
      >
        <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Add team member</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose their access and set a temporary password.</p>
          </div>
        </div>

        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Full Name
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <UserIcon className="h-4 w-4" />
                </div>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Alex Morgan"
                  required
                  className="h-10 pl-9.5 text-sm rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50"
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-1.5">
              <Label htmlFor="newEmail" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Email Address
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <Input
                  id="newEmail"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="name@vision71tech.com"
                  required
                  autoComplete="off"
                  className="h-10 pl-9.5 text-sm rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50"
                />
              </div>
            </div>

            {/* Temporary Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="newPassword" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Temporary password
                </Label>
                <span className="text-[11px] text-slate-400">Min. 12 chars</span>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  minLength={11}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="••••••••••••"
                  required
                  autoComplete="new-password"
                  className="h-10 pl-9.5 pr-10 text-sm rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Premium Role Dropdown */}
            <div className="space-y-1.5" ref={roleDropdownRef}>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Access role
              </Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleRoleDropdown}
                  aria-expanded={roleDropdownOpen}
                  aria-haspopup="listbox"
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-left text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800/50",
                    roleDropdownOpen && "border-blue-600 ring-2 ring-blue-600/20 bg-white dark:bg-slate-800"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <SelectedIcon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-slate-900 dark:text-white truncate">
                      {selectedRoleOption.badgeLabel}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                      roleDropdownOpen && "rotate-180 text-blue-600"
                    )}
                  />
                </button>

                {/* Dropdown Menu */}
                {roleDropdownOpen && (
                  <div
                    role="listbox"
                    className={cn(
                      "absolute left-0 right-0 z-50 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-100 dark:bg-slate-900 dark:border-slate-800 dark:ring-white/10 max-h-80 overflow-y-auto",
                      dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
                    )}
                  >
                    {roleOptions.map((option) => {
                      const Icon = option.icon;
                      const isSelected = form.role === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setForm({ ...form, role: option.value });
                            setRoleDropdownOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                            isSelected
                              ? "bg-blue-50/80 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200"
                              : "hover:bg-slate-50 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60"
                          )}
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                {option.badgeLabel}
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                              {option.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={creating}
              className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm active:scale-[0.99] transition-all cursor-pointer disabled:opacity-70"
            >
              {creating ? (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  <span>Create named account</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* ── Section 2: Active Accounts List ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 sm:p-6 shadow-2xs dark:bg-slate-900/95 dark:border-slate-800 relative z-0">
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Team members</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {loadingUsers ? "Loading team members…" : `${teamMembers.length} ${teamMembers.length === 1 ? "member" : "members"} in your team`}
              </p>
            </div>
          </div>
        </div>

        {loadingUsers ? (
          <div role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500"><RefreshCw className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" /><span>Loading team members…</span></div>
        ) : teamMembers.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">No team members yet. Add your first member above.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {teamMembers.map((account) => {
              const initials = getInitials(account.name);
              const opt = roleOptions.find((r) => r.value === account.role) || roleOptions[0];
              const isCurrentUser = account.id === user.id || account.email.toLowerCase() === user.email.toLowerCase();
              const isAli = account.email.toLowerCase() === "az@vision71tech.com";
              const isProtected = isCurrentUser || isAli;

              return (
                <li
                  key={account.id}
                  className="admin-member flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* User Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-800 font-bold text-xs shadow-xs ring-2 ring-white dark:ring-slate-800">
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {account.name}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                            opt.badgeClass
                          )}
                        >
                          {opt.badgeLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                        {account.email}
                      </p>
                    </div>
                  </div>

                  {/* Actions / Protection Badge */}
                  <div className="flex items-center shrink-0">
                    {!isProtected && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={removingId === account.id}
                        onClick={() => setUserToRemove(account)}
                        className="h-8 px-2.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        <span>Remove</span>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Section 3: Retention Policy Card (temporarily hidden) ── */}
      {SHOW_ADVANCED_ADMIN_TOOLS && (
      <form
        onSubmit={saveRetention}
        className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 sm:p-6 shadow-2xs dark:bg-slate-900/95 dark:border-slate-800 relative z-0"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Card image storage</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose how long card images are kept. Use 0 to discard immediately; up to 7 days.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-full sm:w-48">
            <Label htmlFor="retention" className="sr-only">Retention hours</Label>
            <div className="relative">
              <Input
                id="retention"
                type="number"
                min={0}
                max={168}
                step={1}
                value={retentionHours}
                onChange={(event) => setRetentionHours(Number(event.target.value))}
                required
                className="h-10 pr-12 text-sm rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/50"
              />
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-semibold text-slate-400">
                hours
              </span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[0, 24, 72, 168].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => setRetentionHours(hours)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border",
                  retentionHours === hours
                    ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                )}
              >
                {hours === 0 ? "Discard now" : `${hours}h`}
              </button>
            ))}
          </div>

          <Button
            type="submit"
            disabled={savingRetention}
            className="sm:ml-auto h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
          >
            {savingRetention ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </form>
      )}

      {/* ── Section 5: Approved Contacts CSV Export ── */}
      {/* Temporarily hidden; restore with SHOW_ADVANCED_ADMIN_TOOLS. */}
      {SHOW_ADVANCED_ADMIN_TOOLS && <ConstantContactSettings />}

      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 sm:p-6 shadow-2xs dark:bg-slate-900/95 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Approved contacts export</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 max-w-lg">
                Downloads approved exhibition contacts from the Google Sheet as a backup CSV export.
              </p>
            </div>
          </div>

          <Button
            type="button"
            disabled={exporting}
            onClick={() => void downloadApproved()}
            className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm active:scale-[0.99] transition-all cursor-pointer self-start sm:self-auto shrink-0"
          >
            {exporting ? (
              <>
                <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                <span>Preparing CSV...</span>
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                <span>Download Approved CSV</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Section 4: Delete a Record Card (temporarily hidden) ── */}
      {SHOW_ADVANCED_ADMIN_TOOLS && (
      <form
        onSubmit={deleteRecord}
        className="rounded-2xl border border-red-200 bg-white p-4 sm:p-6 shadow-2xs dark:bg-red-950/10 dark:border-red-900/60"
      >
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300">
            <Trash2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-red-950 dark:text-red-200">Delete a card record</h2>
            <p className="text-xs text-slate-500 dark:text-red-300/80">
              Permanently purges a record and its associated card image using the Lead71 record ID.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <Label htmlFor="recordId" className="sr-only">Record ID</Label>
            <Input
              id="recordId"
              value={recordId}
              onChange={(event) => setRecordId(event.target.value)}
              placeholder="e.g. 660f78a2e4b0a1b2c3d4e5f6"
              required
              className="h-10 text-sm rounded-xl border-red-200 bg-white focus:border-red-600 focus:ring-2 focus:ring-red-600/20 dark:bg-slate-900 dark:border-red-900"
            />
          </div>
          <Button
            type="submit"
            variant="destructive"
            disabled={deletingRecord}
            className="h-10 px-4 rounded-xl text-xs font-semibold cursor-pointer"
          >
            {deletingRecord ? "Deleting..." : "Delete record & image"}
          </Button>
        </div>
      </form>
      )}

      {/* ── Confirmation Modal for Account Removal ── */}
      {userToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-xs animate-in fade-in-0 duration-150">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:bg-slate-900 dark:border-slate-800">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <Trash2 className="h-6 w-6" />
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Remove team account?
              </h3>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to remove <strong className="text-slate-700 dark:text-slate-200">{userToRemove.name}</strong> ({userToRemove.email})? Their sessions will be invalidated immediately.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUserToRemove(null)}
                className="flex-1 h-10 rounded-xl text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={Boolean(removingId)}
                onClick={() => void confirmRemove()}
                className="flex-1 h-10 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {removingId ? "Removing..." : "Yes, remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
