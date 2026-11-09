"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  BookmarkX,
  CalendarDays,
  Search,
  MessageSquare,
  UserRound,
  X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type SavedPostRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

type SavedBookmarkRow = {
  post_id: string;
  created_at: string;
};

type AuthorProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type SavedDiscussion = SavedPostRow & {
  saved_at: string;
  author: AuthorProfile | null;
};

const CATEGORIES = ["All", "Theories", "Characters", "Vehicles", "Locations"];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "VC";
}

export default function SavedDiscussions() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState<SavedDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Check your environment settings and restart the website.");
      setAuthLoading(false);
      setLoading(false);
      return;
    }

    let active = true;
    const supabase = createClient();

    async function setCurrentUser() {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError) setError(authError.message);
      setUserId(data.user?.id ?? null);
      setAuthLoading(false);
    }

    void setCurrentUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSavedDiscussions() {
      if (!userId) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      const supabase = createClient();

      const { data: bookmarkRows, error: bookmarkError } = await supabase
        .from("bookmarks")
        .select("post_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!active) return;
      if (bookmarkError) {
        setError(bookmarkError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const bookmarks = (bookmarkRows ?? []) as SavedBookmarkRow[];
      if (bookmarks.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const postIds = bookmarks.map((bookmark) => bookmark.post_id);
      const { data: postRows, error: postsError } = await supabase
        .from("posts")
        .select("id, author_id, title, body, category, created_at")
        .in("id", postIds)
        .eq("status", "published");

      if (!active) return;
      if (postsError) {
        setError(postsError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const posts = (postRows ?? []) as SavedPostRow[];
      const authorIds = Array.from(new Set(posts.map((post) => post.author_id)));
      const { data: authorRows, error: authorsError } = authorIds.length
        ? await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", authorIds)
        : { data: [], error: null };

      if (!active) return;
      if (authorsError) {
        setError(authorsError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const authorMap = new Map(
        ((authorRows ?? []) as AuthorProfile[]).map((author) => [author.id, author])
      );
      const postMap = new Map(posts.map((post) => [post.id, post]));

      // Preserve the user's bookmark order, newest saved first.
      const mapped = bookmarks
        .map((bookmark) => {
          const post = postMap.get(bookmark.post_id);
          if (!post) return null;
          return {
            ...post,
            saved_at: bookmark.created_at,
            author: authorMap.get(post.author_id) ?? null
          } satisfies SavedDiscussion;
        })
        .filter((item): item is SavedDiscussion => item !== null);

      setItems(mapped);
      setLoading(false);
    }

    if (!authLoading) void loadSavedDiscussions();
    return () => { active = false; };
  }, [userId, authLoading]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const authorName = item.author?.display_name || item.author?.username || "";
      const matchesSearch = !term ||
        `${item.title} ${item.body} ${item.category} ${authorName}`.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [items, search, category]);

  async function removeBookmark(postId: string) {
    if (!userId || removingId) return;
    setRemovingId(postId);
    setError("");

    const { error: deleteError } = await createClient()
      .from("bookmarks")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      setRemovingId(null);
      return;
    }

    setItems((current) => current.filter((item) => item.id !== postId));
    setRemovingId(null);
  }

  return (
    <main className="profile-page-shell saved-page-shell">
      <header className="profile-page-header">
        <Link href="/#community" className="profile-back-link"><ArrowLeft size={15} /> BACK TO COMMUNITY</Link>
        <Link href="/" className="profile-brand">VICE CITY <b>CENTRAL</b></Link>
      </header>

      <div className="profile-page-content saved-page-content">
        <section className="saved-dashboard-card">
          <div className="saved-dashboard-heading">
            <div>
              <span className="profile-kicker">YOUR PERSONAL COLLECTION</span>
              <h1>Saved <em>discussions.</em></h1>
              <p>Keep the conversations worth coming back to, all in one place.</p>
            </div>
            <div className="saved-total"><Bookmark size={17} /><strong>{items.length}</strong><span>SAVED</span></div>
          </div>

          {authLoading || loading ? (
            <div className="profile-state">Loading your saved discussions...</div>
          ) : !userId ? (
            <div className="saved-empty-state">
              <UserRound size={28} />
              <h2>Sign in to view your collection</h2>
              <p>Your saved discussions are private to your account.</p>
              <Link href="/#community" className="button button-primary">Return to the community</Link>
            </div>
          ) : (
            <>
              <div className="saved-toolbar">
                <label className="saved-search">
                  <Search size={15} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved discussions..." />
                  {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}
                </label>
                <span className="saved-results-count">{visibleItems.length} OF {items.length} SAVED</span>
              </div>

              <div className="saved-category-tabs" role="tablist" aria-label="Filter saved discussions">
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={category === item}
                    className={category === item ? "is-active" : ""}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {error && <div className="saved-error">{error}</div>}

              {visibleItems.length === 0 ? (
                <div className="saved-empty-state">
                  <Bookmark size={28} />
                  <h2>{items.length === 0 ? "Your collection is waiting." : "No matching discussions."}</h2>
                  <p>{items.length === 0
                    ? "Save a discussion from the community feed and it will appear here."
                    : "Try another search or category to find your saved discussion."}</p>
                  {items.length === 0 && <Link href="/#community" className="button button-primary">Explore discussions</Link>}
                  {(search || category !== "All") && (
                    <button type="button" className="saved-reset-button" onClick={() => { setSearch(""); setCategory("All"); }}>
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="saved-discussion-list">
                  {visibleItems.map((item) => {
                    const authorName = item.author?.display_name || item.author?.username || "Vice City member";
                    const authorInitials = initials(authorName);
                    return (
                      <article className="saved-discussion-card" key={item.id}>
                        <div className="saved-discussion-topline">
                          <span className={`saved-category-tag saved-category-${item.category.toLowerCase()}`}>{item.category}</span>
                          <span className="saved-date"><Bookmark size={12} /> Saved {formatDate(item.saved_at)}</span>
                        </div>
                        <h2>{item.title}</h2>
                        <p className="saved-discussion-body">{item.body}</p>
                        <div className="saved-discussion-footer">
                          <Link
                            href={item.author?.username ? `/members/${encodeURIComponent(item.author.username)}` : "/#community"}
                            className="saved-author"
                          >
                            {item.author?.avatar_url
                              ? <img src={item.author.avatar_url} alt="" />
                              : <span className="saved-author-fallback">{authorInitials}</span>}
                            <span><strong>{authorName}</strong><small>Posted {formatDate(item.created_at)}</small></span>
                          </Link>
                          <div className="saved-card-actions">
                            <Link href={`/#post-${item.id}`} className="saved-open-link">Open discussion <MessageSquare size={13} /></Link>
                            <button
                              type="button"
                              className="saved-remove-button"
                              onClick={() => void removeBookmark(item.id)}
                              disabled={removingId === item.id}
                            >
                              <BookmarkX size={14} /> {removingId === item.id ? "Removing..." : "Remove"}
                            </button>
                          </div>
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
      <footer className="profile-page-footer">YOUR SAVED COLLECTION · PRIVATE TO YOUR ACCOUNT</footer>
    </main>
  );
}
