"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MediaUpload from "@/components/ui/MediaUpload";

interface InviteData {
  id: string;
  invitedEmail: string;
  invitedName: string;
  commissionPct: number;
  series: { id: string; title: string; heroImageUrl: string | null } | null;
  expiresAt: string;
}

type Step = "account" | "payout" | "profile" | "social" | "contact" | "done";

const STEPS: Step[] = ["account", "payout", "profile", "social", "contact", "done"];
const STEP_LABELS: Record<Step, string> = {
  account: "Account",
  payout: "Payout",
  profile: "Profile",
  social: "Social",
  contact: "Contact",
  done: "Done",
};

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("account");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [payoutError, setPayoutError] = useState("");
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    profileImageUrl: "",
    shortBio: "",
    instagramUrl: "",
    tiktokUrl: "",
    websiteUrl: "",
    whatsapp: "",
    preferredLanguage: "English",
    bankName: "",
    accountHolderName: "",
    accountType: "CHECKING",
    currency: "USD",
    swiftBic: "",
    bankAccountNumber: "",
    bankAccountNumberConfirmation: "",
    payoutAuthorization: false,
  });

  useEffect(() => {
    if (!token) { setLoadError("No invite token provided."); return; }
    fetch(`/api/v1/influencer/accept-invite?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setInvite(d.invite);
          setForm((f) => ({ ...f, name: d.invite.invitedName, email: d.invite.invitedEmail }));
        } else {
          setLoadError(d.error ?? "Invalid or expired invite link.");
        }
      })
      .catch(() => setLoadError("Failed to load invite."));
  }, [token]);

  type TextFormField = Exclude<keyof typeof form, "payoutAuthorization">;

  function f(key: TextFormField) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((p) => ({ ...p, [key]: e.target.value })),
    };
  }

  async function submit() {
    setSaving(true); setSubmitError("");
    try {
    const res = await fetch(`/api/v1/influencer/accept-invite?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.ok) {
      setPayoutStatus(data.payoutSetup?.status ?? "MISSING_INFO");
      setStep("done");
    } else {
      setSubmitError(data.error ?? "Something went wrong. Please try again.");
    }
    } catch {
      setSubmitError("Could not submit your details. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function continueToProfile() {
    setPayoutError("");
    if (!form.payoutAuthorization) {
      setPayoutError("Confirm the bank-details authorization to continue.");
      return;
    }
    if (!form.bankName.trim() || !form.accountHolderName.trim()) {
      setPayoutError("Enter your bank and account holder name.");
      return;
    }
    if (form.bankAccountNumber.replace(/[\s-]/g, "").length < 5) {
      setPayoutError("Enter a valid bank account number.");
      return;
    }
    if (form.bankAccountNumber.replace(/[\s-]/g, "") !== form.bankAccountNumberConfirmation.replace(/[\s-]/g, "")) {
      setPayoutError("The account numbers do not match.");
      return;
    }
    setStep("profile");
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", border: "1px solid #e5e0d8",
    borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" as const,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase" as const, color: "#374151", marginBottom: 8,
  };

  const currentStepIndex = STEPS.indexOf(step);

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafaf9", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "#1a1614", marginBottom: 12 }}>Invite Link Issue</h1>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>{loadError}</p>
          <Link href="/" style={{ color: "#c41e3a", fontSize: 14 }}>← Return to OKÜ</Link>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafaf9", padding: 24 }}>
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #c41e3a, #7c0d1f)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>
            🎉
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 34, fontWeight: 400, color: "#1a1614", marginBottom: 12 }}>
            Welcome to OKÜ, {form.name.split(" ")[0]}!
          </h1>
          <p style={{ color: "#6b7280", fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
            {payoutStatus === "READY_FOR_REVIEW"
              ? "Your bank details were securely saved and submitted to OKÜ Finance for review. Commission payouts remain blocked until Finance verifies the account."
              : "Your bank details were securely saved, but the payout profile still has a requirement or hold to resolve. OKÜ Finance must clear it and verify the account before any payout can be made."} You can sign in to your portal to view your assignments, commission ledger, and referral link.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/login" style={{ display: "inline-block", background: "#c41e3a", color: "white", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 15 }}>
              Sign In to Your Portal
            </Link>
            <Link href="/account/influencer-profile" style={{ display: "inline-block", background: "white", border: "1px solid #e5e0d8", color: "#1a1614", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 15 }}>
              Complete Your Profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fafaf9" }}>
      <div style={{ background: "#1a1614", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#c41e3a", fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>OKÜ</span>
        <span style={{ color: "#9ca3af", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", paddingTop: 3 }}>HOSPITALITY GROUP</span>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c41e3a", marginBottom: 8 }}>Creator Invitation</p>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 400, color: "#1a1614", margin: "0 0 16px" }}>
            Set Up Your Creator Profile
          </h1>
          {invite.series && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e5e0d8", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
              <span>📅</span>
              <span style={{ color: "#6b7280" }}>Invited for:</span>
              <strong style={{ color: "#1a1614" }}>{invite.series.title}</strong>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 40, background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
          {STEPS.filter((s) => s !== "done").map((s, idx) => (
            <div key={s} style={{ flex: 1, padding: "14px 0", textAlign: "center", background: currentStepIndex >= idx ? "#1a1614" : "white", borderRight: "1px solid #e5e0d8", cursor: "default" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: currentStepIndex >= idx ? "#c41e3a" : "#9ca3af" }}>{idx + 1}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: currentStepIndex >= idx ? "white" : "#6b7280" }}>{STEP_LABELS[s]}</div>
            </div>
          ))}
        </div>

        {submitError && (
          <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 24 }}>
            {submitError}
          </div>
        )}

        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "32px" }}>
          {step === "account" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 6 }}>Your Account</h2>
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>Confirm or update your name and email. This is how you&apos;ll sign in.</p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Full Name</label>
                <input style={inputStyle} {...f("name")} placeholder="Your full name" />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Email Address</label>
                <input type="email" style={inputStyle} {...f("email")} readOnly aria-readonly="true" />
                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>This invitation is tied to this email address. Use it to sign in to OKÜ.</p>
              </div>

              <div style={{ background: "#f8f5f3", borderRadius: 10, padding: "16px 20px", marginBottom: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#c41e3a", marginBottom: 6 }}>Commission Rate</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1614" }}>{invite.commissionPct}%</div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>Applied to ticket revenue attributed to you.</p>
              </div>

              <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setStep("payout")}>
                Continue to payout setup →
              </button>
            </div>
          )}

          {step === "payout" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 6 }}>How you receive commission</h2>
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
                OKÜ pays eligible commissions by online bank transfer only. Add the account where you want commission payments sent.
              </p>

              <div style={{ background: "#f8f5f3", border: "1px solid #eee7df", borderRadius: 10, padding: "14px 16px", marginBottom: 24, fontSize: 13, color: "#5b514a", lineHeight: 1.6 }}>
                Your account number is encrypted in storage and masked after submission. OKÜ Finance must review and verify your bank details before any payout can be included in a payment batch. We do not ask for ID here; supporting documents will be requested only if a documented bank or legal requirement applies.
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Bank name</label>
                <input autoComplete="organization" style={inputStyle} {...f("bankName")} placeholder="Name of your bank" />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Account holder name</label>
                <input autoComplete="name" style={inputStyle} {...f("accountHolderName")} placeholder="Exactly as registered with your bank" />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Account type</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} {...f("accountType")}>
                  <option value="CHECKING">Checking</option>
                  <option value="SAVINGS">Savings</option>
                </select>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Account currency</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} {...f("currency")}>
                  <option value="USD">USD — current OKÜ payout currency</option>
                </select>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Bank account number</label>
                <input type="text" inputMode="text" autoComplete="off" spellCheck={false} style={inputStyle} {...f("bankAccountNumber")} placeholder="Enter account number" />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Confirm bank account number</label>
                <input type="text" inputMode="text" autoComplete="off" spellCheck={false} style={inputStyle} {...f("bankAccountNumberConfirmation")} placeholder="Enter the same account number again" />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>SWIFT / BIC <span style={{ fontWeight: 400, textTransform: "none", fontSize: 11, color: "#9ca3af" }}>(optional; provide it if your bank requires it)</span></label>
                <input autoComplete="off" style={inputStyle} {...f("swiftBic")} placeholder="8 or 11 characters" />
              </div>

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#5b514a", lineHeight: 1.5, marginBottom: 24 }}>
                <input
                  type="checkbox"
                  checked={form.payoutAuthorization}
                  onChange={(e) => setForm((p) => ({ ...p, payoutAuthorization: e.target.checked }))}
                  style={{ marginTop: 3 }}
                />
                <span>I confirm I am authorized to provide these bank details and authorize OKÜ to securely store and use them to administer commission payouts. I understand that submission does not authorize a payout; Finance review is required first.</span>
              </label>

              {payoutError && (
                <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 20 }}>
                  {payoutError}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep("account")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={continueToProfile}>Continue to profile →</button>
              </div>
            </div>
          )}

          {step === "profile" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 6 }}>Profile Photo & Bio</h2>
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>This is what guests see when you&apos;re featured for an event.</p>

              <div style={{ marginBottom: 20 }}>
                <MediaUpload
                  label="Profile Photo"
                  value={form.profileImageUrl || ""}
                  onChange={(url) => setForm((p) => ({ ...p, profileImageUrl: url }))
                  aspectRatio="square"
                  mediaType="image"
                  maxSizeMB={5}
                />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Short Bio <span style={{ fontWeight: 400, textTransform: "none", fontSize: 11, color: "#9ca3af" }}>(1–2 sentences shown on event pages)</span></label>
                <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} {...f("shortBio")} placeholder="e.g. Panama-based lifestyle creator specializing in food and travel experiences." />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep("account")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep("social")}>Continue →</button>
              </div>
            </div>
          )}

          {step === "social" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 6 }}>Social Media & Website</h2>
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>Add your social profiles so OKÜ can feature and tag you correctly.</p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Instagram</label>
                <input type="url" style={inputStyle} {...f("instagramUrl")} placeholder="https://instagram.com/@yourhandle" />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>TikTok</label>
                <input type="url" style={inputStyle} {...f("tiktokUrl")} placeholder="https://tiktok.com/@yourhandle" />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Website</label>
                <input type="url" style={inputStyle} {...f("websiteUrl")} placeholder="https://yourwebsite.com" />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep("profile")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep("contact")}>Continue →</button>
              </div>
            </div>
          )}

          {step === "contact" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 6 }}>WhatsApp & Language</h2>
              <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>OKÜ uses WhatsApp for quick coordination. This is kept private and never shared publicly.</p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>WhatsApp Number</label>
                <input type="tel" style={inputStyle} {...f("whatsapp")} placeholder="+507 6000 0000" />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Preferred Language</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} {...f("preferredLanguage")}>
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep("social")}>← Back</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={saving}
                  onClick={submit}
                >
                  {saving ? "Setting up your profile…" : "Complete Profile Setup"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
