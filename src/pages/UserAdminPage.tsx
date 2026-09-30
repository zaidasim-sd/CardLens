import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type Role, type SignedInUser } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { cardApi } from "@/lib/cardApi";

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
  const [retentionHours, setRetentionHours] = useState(24);
  const [recordId, setRecordId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/users", { credentials: "include" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setUsers(body.users);
  }, []);
  useEffect(() => { if (user?.role === "aventure_administrator") { void load().catch((error) => setMessage(error.message)); void apiFetch("/api/retention").then((body) => setRetentionHours(body.retentionHours)).catch((error) => setMessage(error.message)); } }, [load, user]);
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

  async function saveRetention(event: FormEvent) {
    event.preventDefault();
    try {
      const body = await apiFetch("/api/retention", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retentionHours }) });
      setRetentionHours(body.retentionHours);
      setMessage("Retention updated.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Retention could not be updated."); }
  }

  async function deleteRecord(event: FormEvent) {
    event.preventDefault();
    try { await cardApi.delete(recordId.trim()); setRecordId(""); setMessage("Record deleted."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "The record could not be deleted."); }
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
    <form onSubmit={saveRetention} className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Card image retention</h2><p className="text-sm text-muted-foreground">Choose 0 to discard images immediately or a value up to 168 hours.</p><Label htmlFor="retention">Retention hours</Label><Input id="retention" type="number" min={0} max={168} step={1} value={retentionHours} onChange={(event) => setRetentionHours(Number(event.target.value))} required /><Button>Save retention</Button></form>
    <form onSubmit={deleteRecord} className="space-y-3 rounded-xl border border-red-200 bg-white p-5"><h2 className="text-xl font-semibold">Delete a record</h2><p className="text-sm text-muted-foreground">Enter the CardSnap record ID from the approved request.</p><Label htmlFor="recordId">Record ID</Label><Input id="recordId" value={recordId} onChange={(event) => setRecordId(event.target.value)} required /><Button variant="destructive">Delete record and image</Button></form>
  </section>;
}
