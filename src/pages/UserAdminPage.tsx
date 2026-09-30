import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type Role, type SignedInUser } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const roleLabels: Record<Role, string> = {
  exhibition_assistant: "Exhibition Assistant",
  aventure_reviewer: "Aventure Reviewer",
  aventure_administrator: "Aventure Administrator",
  vision71_support: "Vision71 Support",
};

export default function UserAdminPage() {
  const { user, csrfToken } = useAuth();
  const [users, setUsers] = useState<SignedInUser[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "exhibition_assistant" as Role });
  const load = useCallback(async () => {
    const response = await fetch("/api/users", { credentials: "include" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setUsers(body.users);
  }, []);
  useEffect(() => { if (user?.role === "aventure_administrator") void load().catch((error) => setMessage(error.message)); }, [load, user]);
  if (user?.role !== "aventure_administrator") return <Navigate to="/" replace />;

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/users", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(form) });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error);
    setForm({ name: "", email: "", password: "", role: "exhibition_assistant" });
    setMessage("Account created.");
    await load();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include", headers: { "X-CSRF-Token": csrfToken } });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error);
    setMessage("Account removed.");
    await load();
  }

  return <section className="mx-auto max-w-4xl space-y-8 py-8">
    <div><h1 className="text-3xl font-semibold">User accounts</h1><p className="mt-2 text-sm text-muted-foreground">Create and remove named accounts for this organisation.</p></div>
    <form onSubmit={create} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
      <div><Label htmlFor="name">Name</Label><Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
      <div><Label htmlFor="newEmail">Email</Label><Input id="newEmail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></div>
      <div><Label htmlFor="newPassword">Temporary password</Label><Input id="newPassword" type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></div>
      <div><Label htmlFor="role">Role</Label><select id="role" className="flex h-10 w-full rounded-md border bg-transparent px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <Button className="sm:col-span-2">Create account</Button>
    </form>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    <ul className="space-y-3">{users.map((account) => <li key={account.id} className="flex items-center justify-between rounded-xl border bg-white p-4"><div><p className="font-semibold">{account.name}</p><p className="text-sm text-muted-foreground">{account.email} · {roleLabels[account.role]}</p></div><Button type="button" variant="destructive" onClick={() => void remove(account.id)}>Remove</Button></li>)}</ul>
  </section>;
}
