
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ThumbsUp,
  Users,
  Vote
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import styles from "./admin-dashboard.module.css";

type AdminRole = "admin" | "moderator";

type SupabaseClientType = ReturnType<typeof createClient>;

type DashboardStats = {
  members: number;
  published_posts: number;
  published_comments: number;
  likes: number;
  polls: number;
  pending_reports: number;
  reviewing_reports: number;
  resolved_reports: number;
  dismissed_reports: number;
};

type PostActivityRow = {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  created_at: string;
};

type CommentActivityRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type ActivityItem = {
  id: string;
  kind: "discussion" | "comment";
  author: string;
  text: string;
  created_at: string;
};

const EMPTY_STATS: DashboardStats = {
  members: 0,
  published_posts: 0,
  published_comments: 0,
  likes: 0,
  polls: 0,
  pending_reports: 0,
  reviewing_reports: 0,
  resolved_reports: 0,
  dismissed_reports: 0
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function AdminDashboard() {
  // Supabase is deliberately initialized only in the browser.
  // This prevents Next.js prerendering from throwing an error.

  const [supabase, setSupabase] =
    useState<SupabaseClientType | null>(null);

  const [role, setRole] = useState<AdminRole | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const [stats, setStats] =
    useState<DashboardStats>(EMPTY_STATS);

  const [activity, setActivity] =
    useState<ActivityItem[]>([]);

  const [error, setError] = useState("");

  const [lastUpdated, setLastUpdated] =
    useState<string | null>(null);

  // ==========================================
  // LOAD ADMIN DASHBOARD DATA
  // ==========================================

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [
        statsResult,
        postsResult,
        commentsResult
      ] = await Promise.all([
        supabase.rpc("get_admin_dashboard_stats"),

        supabase
          .from("posts")
          .select("id, author_id, title, body, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(8),

        supabase
          .from("comments")
          .select("id, author_id, body, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(8)
      ]);

      const firstError =
        statsResult.error ||
        postsResult.error ||
        commentsResult.error;

      if (firstError) {
        setError(firstError.message);
        return;
      }

      // Update dashboard statistics.

      const nextStats: DashboardStats = {
        ...EMPTY_STATS,
        ...(statsResult.data as Partial<DashboardStats> | null)
      };

      setStats(nextStats);

      const posts =
        (postsResult.data ?? []) as PostActivityRow[];

      const comments =
        (commentsResult.data ?? []) as CommentActivityRow[];

      // Collect unique authors.

      const authorIds = Array.from(
        new Set([
          ...posts.map((item) => item.author_id),
          ...comments.map((item) => item.author_id)
        ])
      );

      // Retrieve profile information.

      const profileResult = authorIds.length
        ? await supabase
            .from("profiles")
            .select("id, username, display_name")
            .in("id", authorIds)
        : {
            data: [] as ProfileRow[],
            error: null
          };

      if (profileResult.error) {
        setError(profileResult.error.message);
        return;
      }

      const profiles =
        (profileResult.data ?? []) as ProfileRow[];

      const profileMap = new Map<string, string>(
        profiles.map((profile) => [
          profile.id,
          profile.display_name ||
            profile.username ||
            "Vice City member"
        ])
      );

      // Convert posts into activity items.

      const postItems: ActivityItem[] = posts.map((post) => ({
        id: `post-${post.id}`,
        kind: "discussion",
        author:
          profileMap.get(post.author_id) ||
          "Vice City member",
        text: post.title?.trim() || post.body,
        created_at: post.created_at
      }));

      // Convert comments into activity items.

      const commentItems: ActivityItem[] = comments.map(
        (comment) => ({
          id: `comment-${comment.id}`,
          kind: "comment",
          author:
            profileMap.get(comment.author_id) ||
            "Vice City member",
          text: comment.body,
          created_at: comment.created_at
        })
      );

      // Combine and sort recent activity.

      const recent = [
        ...postItems,
        ...commentItems
      ]
        .sort(
          (a, b) =>
            Date.parse(b.created_at) -
            Date.parse(a.created_at)
        )
        .slice(0, 10);

      setActivity(recent);

      setLastUpdated(new Date().toISOString());

    } catch (err) {
      console.error("Admin dashboard error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard data."
      );

    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // ==========================================
  // INITIALIZE SUPABASE AND CHECK ADMIN ACCESS
  // ==========================================

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        // Check environment configuration first.

        if (!isSupabaseConfigured()) {
          if (active) {
            setError(
              "Supabase is not configured. Please check your environment variables."
            );

            setAuthLoading(false);
          }

          return;
        }

        // Create Supabase client only after browser mounting.

        const client = createClient();

        if (!active) {
          return;
        }

        setSupabase(client);

        // Verify authenticated user.

        const {
          data: authData,
          error: authError
        } = await client.auth.getUser();

        if (!active) {
          return;
        }

        if (authError) {
          setError(authError.message);
          setAuthLoading(false);
          return;
        }

        // Require an authenticated account.

        if (!authData.user) {
          setRole(null);
          setAuthLoading(false);
          return;
        }

        // Retrieve the user's authorization role.

        const {
          data: roleData,
          error: roleError
        } = await client
          .from("user_roles")
          .select("role")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (!active) {
          return;
        }

        if (roleError) {
          setError(roleError.message);

        } else if (
          roleData?.role === "admin" ||
          roleData?.role === "moderator"
        ) {
          setRole(roleData.role);

        } else {
          setRole(null);
        }

        setAuthLoading(false);

      } catch (err) {
        console.error("Admin authentication error:", err);

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to verify administrator access."
          );

          setAuthLoading(false);
        }
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, []);

  // ==========================================
  // LOAD DASHBOARD AFTER ACCESS VERIFICATION
  // ==========================================

  useEffect(() => {
    if (role && supabase) {
      void loadDashboard();
    }
  }, [role, supabase, loadDashboard]);

  // ==========================================
  // DASHBOARD STATISTICS CARDS
  // ==========================================

  const cards = [
    {
      label: "REGISTERED MEMBERS",
      value: stats.members,
      icon: Users,
      tone: "pink"
    },
    {
      label: "PUBLISHED DISCUSSIONS",
      value: stats.published_posts,
      icon: FileText,
      tone: "purple"
    },
    {
      label: "PUBLISHED COMMENTS",
      value: stats.published_comments,
      icon: MessageSquare,
      tone: "blue"
    },
    {
      label: "TOTAL LIKES",
      value: stats.likes,
      icon: ThumbsUp,
      tone: "orange"
    },
    {
      label: "COMMUNITY POLLS",
      value: stats.polls,
      icon: Vote,
      tone: "green"
    },
    {
      label: "PENDING REPORTS",
      value: stats.pending_reports,
      icon: Flag,
      tone: "red"
    }
  ] as const;

  // ==========================================
  // AUTHENTICATION LOADING SCREEN
  // ==========================================

  if (authLoading) {
    return (
      <main className={styles.shell}>
        <div className={styles.state}>
          Checking administrator permissions...
        </div>
      </main>
    );
  }

  // ==========================================
  // RESTRICTED ACCESS SCREEN
  // ==========================================

  if (!role) {
    return (
      <main className={styles.shell}>
        <div className={styles.topbar}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={15} />
            BACK TO COMMUNITY
          </Link>

          <span className={styles.brand}>
            VICE CITY <b>CENTRAL</b>
          </span>
        </div>

        <section className={styles.restricted}>
          <ShieldCheck size={34} />

          <h1>Restricted control room</h1>

          <p>
            Sign in with an authorised administrator or
            moderator account to view community analytics.
          </p>

          <Link href="/" className={styles.primaryLink}>
            Return to community
          </Link>

          {error && (
            <p className={styles.error}>
              {error}
            </p>
          )}
        </section>
      </main>
    );
  }

  // ==========================================
  // MAIN ADMIN DASHBOARD
  // ==========================================

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={15} />
          BACK TO COMMUNITY
        </Link>

        <Link href="/" className={styles.brand}>
          VICE CITY <b>CENTRAL</b>
        </Link>
      </header>

      <div className={styles.content}>

        {/* Dashboard Header */}

        <section className={styles.hero}>
          <div>
            <span className={styles.kicker}>
              VICE CITY CENTRAL · CONTROL ROOM
            </span>

            <h1>
              Admin <em>dashboard.</em>
            </h1>

            <p>
              Your community at a glance. Monitor growth,
              engagement and reports from one place.
            </p>
          </div>

          <div className={styles.heroActions}>
            <span className={styles.role}>
              <ShieldCheck size={13} />
              {role.toUpperCase()}
            </span>

            <button
              type="button"
              className={styles.refresh}
              onClick={() => void loadDashboard()}
              disabled={loading}
            >
              <RefreshCw
                size={13}
                className={
                  loading ? styles.spinning : ""
                }
              />

              {loading ? "Refreshing" : "Refresh data"}
            </button>
          </div>
        </section>

        {/* Error Message */}

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {/* Community Statistics */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>
                COMMUNITY OVERVIEW
              </span>

              <h2>Key statistics</h2>
            </div>

            <span className={styles.updated}>
              <Clock3 size={12} />

              {lastUpdated
                ? `Updated ${formatDate(lastUpdated)}`
                : "Waiting for data"}
            </span>
          </div>

          <div className={styles.statsGrid}>
            {cards.map((card) => {
              const Icon = card.icon;

              return (
                <article
                  className={`${styles.statCard} ${styles[card.tone]}`}
                  key={card.label}
                >
                  <div className={styles.statTop}>
                    <span>{card.label}</span>
                    <Icon size={17} />
                  </div>

                  <strong>
                    {loading
                      ? "—"
                      : formatNumber(card.value)}
                  </strong>
                </article>
              );
            })}
          </div>
        </section>

        {/* Recent Activity and Moderation */}

        <section className={styles.lowerGrid}>

          {/* Recent Activity */}

          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.kicker}>
                  LIVE COMMUNITY PULSE
                </span>

                <h2>Recent activity</h2>
              </div>

              <Activity size={17} />
            </div>

            {loading ? (
              <div className={styles.empty}>
                Loading recent activity...
              </div>
            ) : activity.length ? (
              <div className={styles.activityList}>
                {activity.map((item) => (
                  <article
                    className={styles.activityItem}
                    key={item.id}
                  >
                    <span
                      className={`${styles.activityIcon} ${
                        item.kind === "discussion"
                          ? styles.postIcon
                          : styles.commentIcon
                      }`}
                    >
                      {item.kind === "discussion" ? (
                        <FileText size={14} />
                      ) : (
                        <MessageSquare size={14} />
                      )}
                    </span>

                    <div className={styles.activityText}>
                      <strong>{item.author}</strong>

                      <span>
                        {item.kind === "discussion"
                          ? "published a discussion"
                          : "added a comment"}
                      </span>

                      <p>{item.text}</p>

                      <small>
                        {formatDate(item.created_at)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                No published community activity yet.
              </div>
            )}
          </div>

          {/* Moderation Overview */}

          <aside className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.kicker}>
                  MODERATION STATUS
                </span>

                <h2>Report overview</h2>
              </div>

              <Flag size={17} />
            </div>

            <div className={styles.reportMetric}>
              <span>Pending review</span>
              <strong>
                {formatNumber(stats.pending_reports)}
              </strong>
            </div>

            <div className={styles.reportMetric}>
              <span>Currently reviewing</span>
              <strong>
                {formatNumber(stats.reviewing_reports)}
              </strong>
            </div>

            <div className={styles.reportMetric}>
              <span>Resolved</span>
              <strong>
                {formatNumber(stats.resolved_reports)}
              </strong>
            </div>

            <div className={styles.reportMetric}>
              <span>Dismissed</span>
              <strong>
                {formatNumber(stats.dismissed_reports)}
              </strong>
            </div>

            <Link
              href="/moderation"
              className={styles.queueLink}
            >
              Open moderation queue
              <Flag size={13} />
            </Link>

            <div className={styles.healthNote}>
              <CheckCircle2 size={14} />

              <span>
                Dashboard access is restricted to
                authorised community staff.
              </span>
            </div>
          </aside>
        </section>

        {/* Footer */}

        <footer className={styles.footer}>
          VICE CITY CENTRAL · ADMINISTRATION · PHASE 4.2
        </footer>

      </div>
    </main>
  );
}
