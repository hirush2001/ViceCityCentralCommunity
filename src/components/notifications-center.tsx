"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, CheckCheck, Heart, MessageCircle, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type NotificationType = "follow" | "post_like" | "comment" | "reply" | "poll_vote";

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  poll_id: string | null;
  created_at: string;
  read_at: string | null;
};

type ActorProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type NotificationItem = NotificationRow & {
  actor: ActorProfile | null;
};

function notificationMessage(type: NotificationType) {
  switch (type) {
    case "follow": return "started following you";
    case "post_like": return "liked your discussion";
    case "comment": return "commented on your discussion";
    case "reply": return "replied to your comment";
    case "poll_vote": return "voted in your poll";
  }
}

function notificationHref(item: NotificationItem) {
  if (item.type === "follow" && item.actor?.username) {
    return `/members/${encodeURIComponent(item.actor.username)}`;
  }
  if (item.type === "poll_vote") return "/#pulse";
  return "/#community";
}

function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function NotificationGlyph({ type }: { type: NotificationType }) {
  if (type === "follow") return <UserPlus size={15} />;
  if (type === "post_like") return <Heart size={15} />;
  if (type === "comment" || type === "reply") return <MessageCircle size={15} />;
  return <Bell size={15} />;
}

function useNotifications(userId: string | null) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }

    if (!isSupabaseConfigured()) {
      setItems([]);
      setLoading(false);
      setError("Supabase is not configured.");
      return;
    }

    let active = true;
    const supabase = createClient();

    async function loadNotifications() {
      const { data, error: queryError } = await supabase
        .from("notifications")
        .select("id, recipient_id, actor_id, type, post_id, comment_id, poll_id, created_at, read_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!active) return;

      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as NotificationRow[];
      const actorIds = Array.from(new Set(
        rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))
      ));

      let actorMap = new Map<string, ActorProfile>();
      if (actorIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", actorIds);

        if (!active) return;
        if (profileError) setError(profileError.message);
        actorMap = new Map(
          ((profiles ?? []) as ActorProfile[]).map((profile) => [profile.id, profile])
        );
      }

      if (!active) return;
      setItems(rows.map((row) => ({
        ...row,
        actor: row.actor_id ? actorMap.get(row.actor_id) ?? null : null
      })));
      setError("");
      setLoading(false);
    }

    setLoading(true);
    void loadNotifications();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`
        },
        () => { void loadNotifications(); }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  async function markRead(notificationId: string) {
    if (!userId) return;
    const readAt = new Date().toISOString();
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", notificationId)
      .eq("recipient_id", userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setItems((current) => current.map((item) =>
      item.id === notificationId ? { ...item, read_at: readAt } : item
    ));
  }

  async function markAllRead() {
    if (!userId) return;
    const readAt = new Date().toISOString();
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("recipient_id", userId)
      .is("read_at", null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setItems((current) => current.map((item) =>
      item.read_at ? item : { ...item, read_at: readAt }
    ));
  }

  return {
    items,
    loading,
    error,
    unreadCount: items.filter((item) => !item.read_at).length,
    markRead,
    markAllRead
  };
}

function NotificationRowView({
  item,
  onRead
}: {
  item: NotificationItem;
  onRead?: () => void;
}) {
  const actorName = item.actor?.display_name?.trim() || item.actor?.username || "A member";

  return (
    <Link
      href={notificationHref(item)}
      className={`notification-row ${item.read_at ? "" : "is-unread"}`}
      onClick={onRead}
    >
      <span className={`notification-row-icon notification-icon-${item.type}`}>
        <NotificationGlyph type={item.type} />
      </span>
      <span className="notification-row-copy">
        <span><strong>{actorName}</strong> {notificationMessage(item.type)}</span>
        <small>{notificationTime(item.created_at)}</small>
      </span>
      {!item.read_at && <span className="notification-unread-dot" aria-label="Unread" />}
    </Link>
  );
}

export function NotificationsBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  const {
    items,
    loading,
    error,
    unreadCount,
    markRead,
    markAllRead
  } = useNotifications(userId);

  if (!userId) return null;

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className="icon-button notification-bell-button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="notification-unread-count">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <section className="notification-popover" role="dialog" aria-label="Notifications">
          <div className="notification-popover-header">
            <div>
              <span className="notification-kicker">YOUR INBOX</span>
              <strong>Notifications</strong>
            </div>
            <button
              type="button"
              className="notification-mark-all"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          </div>
          <div className="notification-popover-list">
            {loading && items.length === 0 && <div className="notification-empty">Loading notifications...</div>}
            {error && <div className="notification-error">{error}</div>}
            {!loading && items.length === 0 && !error && (
              <div className="notification-empty">You're all caught up. New activity will appear here.</div>
            )}
            {items.slice(0, 8).map((item) => (
              <NotificationRowView
                key={item.id}
                item={item}
                onRead={() => {
                  void markRead(item.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <Link href="/notifications" className="notification-popover-footer" onClick={() => setOpen(false)}>
            View all notifications <span>→</span>
          </Link>
        </section>
      )}
    </div>
  );
}

export default function NotificationsCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthError("Supabase is not configured. Please try again after checking your environment settings.");
      setAuthLoading(false);
      return;
    }

    let active = true;
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return;
      if (userError) setAuthError(userError.message);
      setUserId(data.user?.id ?? null);
      setAuthLoading(false);
    });

    return () => { active = false; };
  }, []);

  const {
    items,
    loading,
    error,
    unreadCount,
    markRead,
    markAllRead
  } = useNotifications(userId);

  return (
    <main className="profile-page-shell">
      <header className="profile-page-header">
        <Link href="/#community" className="profile-back-link"><ArrowLeft size={15} /> BACK TO COMMUNITY</Link>
        <Link href="/" className="profile-brand">VICE CITY <b>CENTRAL</b></Link>
      </header>

      <div className="profile-page-content">
        <section className="notifications-page-card">
          <div className="notifications-page-heading">
            <div>
              <span className="profile-kicker">ACTIVITY & CONNECTIONS</span>
              <h1>Your notifications</h1>
              <p>Keep up with what's happening around Vice City Central.</p>
            </div>
            {userId && (
              <span className="notifications-unread-summary">
                {unreadCount} UNREAD
              </span>
            )}
          </div>

          {authLoading ? (
            <div className="profile-state">Loading your account...</div>
          ) : authError ? (
            <div className="profile-state profile-state-error">{authError}</div>
          ) : !userId ? (
            <div className="notification-empty notification-page-empty">
              Sign in to see your notifications.
              <Link href="/#join" className="button button-primary">Join the crew</Link>
            </div>
          ) : (
            <>
              <div className="notifications-page-toolbar">
                <span>{items.length} RECENT NOTIFICATIONS</span>
                <button type="button" className="notification-mark-all" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
                  <CheckCheck size={13} /> Mark all as read
                </button>
              </div>
              {error && <div className="notification-error">{error}</div>}
              {loading && items.length === 0 ? (
                <div className="profile-state">Loading notifications...</div>
              ) : items.length === 0 ? (
                <div className="notification-empty notification-page-empty">No notifications yet. Follow members and join the conversation to get started.</div>
              ) : (
                <div className="notification-page-list">
                  {items.map((item) => (
                    <NotificationRowView key={item.id} item={item} onRead={() => void markRead(item.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <footer className="profile-page-footer">A FAN-MADE COMMUNITY · NOT AFFILIATED WITH ROCKSTAR GAMES</footer>
    </main>
  );
}
