"use client";

import { useState } from "react";
import Link from "next/link";
import { HoneypotField } from "@/components/HoneypotField";

interface Job {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string | null;
  description: string;
}

export default function JobDetail({ job }: { job: Job }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/public/jobs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSlug: job.slug, ...form, _company: company }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to submit application");
      }
    } catch {
      setError("Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link href="/jobs" className="text-sm text-secondary mb-4" style={{ display: "inline-block" }}>
        ← Back to Jobs
      </Link>

      <h1 className="page-header">{job.title}</h1>
      <div className="flex gap-2 items-center mb-4">
        <span className="badge badge-info">{job.department}</span>
        {job.location && <span className="text-sm text-secondary">📍 {job.location}</span>}
      </div>

      <div className="card mb-4">
        {job.description.split("\n").map((line, i) => (
          <p key={i} style={{ margin: "8px 0" }}>
            {line || "\u00A0"}
          </p>
        ))}
      </div>

      {success ? (
        <div className="card" style={{ borderColor: "var(--color-success)" }}>
          <h3 className="text-success">Application Submitted!</h3>
          <p className="text-secondary mt-2">
            Thank you for your interest. We will review your application and get back to you.
          </p>
        </div>
      ) : (
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Apply for this Position
          </h2>
          {error && <p className="text-danger mb-2">{error}</p>}
          <form onSubmit={handleSubmit}>
            <HoneypotField value={company} onChange={setCompany} />
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input
                className="form-input"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
