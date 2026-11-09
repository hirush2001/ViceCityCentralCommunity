"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import AuthModal from "@/components/auth-modal";
import PollsPanel from "@/components/polls-panel";
import { NotificationsBell } from "@/components/notifications-center";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  Bookmark,
  CarFront,
  ChevronDown,
  Compass,
  Flame,
  Gamepad2,
  Hash,
  Heart,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  ThumbsUp,
  TrendingUp,
  Users,
  X
} from "lucide-react";

type Category = "All posts" | "Theories" | "Characters" | "Vehicles" | "Locations";

type Post = {
  id: string | number;
  authorId?: string;
  authorUsername?: string;
  authorAvatarUrl?: string | null;
  author: string;
  initials: string;
  role: string;
  time: string;
  category: Exclude<Category, "All posts">;
  title: string;
  body: string;
  likes: number;
  comments: number;
  tag: string;
  accent: "pink" | "blue" | "orange" | "purple";
};

const initialPosts: Post[] = [
  {
    id: 1,
    author: "ViceTheory",
    initials: "VT",
    role: "Leonida insider",
    time: "12 min ago",
    category: "Theories",
    title: "Do you think the map will expand after launch?",
    body: "The scale of Leonida has me wondering whether Rockstar might add new areas over time. What locations would you want to see first?",
    likes: 248,
    comments: 64,
    tag: "MAP THEORIES",
    accent: "pink"
  },
  {
    id: 2,
    author: "LuciaFiles",
    initials: "LF",
    role: "Character specialist",
    time: "38 min ago",
    category: "Characters",
    title: "Jason & Lucia: what makes their story different?",
    body: "Their partnership looks like the emotional centre of the story. Do you think trust will be the biggest strength — or weakness — in their relationship?",
    likes: 186,
    comments: 42,
    tag: "CHARACTER TALK",
    accent: "orange"
  },
  {
    id: 3,
    author: "TurboSaint",
    initials: "TS",
    role: "Car culture fan",
    time: "1 hr ago",
    category: "Vehicles",
    title: "What should be your first ride in Vice City?",
    body: "Forget the fastest car for a second. I want something classic, low and loud for a sunset cruise down Ocean Drive.",
    likes: 132,
    comments: 29,
    tag: "GARAGE TALK",
    accent: "blue"
  },
  {
    id: 4,
    author: "NeonAtlas",
    initials: "NA",
    role: "World explorer",
    time: "2 hrs ago",
    category: "Locations",
    title: "Which part of Leonida are you exploring first?",
    body: "Vice City at night is an obvious choice, but the smaller towns and open countryside could hide some of the best details.",
    likes: 97,
    comments: 18,
    tag: "LEONIDA DISCOVERY",
    accent: "purple"
  }
];

const categories: Category[] = ["All posts", "Theories", "Characters", "Vehicles", "Locations"];
const trending = ["#LeonidaMap", "#JasonAndLucia", "#ViceCityCars", "#HiddenDetails", "#LaunchDay"];

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string;
};

type CommunityComment = {
  id: string;
  postId: string;
  authorId: string;
  authorUsername?: string;
  authorAvatarUrl?: string | null;
  parentCommentId: string | null;
  body: string;
  author: string;
  initials: string;
  time: string;
  accent: "pink" | "blue" | "orange" | "purple";
};

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export default function CommunityHome() {
  const [activeCategory, setActiveCategory] = useState<Category>("All posts");
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [liked, setLiked] = useState<Array<string | number>>([]);
  const [saved, setSaved] = useState<Array<string | number>>([]);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [feedMode, setFeedMode] = useState<"everyone" | "following">("everyone");
  const [followingLoading, setFollowingLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<Exclude<Category, "All posts">>("Theories");
  const [expandedCommentsPostId, setExpandedCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommunityComment[]>>({});
  const [commentsLoadingPostId, setCommentsLoadingPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [commentError, setCommentError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!user || !isSupabaseConfigured()) {
        if (active) setProfile(null);
        return;
      }

      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .eq("id", user.id)
        .maybeSingle();

      if (active) setProfile((data as Profile | null) ?? null);
    }

    void loadProfile();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;

    async function loadFollowingIds() {
      if (!user || !isSupabaseConfigured()) {
        setFollowingIds([]);
        setFeedMode("everyone");
        return;
      }
      setFollowingLoading(true);
      const { data, error } = await createClient()
        .from("member_follows")
        .select("following_id")
        .eq("follower_id", user.id);
      if (!active) return;
      if (error) {
        console.error("Could not load followed members:", error.message);
        setFollowingIds([]);
      } else {
        setFollowingIds((data ?? []).map((row: { following_id: string }) => row.following_id));
      }
      setFollowingLoading(false);
    }

    void loadFollowingIds();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;

    async function loadCommunityFeed() {
      setPostLoading(true);
      setPostError("");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("posts")
        .select("id, author_id, title, body, category, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!active) return;
      if (error) {
        setPostError(error.message);
        setPosts([]);
        setPostLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<{
        id: string;
        author_id: string;
        title: string;
        body: string;
        category: Exclude<Category, "All posts">;
        created_at: string;
      }>;
      const postIds = rows.map((row) => row.id);
      const authorIds = [...new Set(rows.map((row) => row.author_id))];

      const [profileResult, likeResult, commentResult] = postIds.length
        ? await Promise.all([
            supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", authorIds),
            supabase.from("post_likes").select("post_id").in("post_id", postIds),
            supabase.from("comments").select("post_id").eq("status", "published").in("post_id", postIds)
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];

      const profiles = (profileResult.data ?? []) as Array<Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
      const profileMap = new Map(profiles.map((item) => [item.id, item]));
      const likeCounts = new Map<string, number>();
      const commentCounts = new Map<string, number>();
      (likeResult.data ?? []).forEach((item: { post_id: string }) => {
        likeCounts.set(item.post_id, (likeCounts.get(item.post_id) ?? 0) + 1);
      });
      (commentResult.data ?? []).forEach((item: { post_id: string }) => {
        commentCounts.set(item.post_id, (commentCounts.get(item.post_id) ?? 0) + 1);
      });

      const mappedPosts: Post[] = rows.map((row, index) => {
        const author = profileMap.get(row.author_id);
        const display = author?.display_name || author?.username || "Vice City member";
        return {
          id: row.id,
          authorId: row.author_id,
          authorUsername: author?.username,
          authorAvatarUrl: author?.avatar_url ?? null,
          author: display,
          initials: display.slice(0, 2).toUpperCase(),
          role: "Community member",
          time: relativeTime(row.created_at),
          category: row.category,
          title: row.title,
          body: row.body,
          likes: likeCounts.get(row.id) ?? 0,
          comments: commentCounts.get(row.id) ?? 0,
          tag: row.category.toUpperCase(),
          accent: (["pink", "blue", "orange", "purple"] as const)[index % 4]
        };
      });

      if (!active) return;
      setPosts(mappedPosts);

      if (user && postIds.length) {
        const [myLikesResult, myBookmarksResult] = await Promise.all([
          supabase.from("post_likes").select("post_id").eq("user_id", user.id).in("post_id", postIds),
          supabase.from("bookmarks").select("post_id").eq("user_id", user.id).in("post_id", postIds)
        ]);
        if (active) {
          setLiked((myLikesResult.data ?? []).map((item: { post_id: string }) => item.post_id));
          setSaved((myBookmarksResult.data ?? []).map((item: { post_id: string }) => item.post_id));
        }
      } else if (active) {
        setLiked([]);
        setSaved([]);
      }

      if (active) setPostLoading(false);
    }

    void loadCommunityFeed();
    return () => { active = false; };
  }, [user]);

  const visiblePosts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesCategory = activeCategory === "All posts" || post.category === activeCategory;
      const matchesSearch = !term || `${post.title} ${post.body} ${post.author} ${post.category}`.toLowerCase().includes(term);
      const matchesFeed = feedMode === "everyone" || Boolean(post.authorId && followingIds.includes(post.authorId));
      return matchesCategory && matchesSearch && matchesFeed;
    });
  }, [activeCategory, feedMode, followingIds, posts, search]);

  function startDiscussion() {
    if (!user) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }
    setComposerOpen(true);
  }

  function joinCommunity() {
    if (user) {
      if (profile?.username) {
        window.location.assign(`/members/${encodeURIComponent(profile.username)}`);
      } else {
        document.getElementById("community")?.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }
    setAuthMode("signup");
    setAuthOpen(true);
  }

  async function signOut() {
    if (!isSupabaseConfigured()) return;
    const { error } = await createClient().auth.signOut();
    if (error) alert(error.message);
    else {
      setLiked([]);
      setSaved([]);
      setProfile(null);
    }
  }

  async function toggleLike(id: string | number) {
    const wasLiked = liked.includes(id);
    if (typeof id === "number") {
      setLiked((current) => wasLiked ? current.filter((item) => item !== id) : [...current, id]);
      setPosts((current) => current.map((post) => post.id === id ? { ...post, likes: post.likes + (wasLiked ? -1 : 1) } : post));
      return;
    }
    if (!user) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }

    const supabase = createClient();
    const result = wasLiked
      ? await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", user.id)
      : await supabase.from("post_likes").insert({ post_id: id, user_id: user.id });
    if (result.error) {
      alert(result.error.message);
      return;
    }
    setLiked((current) => wasLiked ? current.filter((item) => item !== id) : [...current, id]);
    setPosts((current) => current.map((post) => post.id === id ? { ...post, likes: Math.max(0, post.likes + (wasLiked ? -1 : 1)) } : post));
  }

  async function toggleSave(id: string | number) {
    const wasSaved = saved.includes(id);
    if (typeof id === "number") {
      setSaved((current) => wasSaved ? current.filter((item) => item !== id) : [...current, id]);
      return;
    }
    if (!user) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }

    const supabase = createClient();
    const result = wasSaved
      ? await supabase.from("bookmarks").delete().eq("post_id", id).eq("user_id", user.id)
      : await supabase.from("bookmarks").insert({ post_id: id, user_id: user.id });
    if (result.error) {
      alert(result.error.message);
      return;
    }
    setSaved((current) => wasSaved ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function publishPost() {
    if (!newTitle.trim() || !newBody.trim()) return;
    if (!user || !isSupabaseConfigured()) {
      setComposerOpen(false);
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }

    setIsPublishing(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        title: newTitle.trim(),
        body: newBody.trim(),
        category: newCategory,
        status: "published"
      })
      .select("id, author_id, title, body, category, created_at")
      .single();

    if (error) {
      alert(error.message);
      setIsPublishing(false);
      return;
    }

    const display = profile?.display_name || profile?.username || user.email?.split("@")[0] || "Member";
    const post: Post = {
      id: data.id,
      authorId: user.id,
      authorUsername: profile?.username,
      authorAvatarUrl: profile?.avatar_url ?? null,
      author: display,
      initials: display.slice(0, 2).toUpperCase(),
      role: "Community member",
      time: "just now",
      category: newCategory,
      title: data.title,
      body: data.body,
      likes: 0,
      comments: 0,
      tag: newCategory.toUpperCase(),
      accent: "pink"
    };

    setPosts((current) => [post, ...current]);
    setActiveCategory("All posts");
    setNewTitle("");
    setNewBody("");
    setComposerOpen(false);
    setIsPublishing(false);
  }

  async function toggleComments(postId: string | number) {
    if (typeof postId !== "string") {
      alert("Comments are available on published community discussions.");
      return;
    }

    if (expandedCommentsPostId === postId) {
      setExpandedCommentsPostId(null);
      setReplyTarget(null);
      setCommentDraft("");
      setCommentError("");
      return;
    }

    setExpandedCommentsPostId(postId);
    setReplyTarget(null);
    setCommentDraft("");
    setCommentError("");
    if (commentsByPost[postId]) return;

    setCommentsLoadingPostId(postId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, author_id, parent_comment_id, body, created_at")
      .eq("post_id", postId)
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (error) {
      setCommentError(error.message);
      setCommentsLoadingPostId(null);
      return;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      post_id: string;
      author_id: string;
      parent_comment_id: string | null;
      body: string;
      created_at: string;
    }>;
    const authorIds = [...new Set(rows.map((row) => row.author_id))];
    const profileResult = authorIds.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", authorIds)
      : { data: [] };
    const profileRows = (profileResult.data ?? []) as Array<Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
    const profileMap = new Map(profileRows.map((item) => [item.id, item]));

    const mappedComments: CommunityComment[] = rows.map((row, index) => {
      const authorProfile = profileMap.get(row.author_id);
      const display = authorProfile?.display_name || authorProfile?.username || "Vice City member";
      return {
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorUsername: authorProfile?.username,
        authorAvatarUrl: authorProfile?.avatar_url ?? null,
        parentCommentId: row.parent_comment_id,
        body: row.body,
        author: display,
        initials: display.slice(0, 2).toUpperCase(),
        time: relativeTime(row.created_at),
        accent: (["pink", "blue", "orange", "purple"] as const)[index % 4]
      };
    });

    setCommentsByPost((current) => ({ ...current, [postId]: mappedComments }));
    setCommentsLoadingPostId(null);
  }

  async function submitComment(postId: string) {
    const body = commentDraft.trim();
    if (!body || isSendingComment) return;
    if (!user) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }

    setIsSendingComment(true);
    setCommentError("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        author_id: user.id,
        parent_comment_id: replyTarget?.id ?? null,
        body,
        status: "published"
      })
      .select("id, post_id, author_id, parent_comment_id, body, created_at")
      .single();

    if (error) {
      setCommentError(error.message);
      setIsSendingComment(false);
      return;
    }

    const display = profile?.display_name || profile?.username || user.email?.split("@")[0] || "Member";
    const newComment: CommunityComment = {
      id: data.id,
      postId: data.post_id,
      authorId: data.author_id,
      authorUsername: profile?.username,
      authorAvatarUrl: profile?.avatar_url ?? null,
      parentCommentId: data.parent_comment_id,
      body: data.body,
      author: display,
      initials: display.slice(0, 2).toUpperCase(),
      time: relativeTime(data.created_at),
      accent: "pink"
    };

    setCommentsByPost((current) => ({
      ...current,
      [postId]: [...(current[postId] ?? []), newComment]
    }));
    setPosts((current) => current.map((post) =>
      post.id === postId ? { ...post, comments: post.comments + 1 } : post
    ));
    setCommentDraft("");
    setReplyTarget(null);
    setIsSendingComment(false);
  }

  function renderComment(comment: CommunityComment, threadComments: CommunityComment[], depth = 0): ReactNode {
    const replies = threadComments.filter((item) => item.parentCommentId === comment.id);
    return (
      <div className={`comment-thread-item ${depth > 0 ? "comment-thread-reply" : ""}`} key={comment.id} style={{ marginLeft: depth > 0 ? Math.min(depth, 3) * 14 : 0 }}>
        <a className="comment-avatar-link" href={comment.authorUsername ? `/members/${encodeURIComponent(comment.authorUsername)}` : undefined} aria-label={comment.authorUsername ? `View ${comment.author}'s profile` : undefined}>
          {comment.authorAvatarUrl ? <img className="comment-avatar-image" src={comment.authorAvatarUrl} alt="" /> : <div className={`comment-avatar avatar-${comment.accent}`}>{comment.initials}</div>}
        </a>
        <div className="comment-content">
          <div className="comment-byline">{comment.authorUsername ? <a href={`/members/${encodeURIComponent(comment.authorUsername)}`}><strong>{comment.author}</strong></a> : <strong>{comment.author}</strong>}<span>· {comment.time}</span></div>
          <p>{comment.body}</p>
          <button type="button" className="comment-reply-button" onClick={() => { setReplyTarget({ id: comment.id, author: comment.author }); setCommentDraft(""); }}>Reply</button>
          {replies.length > 0 && <div className="comment-replies">{replies.map((reply) => renderComment(reply, threadComments, depth + 1))}</div>}
        </div>
      </div>
    );
  }

  return (
    <main className="site-shell">
      <div className="announcement-bar">
        <span className="announcement-dot" />
        <span>THE CITY IS CALLING</span>
        <span className="announcement-divider">/</span>
        <span className="announcement-copy">Your unofficial GTA VI community starts here.</span>
        <a href="#community" className="announcement-link">ENTER THE COMMUNITY <ArrowRight size={12} /></a>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Vice City Central home">
          <span className="brand-mark"><span>VC</span><i /></span>
          <span className="brand-wordmark">VICE CITY <b>CENTRAL</b><small>THE FAN COMMUNITY</small></span>
        </a>
        <nav className={`main-nav ${mobileMenuOpen ? "is-open" : ""}`}>
          <a className="nav-link active" href="#community" onClick={() => setMobileMenuOpen(false)}>Community</a>
          <a className="nav-link" href="#discover" onClick={() => setMobileMenuOpen(false)}>Discover</a>
          <a className="nav-link" href="#pulse" onClick={() => setMobileMenuOpen(false)}>Polls</a>
          {user && <a className="nav-link" href="/saved" onClick={() => setMobileMenuOpen(false)}>Saved</a>}
          <a className="nav-link" href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button header-search" aria-label="Focus search" onClick={() => document.getElementById("community-search")?.focus()}><Search size={17} /></button>
          {user && <NotificationsBell userId={user.id} />}
          <button className="button button-outline sign-in-button" onClick={() => user ? void signOut() : (setAuthMode("signin"), setAuthOpen(true))}>{user ? "Sign out" : "Sign in"} <ArrowRight size={14} /></button>
          <button className="button button-primary header-join" onClick={joinCommunity}>{user ? `@${profile?.username || "member"}` : "Join the crew"} <ArrowDownRight size={15} /></button>
          <button className="icon-button mobile-menu-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-art" />
        <div className="hero-vignette" />
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line" /> WELCOME TO THE OTHER SIDE OF PARADISE</div>
          <h1>YOUR CITY.<br /><em>YOUR</em> COMMUNITY.</h1>
          <p className="hero-description">The place for theories, conversations and everything in between. Find your people. Make your mark on Leonida.</p>
          <div className="hero-buttons">
            <button className="button button-primary button-large" onClick={() => document.getElementById("community")?.scrollIntoView({ behavior: "smooth" })}>Explore discussions <ArrowRight size={16} /></button>
            <a className="button button-glass button-large" href="#discover"><Compass size={16} /> Discover the community</a>
          </div>
          <div className="hero-footnote"><span className="live-pulse" /> BUILT BY FANS, FOR FANS <span className="footnote-separator">·</span> NOT AFFILIATED WITH ROCKSTAR GAMES</div>
        </div>
        <div className="hero-side-note"><span>LEONIDA</span><i /> <span>26°07&apos; N — 80°08&apos; W</span></div>
        <div className="hero-bottom-label"><span>01</span> / THE COMMUNITY ERA</div>
      </section>

      <section className="ticker" aria-label="Community topics">
        <div className="ticker-track"><span>THEORIES</span><i /> <span>CHARACTERS</span><i /> <span>VICE CITY</span><i /> <span>VEHICLE CULTURE</span><i /> <span>LEONIDA</span><i /> <span>COMMUNITY FIRST</span><i /> <span>THEORIES</span><i /> <span>CHARACTERS</span><i /> <span>VICE CITY</span><i /> <span>VEHICLE CULTURE</span><i /> <span>LEONIDA</span><i /></div>
      </section>

      <section className="content-section" id="community">
        <div className="section-heading">
          <div>
            <div className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> THE COMMUNITY</div>
            <h2>THE CITY <em>NEVER</em> SLEEPS.</h2>
            <p className="section-subtitle">Pull up a chair. The conversation is already happening.</p>
          </div>
          <button className="button button-primary create-post-top" onClick={startDiscussion}><Plus size={16} /> Start a discussion</button>
        </div>

        <div className="community-layout">
          <div className="feed-column">
            <div className="feed-mode-switch" role="tablist" aria-label="Choose community feed">
              <button type="button" className={`feed-mode-button ${feedMode === "everyone" ? "selected" : ""}`} onClick={() => setFeedMode("everyone")}>Everyone</button>
              <button type="button" className={`feed-mode-button ${feedMode === "following" ? "selected" : ""}`} onClick={() => {
                if (!user) {
                  setAuthMode("signin");
                  setAuthOpen(true);
                  return;
                }
                setFeedMode("following");
              }}>Following {followingLoading ? "…" : ""}</button>
            </div>
            <div className="feed-toolbar">
              <div className="category-tabs" role="tablist" aria-label="Filter discussions">
                {categories.map((category) => <button key={category} className={`category-tab ${activeCategory === category ? "selected" : ""}`} onClick={() => setActiveCategory(category)}>{category}</button>)}
              </div>
              <label className="search-field"><Search size={15} /><input id="community-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search discussions" /><kbd>/</kbd></label>
            </div>

            <div className="feed-meta"><span><Radio size={13} /> COMMUNITY FEED</span><span>{isSupabaseConfigured() ? "LIVE FEED" : "SAMPLE FEED"} · {visiblePosts.length} POSTS <ChevronDown size={13} /></span></div>
            {!isSupabaseConfigured() && <div className="feed-status"><strong>DEMO MODE</strong> Connect your Supabase project to enable member accounts and cloud-saved discussions.</div>}
            {postLoading && <div className="feed-status">Loading community discussions...</div>}
            {postError && <div className="feed-status feed-status-error">Could not load the live feed: {postError}</div>}

            <div className="post-list">
              {visiblePosts.length === 0 ? <div className="empty-state"><Search size={24} /><h3>{feedMode === "following" && !search ? "Your Following feed is ready" : isSupabaseConfigured() && !search ? "Be the first to start a discussion" : "No discussions found"}</h3><p>{feedMode === "following" && !search ? (followingIds.length === 0 ? "You are not following anyone yet. Open a member profile and follow people to build your personal feed." : "The members you follow have not published any discussions yet.") : isSupabaseConfigured() && !search ? "The community feed is ready for its first post." : "Try another keyword or category."}</p>{feedMode === "following" && <button className="text-button" onClick={() => setFeedMode("everyone")}>Explore everyone&apos;s posts</button>}{search && <button className="text-button" onClick={() => { setSearch(""); setActiveCategory("All posts"); }}>Clear filters</button>}</div> : visiblePosts.map((post) => {
                const postComments = commentsByPost[String(post.id)] ?? [];
                const isThreadOpen = expandedCommentsPostId === String(post.id);
                return (
                  <article className="post-card" id={`post-${post.id}`} key={post.id}>
                    {post.authorUsername ? (
                      <a className="post-avatar-link" href={`/members/${encodeURIComponent(post.authorUsername)}`} aria-label={`View ${post.author}'s profile`}>
                        {post.authorAvatarUrl ? <img className="avatar-image" src={post.authorAvatarUrl} alt="" /> : <div className={`avatar avatar-${post.accent}`}>{post.initials}</div>}
                      </a>
                    ) : <div className={`avatar avatar-${post.accent}`}>{post.initials}</div>}
                    <div className="post-main">
                      <div className="post-byline">{post.authorUsername ? <a className="post-author-link" href={`/members/${encodeURIComponent(post.authorUsername)}`}><strong>{post.author}</strong></a> : <strong>{post.author}</strong>}<span className="author-role">{post.role}</span><span className="post-time">· {post.time}</span><span className={`post-tag tag-${post.accent}`}>{post.tag}</span></div>
                      <h3>{post.title}</h3>
                      <p>{post.body}</p>
                      <div className="post-actions">
                        <button className={`post-action ${liked.includes(post.id) ? "is-liked" : ""}`} onClick={() => toggleLike(post.id)} aria-label="Like discussion"><Heart size={15} fill={liked.includes(post.id) ? "currentColor" : "none"} /> {post.likes}</button>
                        <button className={`post-action ${isThreadOpen ? "is-thread-open" : ""}`} onClick={() => void toggleComments(post.id)} aria-expanded={isThreadOpen}><MessageCircle size={15} /> {post.comments} {post.comments === 1 ? "reply" : "replies"}</button>
                        <button className={`post-action save-action ${saved.includes(post.id) ? "is-saved" : ""}`} onClick={() => toggleSave(post.id)} aria-label="Save discussion"><Bookmark size={15} /> {saved.includes(post.id) ? "Saved" : "Save"}</button>
                      </div>
                      {typeof post.id === "string" && isThreadOpen && (
                        <section className="comments-panel" aria-label={`Comments for ${post.title}`}>
                          <div className="comments-panel-heading"><span>DISCUSSION THREAD</span><span>{postComments.length} COMMENTS & REPLIES</span></div>
                          {commentsLoadingPostId === post.id && <div className="comments-empty">Loading comments...</div>}
                          {commentError && <div className="comment-error">{commentError}</div>}
                          {commentsLoadingPostId !== post.id && postComments.length === 0 && !commentError && <div className="comments-empty">No replies yet. Start the conversation.</div>}
                          <div className="comment-thread-list">
                            {postComments.filter((comment) => !comment.parentCommentId).map((comment) => renderComment(comment, postComments))}
                          </div>
                          <form className="comment-composer" onSubmit={(event) => { event.preventDefault(); void submitComment(post.id as string); }}>
                            {replyTarget && <div className="replying-to"><span>REPLYING TO <strong>{replyTarget.author}</strong></span><button type="button" aria-label="Cancel reply" onClick={() => setReplyTarget(null)}><X size={13} /></button></div>}
                            <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={1500} rows={3} placeholder={replyTarget ? `Reply to ${replyTarget.author}...` : "Add to the conversation..."} />
                            <div className="comment-composer-footer"><span>{commentDraft.length}/1500 characters</span><button className="button button-primary" type="submit" disabled={!commentDraft.trim() || isSendingComment}>{isSendingComment ? "Sending..." : replyTarget ? "Send reply" : "Post comment"} <Send size={13} /></button></div>
                          </form>
                        </section>
                      )}
                    </div>
                    <span className="post-more" aria-hidden="true"><span /><span /><span /></span>
                  </article>
                );
              })}
            </div>
            <button className="button button-load-more" onClick={startDiscussion}>Start the next conversation <ArrowRight size={15} /></button>
          </div>

          <aside className="sidebar" id="discover">
            <PollsPanel
              user={user}
              onRequireSignIn={() => {
                setAuthMode("signin");
                setAuthOpen(true);
              }}
            />

            <div className="side-card trending-card">
              <div className="side-card-heading"><span className="side-icon orange-icon"><TrendingUp size={15} /></span><span>TRENDING TOPICS</span><Flame className="trending-flame" size={15} /></div>
              <div className="trending-list">{trending.map((topic, index) => <button className="trending-item" key={topic} onClick={() => { setSearch(topic.replace("#", "")); setActiveCategory("All posts"); document.getElementById("community")?.scrollIntoView({ behavior: "smooth" }); }}><span className="trending-number">0{index + 1}</span><strong>{topic}</strong><ArrowUpRightIcon /></button>)}</div>
              <button className="side-link" onClick={() => { setSearch(""); setActiveCategory("All posts"); }}>Explore all topics <ArrowRight size={13} /></button>
            </div>

            <div className="side-card join-card" id="join">
              <div className="join-glow" />
              <span className="join-kicker">YOUR PEOPLE ARE HERE</span>
              <h3>DON&apos;T JUST<br /><em>WATCH.</em><br />BE PART OF IT.</h3>
              <p>Join the conversation and help shape the community from day one.</p>
              <button className="button button-light" onClick={joinCommunity}>{user ? "Explore discussions" : "Become a founding member"} <ArrowRight size={14} /></button>
              <span className="join-note"><ShieldCheck size={12} /> COMMUNITY GUIDELINES APPLY</span>
            </div>
          </aside>
        </div>
      </section>

      <section className="discover-strip" id="about">
        <div className="discover-copy"><div className="eyebrow"><span className="eyebrow-line" /> MORE THAN A FEED</div><h2>FIND YOUR<br /><em>VICE CITY</em>.</h2><p>Whether you&apos;re here for the story, the streets, the cars or the wildest theories — there&apos;s a place for you.</p><a href="#community" className="discover-link">FIND YOUR CORNER <ArrowRight size={15} /></a></div>
        <div className="discover-cards">
          <a className="discover-card discover-card-characters" href="#community"><span className="discover-card-icon"><Users size={17} /></span><span className="discover-card-number">01 / PEOPLE</span><strong>CHARACTER<br />BREAKDOWNS</strong><span className="discover-card-arrow"><ArrowDownRight size={18} /></span></a>
          <a className="discover-card discover-card-cars" href="#community"><span className="discover-card-icon"><CarFront size={17} /></span><span className="discover-card-number">02 / MACHINES</span><strong>GARAGE<br />CULTURE</strong><span className="discover-card-arrow"><ArrowDownRight size={18} /></span></a>
          <a className="discover-card discover-card-map" href="#community"><span className="discover-card-icon"><MapPin size={17} /></span><span className="discover-card-number">03 / PLACES</span><strong>LEONIDA<br />EXPLORERS</strong><span className="discover-card-arrow"><ArrowDownRight size={18} /></span></a>
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#top"><span className="brand-mark"><span>VC</span><i /></span><span className="brand-wordmark">VICE CITY <b>CENTRAL</b><small>THE FAN COMMUNITY</small></span></a>
        <p>A fan-made community project. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive.</p>
        <div className="footer-right"><span>MADE FOR THE FANS <Heart size={12} /></span><span>© 2026 VICE CITY CENTRAL</span></div>
      </footer>

      {composerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}>
        <section className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">
          <div className="modal-header"><div><span className="modal-kicker">COMMUNITY POST</span><h2 id="composer-title">Start a conversation.</h2></div><button className="icon-button" onClick={() => setComposerOpen(false)} aria-label="Close"><X size={19} /></button></div>
          <label className="form-label">DISCUSSION TITLE<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={120} placeholder="What's on your mind?" /></label>
          <label className="form-label">CATEGORY<select value={newCategory} onChange={(event) => setNewCategory(event.target.value as Exclude<Category, "All posts">)}><option>Theories</option><option>Characters</option><option>Vehicles</option><option>Locations</option></select></label>
          <label className="form-label">YOUR POST<textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} rows={5} maxLength={3000} placeholder="Share your thoughts with the community..." /></label>
          <div className="modal-footer"><span>{newBody.length}/3000 characters · Saved to the community database</span><button className="button button-primary" onClick={() => void publishPost()} disabled={!newTitle.trim() || !newBody.trim() || isPublishing}>{isPublishing ? "Publishing..." : "Publish discussion"} <Send size={14} /></button></div>
          <p className="modal-disclaimer">Please keep discussions respectful and avoid sharing personal information.</p>
        </section>
      </div>}

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => setAuthOpen(false)}
      />
    </main>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight className="trending-arrow" size={14} />;
}
