import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { requireUserId } from "@/lib/requireUserId";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Handshake, Plus, Trash2, Link2, AlertCircle } from "lucide-react";

export function PartnersPage() {
  const { user } = useAuth();
  const uid = requireUserId(user);

  const contacts = useQuery(
    api.queries.partners.listContacts,
    uid ? { userId: uid } : "skip"
  );
  const connections = useQuery(
    api.queries.partners.listConnections,
    uid ? { userId: uid } : "skip"
  );

  const addContact = useMutation(api.mutations.partners.addContact);
  const removeContact = useMutation(api.mutations.partners.removeContact);
  const connectByEmail = useMutation(api.mutations.partners.connectByEmail);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [connectEmail, setConnectEmail] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  if (!user || contacts === undefined || connections === undefined) return <PageLoader />;

  const handleAdd = async () => {
    if (!uid || !name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await addContact({ userId: uid, name: name.trim(), email: email.trim(), notes: notes.trim() || undefined });
      setName("");
      setEmail("");
      setNotes("");
      setShowAdd(false);
      setToast({ message: "Contact added", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message ?? "Failed to add", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!uid || !connectEmail.trim()) return;
    setConnecting(true);
    setConnectResult(null);
    try {
      const result = await connectByEmail({ userId: uid, email: connectEmail.trim() });
      if (result.success) {
        setConnectResult(`Connected to ${result.companyName}!`);
        setConnectEmail("");
      } else if (result.reason === "not_found") {
        setConnectResult("No owner account found with that email.");
      } else if (result.reason === "same_company") {
        setConnectResult("That email belongs to your own company.");
      } else if (result.reason === "already_connected") {
        setConnectResult("Already connected to that company.");
      }
    } catch (err: any) {
      setConnectResult(err.message ?? "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleRemove = async (contactId: typeof contacts[number]["_id"]) => {
    if (!uid) return;
    try {
      await removeContact({ userId: uid, contactId });
    } catch (err: any) {
      setToast({ message: err.message ?? "Failed to remove", type: "error" });
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Partners"
        description="Manage partner contacts and connections for job sharing"
        action={
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        }
      />

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Connect by email */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary-600" /> Connect by Email
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Enter a partner owner's email to establish a connection for job sharing.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={connectEmail}
            onChange={(e) => setConnectEmail(e.target.value)}
            placeholder="partner@example.com"
            className="input-field flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
          <button
            onClick={handleConnect}
            disabled={connecting || !connectEmail.trim()}
            className="btn-primary"
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </div>
        {connectResult && (
          <div className={`mt-2 text-sm flex items-center gap-1.5 ${
            connectResult.includes("Connected") ? "text-green-700" : "text-amber-700"
          }`}>
            <AlertCircle className="w-4 h-4" /> {connectResult}
          </div>
        )}
      </div>

      {/* Active connections */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Active Connections</h2>
        {connections.length === 0 ? (
          <p className="text-sm text-gray-400">No connections yet. Use the form above to connect with a partner.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div key={conn._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{conn.companyName}</p>
                  <p className="text-xs text-gray-400">Connected {new Date(conn.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="badge bg-green-100 text-green-700">Connected</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contacts list */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Partner Contacts</h2>
        {contacts.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No contacts yet"
            description="Add partner owner contacts to share jobs with"
          />
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-sm text-gray-500">{c.email}</p>
                  {c.notes && <p className="text-xs text-gray-400 mt-0.5">{c.notes}</p>}
                </div>
                <button
                  onClick={() => handleRemove(c._id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  title="Remove contact"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add contact modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Partner Contact</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="owner@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-field"
                  rows={2}
                  placeholder="Any notes about this partner..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleAdd}
                disabled={saving || !name.trim() || !email.trim()}
                className="btn-primary"
              >
                {saving ? "Adding..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
