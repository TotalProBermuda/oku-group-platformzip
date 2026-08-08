import JobDetail from "./JobDetail";

interface Job {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string | null;
  description: string;
}

async function getJob(slug: string): Promise<Job | null> {
  const base = process.env.APP_BASE_URL || "http://localhost:5000";
  const res = await fetch(`${base}/api/v1/public/jobs?slug=${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  return json.ok ? json.data : null;
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getJob(slug);

  if (!job) {
    return <div className="empty-state">Job not found.</div>;
  }

  return <JobDetail job={job} />;
}
