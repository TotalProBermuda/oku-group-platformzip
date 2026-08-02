"use client";

import { useState, useCallback, useEffect } from "react";

interface InfluencerUser {
  id: string;
  name: string | null;
  email: string;
  influencer: {
    id: string;
    handle: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    commissionRateBps: number;
    refCode: string;
  } | null;
}

interface Assignment {
  id: string;
  roleLabel: string;
  isPubliclyVisible: boolean;
  influencer: {
    id: string;
    handle: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    commissionRateBps: number;
    refCode: string;
    user: { id: string; name: string | null; email: string };
  };
}

interface PendingInvite {
  id: string;
  invitedEmail: string;
  invitedName: string;
  commissionRateBps: number;
  status: string;
  expiresAt: string;
}

interface Props {
  seriesId: string;
  isSuperAdmin?: boolean;
}

export default function SeriesInfluencerManager({ seriesId, isSuperAdmin }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showAssign, setShowAssign] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<InfluencerUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<InfluencerUser | null>(null);
  const [commissionPct, setCommissionPct] = useState("10");

  const [inviteForm, setInviteForm] = useState({ name: "", email: "", commissionPct: "10" });
  const [inviting, setInviting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/series/${seriesId}/influencers`);
    const data = await res.json();
    if (data.ok) {
      setAssignments(data.assignments);
      setInvites(data.invites);
    }
    setLoading(false);
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  const searchInfluencers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    const res = await fetch(`/api/v1/admin/influencer-invites/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.ok) setSearchResults(data.users);
  }, []);

  async function assign() {
    if (!selectedUser?.influencer) return;
    setAssigning(true); setError(""); setSuccess("");
    const res = await fetch(`/api/v1/admin/series/${seriesId}/influencers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencerProfileId: selectedUser.influencer.id,
        commissionRateBps: Math.round(Number(commissionPct) * 100),
      }),
    });
    const data = await res.json();
    setAssigning(false);
    if (data.ok) {
      setSuccess("Influencer assigned successfully");
      setShowAssign(false);
      setSelectedUser(null);
      setSearchQ("");
      setSearchResults([]);
      await load();
    } else {
      setError(data.error ?? "Failed to assign");
    }
  }

  async function removeAssignment(id: string) {
    if (!confirm("Remove this influencer from the series?")) return;
    setError("");
    const res = await fetch(`/api/v1/admin/series/${seriesId}/influencers/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else setError("Failed to remove");
  }

  async function sendInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) { setError("Name and email are required"); return; }
    setInviting(true); setError(""); setSuccess("");
    const res = await fetch("/api/v1/admin/influencer-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitedName: inviteForm.name,
        invitedEmail: inviteForm.email,
        commissionPct: Number(inviteForm.commissionPct),
        seriesId,
      }),
    });
    const data = await res.json();
    setInviting(false);
    if (data.ok) {
      setSuccess("Invitation sent successfully");
      setShowInvite(false);
      setInviteForm({ name: "", email: "", commissionPct: "10" });
      await load();
    } else {
      setError(data.error ?? "Failed to send invite");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8",
    borderRadius: 8, fontSize: 14, boxSizing: "border-box" as const,
  };

  if (loading) return <div className="loading-dots"><span /><span /><span /></div>;

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 16 }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", color: "#16a34a", marginBottom: 16 }}>{success}</div>}

      {assignments.length === 0 && invites.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎤</div>
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>No influencers assigned</div>
          <p style={{ fontSize: 14 }}>Assign an existing influencer or invite a new one to this series.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {assignments.map((a) => (
            <div key={a.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {a.influencer.profileImageUrl ? (
                  <img src={a.influencer.profileImageUrl} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #c41e3a, #7c0d1f)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 16 }}>
                    {(a.influencer.displayName ?? a.influencer.user.name ?? "?")[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1614" }}>
                    {a.influencer.displayName ?? a.influencer.user.name ?? a.influencer.user.email}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    {a.influencer.handle && (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>@{a.influencer.handle}</span>
                    )}
                    <span style={{ fontSize: 11, background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                      Active
                    </span>
                    <span style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 10 }}>
                      {a.influencer.commissionRateBps / 100}% commission
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeAssignment(a.id)}
                className="btn btn-ghost btn-sm"
                style={{ color: "#dc2626", flexShrink: 0 }}
              >
                Remove
              </button>
            </div>
          ))}

          {invites.map((inv) => (
            <div key={inv.id} style={{ background: "#fffbf5", border: "1px dashed #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  ✉️
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1614" }}>{inv.invitedName}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>{inv.invitedEmail}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                      Invited — Pending
                    </span>
                    <span style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 10 }}>
                      {inv.commissionRateBps / 100}% commission
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>
                Expires {new Date(inv.expiresAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {!showAssign && !showInvite && (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowAssign(true); setShowInvite(false); }}>
            + Assign Existing
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setShowInvite(true); setShowAssign(false); }}>
            ✉️ Invite New Influencer
          </button>
        </div>
      )}

      {showAssign && (
        <div style={{ background: "#f8f5f3", border: "1px solid #e5e0d8", borderRadius: 12, padding: 20, marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Assign Existing Influencer</div>
          <div style={{ marginBottom: 12 }}>
            <input
              style={inputStyle}
              placeholder="Search by name, email, or handle…"
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); searchInfluencers(e.target.value); }}
            />
            {searchResults.length > 0 && !selectedUser && (
              <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setSearchQ(u.influencer?.displayName ?? u.name ?? u.email); setSearchResults([]); if (u.influencer) setCommissionPct(String(u.influencer.commissionRateBps / 100)); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                  >
                    {u.influencer?.profileImageUrl ? (
                      <img src={u.influencer.profileImageUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e5e0d8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>
                        {(u.name ?? u.email)[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{u.influencer?.displayName ?? u.name ?? u.email}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{u.email}{u.influencer?.handle ? ` · @${u.influencer.handle}` : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchQ && searchResults.length === 0 && !selectedUser && (
              <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6b7280" }}>No matches found.</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowAssign(false); setShowInvite(true); setInviteForm((f) => ({ ...f, email: searchQ.includes("@") ? searchQ : "" })); }}
                >
                  Invite New Instead →
                </button>
              </div>
            )}
          </div>

          {selectedUser && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Commission Rate (%)</label>
              <div style={{ position: "relative", maxWidth: 160 }}>
                <input
                  type="number" min={0} max={100} step={0.5}
                  style={{ ...inputStyle }}
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#9ca3af" }}>%</span>
              </div>
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>This will update the influencer's commission rate.</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={assigning || !selectedUser} onClick={assign}>
              {assigning ? "Assigning…" : "Assign"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAssign(false); setSelectedUser(null); setSearchQ(""); setSearchResults([]); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showInvite && (
        <div style={{ background: "#f8f5f3", border: "1px solid #e5e0d8", borderRadius: 12, padding: 20, marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Invite New Influencer</div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>They'll receive a branded onboarding email with a link to set up their creator profile.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Full Name *</label>
              <input style={inputStyle} value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sofia Medina" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Email *</label>
              <input type="email" style={inputStyle} value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="influencer@example.com" />
            </div>
          </div>

          <div style={{ marginBottom: 16, maxWidth: 200 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Commission Rate (%)</label>
            <div style={{ position: "relative" }}>
              <input
                type="number" min={0} max={100} step={0.5}
                style={inputStyle}
                value={inviteForm.commissionPct}
                onChange={(e) => setInviteForm((f) => ({ ...f, commissionPct: e.target.value }))}
              />
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#9ca3af" }}>%</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={inviting} onClick={sendInvite}>
              {inviting ? "Sending…" : "Send Invitation"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowInvite(false); setInviteForm({ name: "", email: "", commissionPct: "10" }); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
