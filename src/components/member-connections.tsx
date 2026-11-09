"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type ConnectionMember = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
};

type ConnectionKind = "followers" | "following";

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "VC";
}

export default function MemberConnections({ username, connection }: { username: string; connection: string }) {
  const kind: ConnectionKind = connection === "following" ? "following" : "followers";
  const [ownerName, setOwnerName] = useState(username);
  const [members, setMembers] = useState<ConnectionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadConnections() {
      setLoading(true);
      setError("");
      if (!isSupabaseConfigured()) {
        setError("Supabase is not configured. Add your project credentials and restart the website.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: owner, error: ownerError } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("username", username)
        .maybeSingle();

      if (!active) return;
      if (ownerError || !owner) {
        setError(ownerError?.message || "This member could not be found.");
        setLoading(false);
        return;
      }
      setOwnerName(owner.display_name || owner.username);

      const { data: relations, error: relationError } = kind === "followers"
        ? await supabase.from("member_follows").select("follower_id, created_at").eq("following_id", owner.id).order("created_at", { ascending: false })
        : await supabase.from("member_follows").select("following_id, created_at").eq("follower_id", owner.id).order("created_at", { ascending: false });

      if (!active) return;
      if (relationError) {
        setError(relationError.message);
        setLoading(false);
        return;
      }

      const ids = (relations ?? []).map((row: { follower_id?: string; following_id?: string }) =>
        kind === "followers" ? row.follower_id : row.following_id
      ).filter((id): id is string => Boolean(id));

      if (ids.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .in("id", ids);

      if (!active) return;
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      const profileMap = new Map(((profiles ?? []) as ConnectionMember[]).map((profile) => [profile.id, profile]));
      setMembers(ids.map((id) => profileMap.get(id)).filter((item): item is ConnectionMember => Boolean(item)));
      setLoading(false);
    }

    void loadConnections();
    return () => { active = false; };
  }, [username, kind]);

  const heading = kind === "followers" ? "Followers" : "Following";

  return (
    <main className="profile-page-shell">
      <header className="profile-page-header">
        <Link href={`/members/${encodeURIComponent(username)}`} className="profile-back-link"><ArrowLeft size={15} /> BACK TO PROFILE</Link>
        <Link href="/" className="profile-brand">VICE CITY <b>CENTRAL</b></Link>
      </header>
      <div className="profile-page-content">
        <section className="connections-card">
          <div className="connections-heading">
            <span className="profile-kicker">COMMUNITY CONNECTIONS</span>
            <h1>{heading}</h1>
            <p>{ownerName}&apos;s {heading.toLowerCase()} on Vice City Central.</p>
          </div>
          {loading ? (
            <div className="profile-state">Loading {heading.toLowerCase()}...</div>
          ) : error ? (
            <div className="profile-state profile-state-error">{error}</div>
          ) : members.length === 0 ? (
            <div className="connections-empty"><Users size={26} /><strong>No {heading.toLowerCase()} yet</strong><span>When members connect, they&apos;ll appear here.</span></div>
          ) : (
            <div className="connections-list">
              {members.map((member) => (
                <Link className="connection-member-row" href={`/members/${encodeURIComponent(member.username)}`} key={member.id}>
                  <span className="connection-avatar">
                    {member.avatar_url ? <img src={member.avatar_url} alt="" /> : <span>{initials(member.display_name || member.username)}</span>}
                  </span>
                  <span className="connection-member-copy">
                    <strong>{member.display_name || member.username}</strong>
                    <small>@{member.username}</small>
                    {member.bio && <em>{member.bio}</em>}
                  </span>
                  <UserRound size={16} className="connection-open-icon" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className="profile-page-footer">A FAN-MADE COMMUNITY · NOT AFFILIATED WITH ROCKSTAR GAMES</footer>
    </main>
  );
}
