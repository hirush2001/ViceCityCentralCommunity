"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, LoaderCircle, Save, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type EditableProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfileEditor() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!isSupabaseConfigured()) {
        setError("Supabase is not configured. Check your .env.local file.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        router.replace("/");
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url")
        .eq("id", authData.user.id)
        .single();

      if (!active) return;
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      const loaded = data as EditableProfile;
      setProfile(loaded);
      setDisplayName(loaded.display_name || "");
      setBio(loaded.bio || "");
      setAvatarUrl(loaded.avatar_url || "");
      setLoading(false);
    }

    void loadProfile();
    return () => { active = false; };
  }, [router]);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile) return;

    setError("");
    setNotice("");
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Your avatar must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const objectPath = `${profile.id}/avatar.${extension}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(objectPath, file, { upsert: true, contentType: file.type, cacheControl: "3600" });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(objectPath);
    const freshUrl = `${data.publicUrl}?v=${Date.now()}`;
    setAvatarUrl(freshUrl);
    setNotice("Avatar uploaded. Save your profile to publish the change.");
    setUploading(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setError("");
    setNotice("");

    const cleanName = displayName.trim();
    const cleanBio = bio.trim();
    if (cleanName.length < 1 || cleanName.length > 40) {
      setError("Display name must contain between 1 and 40 characters.");
      return;
    }
    if (cleanBio.length > 160) {
      setError("Your bio must be 160 characters or fewer.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: cleanName, bio: cleanBio, avatar_url: avatarUrl || null })
      .eq("id", profile.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setNotice("Your profile has been updated.");
    setSaving(false);
    router.push(`/members/${encodeURIComponent(profile.username)}`);
    router.refresh();
  }

  const avatarInitials = (displayName || profile?.username || "VC").trim().slice(0, 2).toUpperCase();

  return (
    <main className="profile-page-shell">
      <header className="profile-page-header">
        <Link href={profile ? `/members/${encodeURIComponent(profile.username)}` : "/"} className="profile-back-link"><ArrowLeft size={15} /> BACK TO PROFILE</Link>
        <Link href="/" className="profile-brand">VICE CITY <b>CENTRAL</b></Link>
      </header>

      <div className="profile-editor-wrap">
        <section className="profile-editor-card">
          <span className="profile-kicker">MEMBER SETTINGS / IDENTITY</span>
          <h1>Edit your profile.</h1>
          <p className="profile-editor-intro">Make your mark on Vice City Central. Your username stays fixed; your display name, bio and avatar can change.</p>

          {loading ? (
            <div className="profile-state">Loading your profile...</div>
          ) : error && !profile ? (
            <div className="profile-state profile-state-error">{error}</div>
          ) : profile ? (
            <form className="profile-edit-form" onSubmit={saveProfile}>
              <div className="avatar-edit-row">
                <div className="member-avatar-wrap member-avatar-edit">
                  {avatarUrl ? <img className="member-avatar-large" src={avatarUrl} alt="Your profile avatar" /> : <div className="member-avatar-fallback">{avatarInitials}</div>}
                </div>
                <div className="avatar-edit-copy">
                  <strong>PROFILE PHOTO</strong>
                  <span>JPG, PNG or WebP · Maximum 5 MB</span>
                  <button type="button" className="button button-outline avatar-upload-button" onClick={() => fileInput.current?.click()} disabled={uploading}>
                    {uploading ? <LoaderCircle className="auth-spinner" size={14} /> : <ImagePlus size={14} />}
                    {uploading ? "UPLOADING..." : "CHANGE AVATAR"}
                  </button>
                  <input ref={fileInput} className="visually-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />
                </div>
              </div>

              <label className="form-label">
                USERNAME
                <input value={`@${profile.username}`} readOnly />
                <small className="auth-hint">Your unique username cannot be changed here.</small>
              </label>

              <label className="form-label">
                DISPLAY NAME
                <input required minLength={1} maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name" />
                <small className="auth-hint">Up to 40 characters.</small>
              </label>

              <label className="form-label">
                BIO
                <textarea rows={4} maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Tell the community a little about yourself..." />
                <small className="auth-hint bio-counter">{bio.length}/160 characters</small>
              </label>

              {error && <p className="auth-message auth-error" role="alert">{error}</p>}
              {notice && <p className="auth-message auth-success" role="status">{notice}</p>}

              <div className="profile-editor-actions">
                <Link href={`/members/${encodeURIComponent(profile.username)}`} className="button button-outline">Cancel</Link>
                <button type="submit" className="button button-primary" disabled={saving || uploading}>
                  {saving ? <LoaderCircle className="auth-spinner" size={14} /> : <Save size={14} />}
                  {saving ? "SAVING..." : "SAVE PROFILE"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
      <footer className="profile-page-footer">YOUR IDENTITY · YOUR COMMUNITY · VICE CITY CENTRAL</footer>
    </main>
  );
}
