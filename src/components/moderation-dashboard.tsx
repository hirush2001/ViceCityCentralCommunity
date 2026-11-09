"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, Flag, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Role = "admin" | "moderator";
type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";
type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: "post" | "comment";
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  details: string;
  status: ReportStatus;
  created_at: string;
  moderator_note: string | null;
};
type ProfileRow = { id: string; username: string; display_name: string | null };
type PostRow = { id: string; author_id: string; title: string; body: string };
type CommentRow = { id: string; author_id: string; post_id: string; body: string };
type EnrichedReport = ReportRow & {
  reporter: ProfileRow | null;
  targetAuthor: ProfileRow | null;
  targetTitle: string;
  targetBody: string;
  postId: string | null;
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pending",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed"
};
const REASON_LABELS: Record<string, string> = {
  spam: "Spam or misleading content",
  harassment: "Harassment or bullying",
  hate_or_abuse: "Hate speech or abusive content",
  sexual_content: "Sexual or explicit content",
  violence: "Threats or graphic violence",
  misinformation: "False or misleading information",
  copyright: "Copyright or ownership concern",
  other: "Other"
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export default function ModerationDashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<EnrichedReport[]>([]);
  const [filter, setFilter] = useState<"all" | ReportStatus>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReports = useCallback(async () => {
    if (!userId || !role) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error: reportsError } = await supabase
      .from("reports")
      .select("id, reporter_id, target_type, post_id, comment_id, reason, details, status, created_at, moderator_note")
      .order("created_at", { ascending: false })
      .limit(200);

    if (reportsError) {
      setError(reportsError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ReportRow[];
    const commentIds = rows.map((row) => row.comment_id).filter((id): id is string => Boolean(id));
    const directPostIds = rows.map((row) => row.post_id).filter((id): id is string => Boolean(id));
    const [commentsResult] = commentIds.length
      ? await Promise.all([supabase.from("comments").select("id, author_id, post_id, body").in("id", commentIds)])
      : [{ data: [], error: null }];
    if (commentsResult.error) {
      setError(commentsResult.error.message);
      setLoading(false);
      return;
    }
    const comments = (commentsResult.data ?? []) as CommentRow[];
    const postIds = Array.from(new Set([...directPostIds, ...comments.map((item) => item.post_id)]));
    const { data: postData, error: postsError } = postIds.length
      ? await supabase.from("posts").select("id, author_id, title, body").in("id", postIds)
      : { data: [], error: null };
    if (postsError) {
      setError(postsError.message);
      setLoading(false);
      return;
    }
    const posts = (postData ?? []) as PostRow[];
    const profileIds = Array.from(new Set([
      ...rows.map((row) => row.reporter_id),
      ...posts.map((post) => post.author_id),
      ...comments.map((comment) => comment.author_id)
    ]));
    const { data: profileData, error: profilesError } = profileIds.length
      ? await supabase.from("profiles").select("id, username, display_name").in("id", profileIds)
      : { data: [], error: null };
    if (profilesError) {
      setError(profilesError.message);
      setLoading(false);
      return;
    }

    const postMap = new Map((posts as PostRow[]).map((item) => [item.id, item]));
    const commentMap = new Map(comments.map((item) => [item.id, item]));
    const profileMap = new Map(((profileData ?? []) as ProfileRow[]).map((item) => [item.id, item]));
    const enriched: EnrichedReport[] = rows.map((row) => {
      if (row.target_type === "post") {
        const target = row.post_id ? postMap.get(row.post_id) : undefined;
        return {
          ...row,
          reporter: profileMap.get(row.reporter_id) ?? null,
          targetAuthor: target ? profileMap.get(target.author_id) ?? null : null,
          targetTitle: target?.title ?? "Post no longer available",
          targetBody: target?.body ?? "",
          postId: target?.id ?? row.post_id
        };
      }
      const target = row.comment_id ? commentMap.get(row.comment_id) : undefined;
      const parentPost = target ? postMap.get(target.post_id) : undefined;
      return {
        ...row,
        reporter: profileMap.get(row.reporter_id) ?? null,
        targetAuthor: target ? profileMap.get(target.author_id) ?? null : null,
        targetTitle: parentPost ? `Comment on: ${parentPost.title}` : "Comment on a discussion",
        targetBody: target?.body ?? "Comment no longer available",
        postId: target?.post_id ?? null
      };
    });
    setReports(enriched);
    setLoading(false);
  }, [userId, role]);

  useEffect(() => {
    let active = true;
    async function loadAccount() {
      if (!isSupabaseConfigured()) {
        setError("Supabase is not configured.");
        setAuthLoading(false);
        return;
      }
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError) setError(authError.message);
      if (!authData.user) {
        setAuthLoading(false);
        return;
      }
      setUserId(authData.user.id);
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (!active) return;
      if (roleError) setError(roleError.message);
      if (roleData?.role === "admin" || roleData?.role === "moderator") setRole(roleData.role);
      setAuthLoading(false);
    }
    void loadAccount();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (userId && role) void loadReports();
  }, [userId, role, loadReports]);

  const visibleReports = useMemo(() => filter === "all" ? reports : reports.filter((item) => item.status === filter), [reports, filter]);
  const pendingCount = reports.filter((item) => item.status === "pending").length;
  const reviewingCount = reports.filter((item) => item.status === "reviewing").length;

  async function updateStatus(report: EnrichedReport, status: ReportStatus) {
    if (!userId || busyId) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    const { error: updateError } = await createClient()
      .from("reports")
      .update({
        status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        moderator_note: (notes[report.id] ?? report.moderator_note ?? "").trim() || null
      })
      .eq("id", report.id);
    if (updateError) {
      setError(updateError.message);
      setBusyId(null);
      return;
    }
    setNotice(`Report marked ${STATUS_LABELS[status].toLowerCase()}.`);
    setBusyId(null);
    await loadReports();
  }

  return (
    <main className="profile-page-shell moderation-page-shell">
      <header className="profile-page-header">
        <Link href="/#community" className="profile-back-link"><ArrowLeft size={15} /> BACK TO COMMUNITY</Link>
        <Link href="/" className="profile-brand">VICE CITY <b>CENTRAL</b></Link>
      </header>
      <div className="profile-page-content moderation-page-content">
        <section className="moderation-dashboard-card">
          <div className="moderation-heading">
            <div><span className="profile-kicker">COMMUNITY OPERATIONS</span><h1>Moderation <em>desk.</em></h1><p>Review member reports and keep the community welcoming.</p></div>
            {role && <span className="moderation-role-pill"><ShieldCheck size={13} /> {role.toUpperCase()}</span>}
          </div>
          {authLoading ? <div className="profile-state">Checking your account permissions...</div> : !userId ? (
            <div className="moderation-empty"><ShieldAlert size={28}/><h2>Sign in required</h2><p>Sign in with an authorised moderation account to continue.</p><Link href="/#community" className="button button-primary">Return to community</Link></div>
          ) : !role ? (
            <div className="moderation-empty"><ShieldAlert size={28}/><h2>Restricted area</h2><p>Your account does not have a moderator or administrator role. Ask an existing administrator to grant access.</p></div>
          ) : (
            <>
              <div className="moderation-stats">
                <div><span>PENDING</span><strong>{pendingCount}</strong></div>
                <div><span>IN REVIEW</span><strong>{reviewingCount}</strong></div>
                <div><span>REPORTS LOADED</span><strong>{reports.length}</strong></div>
              </div>
              <div className="moderation-toolbar">
                <div><strong>Report queue</strong><span>Latest 200 reports</span></div>
                <select value={filter} onChange={(event) => setFilter(event.target.value as "all" | ReportStatus)} aria-label="Filter reports">
                  <option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All reports</option>
                </select>
              </div>
              {error && <div className="moderation-message moderation-error">{error}</div>}
              {notice && <div className="moderation-message moderation-success">{notice}</div>}
              {loading ? <div className="profile-state">Loading reports...</div> : visibleReports.length === 0 ? (
                <div className="moderation-empty"><CheckCircle2 size={28}/><h2>No reports in this view</h2><p>There are no reports matching the selected status.</p></div>
              ) : (
                <div className="moderation-report-list">
                  {visibleReports.map((report) => {
                    const reporterName = report.reporter?.display_name || report.reporter?.username || "Community member";
                    const authorName = report.targetAuthor?.display_name || report.targetAuthor?.username || "Unavailable member";
                    return (
                      <article className="moderation-report-card" key={report.id}>
                        <div className="moderation-report-top"><span className={`moderation-status status-${report.status}`}>{STATUS_LABELS[report.status]}</span><span>{formatDate(report.created_at)}</span></div>
                        <div className="moderation-report-reason"><Flag size={14}/><strong>{REASON_LABELS[report.reason] || report.reason}</strong><small>{report.target_type.toUpperCase()} REPORT</small></div>
                        <div className="moderation-target"><span>REPORTED CONTENT</span><strong>{report.targetTitle}</strong><p>{report.targetBody || "The original content is no longer available."}</p><small>Content author: {authorName}</small>{report.postId && <Link href={`/#post-${report.postId}`}><ExternalLink size={12}/> Open discussion</Link>}</div>
                        <div className="moderation-report-meta"><span>Reported by <strong>{reporterName}</strong></span><span>Report ID: {report.id.slice(0, 8)}</span></div>
                        {report.details && <div className="moderation-reporter-details"><span>REPORTER DETAILS</span><p>{report.details}</p></div>}
                        <label className="moderation-note-label">Moderator note <textarea value={notes[report.id] ?? report.moderator_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Optional internal note for the moderation record..." /></label>
                        <div className="moderation-actions">
                          <button type="button" onClick={() => void updateStatus(report, "reviewing")} disabled={busyId === report.id || report.status === "reviewing"}><Clock3 size={13}/> Review</button>
                          <button type="button" className="moderation-resolve" onClick={() => void updateStatus(report, "resolved")} disabled={busyId === report.id || report.status === "resolved"}><CheckCircle2 size={13}/> Resolve</button>
                          <button type="button" className="moderation-dismiss" onClick={() => void updateStatus(report, "dismissed")} disabled={busyId === report.id || report.status === "dismissed"}><XCircle size={13}/> Dismiss</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <footer className="profile-page-footer">VICE CITY CENTRAL · MODERATION ACCESS IS RESTRICTED</footer>
    </main>
  );
}
