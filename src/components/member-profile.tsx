"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MessageSquare, PencilLine, UserRound, Users, UserPlus, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Member = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  created_at: string;
};

type MemberPost = {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

function memberSince(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "VC";
}

export default function MemberProfile({ username }: { username: string }) {
  const [member, setMember] = useState<Member | null>(null);
  const [posts, setPosts] = useState<MemberPost[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMember() {
      setLoading(true);
      setError("");

      if (!isSupabaseConfigured()) {
        setError("Supabase is not configured. Add your project credentials and restart the website.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [{ data: authData }, { data: memberData, error: memberError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("profiles")
          .select("id, username, display_name, bio, avatar_url, created_at")
          .eq("username", username)
          .maybeSingle()
      ]);

      if (!active) return;
      if (memberError) {
        setError(memberError.message);
        setLoading(false);
        return;
      }
      if (!memberData) {
        setMember(null);
        setPosts([]);
        setIsOwner(false);
        setViewerId(authData.user?.id ?? null);
        setLoading(false);
        return;
      }

      const foundMember = memberData as Member;
      const currentViewerId = authData.user?.id ?? null;
      setMember(foundMember);
      setViewerId(currentViewerId);
      setIsOwner(currentViewerId === foundMember.id);

      const [postResult, followersResult, followingResult] = await Promise.all([
        supabase.from("posts")
          .select("id, title, body, category, created_at")
          .eq("author_id", foundMember.id)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("member_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", foundMember.id),
        supabase.from("member_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", foundMember.id)
      ]);

      let viewerFollowsMember = false;
      if (currentViewerId && currentViewerId !== foundMember.id) {
        const { data: followRow, error: followError } = await supabase
          .from("member_follows")
          .select("follower_id")
          .eq("follower_id", currentViewerId)
          .eq("following_id", foundMember.id)
          .maybeSingle();
        if (followError) setError(followError.message);
        viewerFollowsMember = Boolean(followRow);
      }

      if (!active) return;
      if (postResult.error) setError(postResult.error.message);
      if (followersResult.error) setError(followersResult.error.message);
      if (followingResult.error) setError(followingResult.error.message);
      setPosts((postResult.data ?? []) as MemberPost[]);
      setFollowerCount(followersResult.count ?? 0);
      setFollowingCount(followingResult.count ?? 0);
      setIsFollowing(viewerFollowsMember);
      setLoading(false);
    }

    void loadMember();
    return () => { active = false; };
  }, [username]);

  async function toggleFollow() {
    if (!member || !viewerId || isOwner || followBusy) return;
    setFollowBusy(true);
    setError("");
    const supabase = createClient();
    const wasFollowing = isFollowing;
    const result = wasFollowing
      ? await supabase.from("member_follows").delete().eq("follower_id", viewerId).eq("following_id", member.id)
      : await supabase.from("member_follows").insert({ follower_id: viewerId, following_id: member.id });

    if (result.error) {
      setError(result.error.code === "23505" ? "You are already following this member." : result.error.message);
    } else {
      setIsFollowing(!wasFollowing);
      setFollowerCount((count) => Math.max(0, count + (wasFollowing ? -1 : 1)));
    }
    setFollowBusy(false);
  }

  return (
    <main className="profile-page-shell">
      <header className="profile-page-header">
        <Link href="/#community" className="profile-back-link"><ArrowLeft size={15} /> BACK TO COMMUNITY</Link>
        <Link href="/" className="profile-brand">VICE CITY <b>CENTRAL</b></Link>
      </header>

      <div className="profile-page-content">
        {loading ? (
          <div className="profile-state">Loading member profile...</div>
        ) : error && !member ? (
          <div className="profile-state profile-state-error">{error}</div>
        ) : !member ? (
          <section className="profile-not-found">
            <UserRound size={32} />
            <span className="profile-kicker">MEMBER NOT FOUND</span>
            <h1>This profile isn&apos;t here.</h1>
            <p>Check the username or return to the community feed.</p>
            <Link href="/#community" className="button button-primary">Explore the community</Link>
          </section>
        ) : (
          <>
            <section className="member-hero-card">
              <div className="member-cover-art" />
              <div className="member-identity-row">
                <div className="member-avatar-wrap">
                  {member.avatar_url ? (
                    <img className="member-avatar-large" src={member.avatar_url} alt={`${member.display_name}'s avatar`} />
                  ) : (
                    <div className="member-avatar-fallback">{initials(member.display_name || member.username)}</div>
                  )}
                </div>
                <div className="member-identity-copy">
                  <span className="profile-kicker">VICE CITY CENTRAL MEMBER</span>
                  <h1>{member.display_name || member.username}</h1>
                  <p>@{member.username}</p>
                </div>
                {isOwner ? (
                  <Link href="/settings/profile" className="button button-outline member-edit-button">
                    <PencilLine size={14} /> Edit profile
                  </Link>
                ) : viewerId ? (
                  <button type="button" className={`button ${isFollowing ? "button-outline" : "button-primary"} member-follow-button`} onClick={() => void toggleFollow()} disabled={followBusy}>
                    {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                    {followBusy ? "Please wait..." : isFollowing ? "Following" : "Follow"}
                  </button>
                ) : (
                  <Link href="/#community" className="button button-primary member-follow-button"><UserPlus size={14} /> Sign in to follow</Link>
                )}
              </div>
              <p className="member-bio">{member.bio?.trim() || "This member has not added a bio yet."}</p>
              <div className="member-meta-row member-social-meta">
                <span><CalendarDays size={14} /> MEMBER SINCE {memberSince(member.created_at).toUpperCase()}</span>
                <span><MessageSquare size={14} /> {posts.length} {posts.length === 1 ? "DISCUSSION" : "DISCUSSIONS"}</span>
                <Link href={`/members/${encodeURIComponent(member.username)}/followers`}><Users size={14} /> {followerCount} FOLLOWERS</Link>
                <Link href={`/members/${encodeURIComponent(member.username)}/following`}><UserPlus size={14} /> {followingCount} FOLLOWING</Link>
              </div>
              {error && <div className="profile-inline-error">{error}</div>}
            </section>

            <section className="member-posts-section">
              <div className="member-posts-heading">
                <div>
                  <span className="profile-kicker">COMMUNITY ACTIVITY</span>
                  <h2>Discussions <em>by {member.display_name || member.username}</em></h2>
                </div>
                <span className="member-post-count">{posts.length} POSTS</span>
              </div>

              {posts.length === 0 ? (
                <div className="profile-state">No published discussions yet. Their next conversation could start any time.</div>
              ) : (
                <div className="member-post-list">
                  {posts.map((post) => (
                    <article className="member-post-card" key={post.id}>
                      <div className="member-post-meta"><span>{post.category.toUpperCase()}</span><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString()}</time></div>
                      <h3>{post.title}</h3>
                      <p>{post.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <footer className="profile-page-footer">A FAN-MADE COMMUNITY · NOT AFFILIATED WITH ROCKSTAR GAMES</footer>
    </main>
  );
}
