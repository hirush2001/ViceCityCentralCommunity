"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AuthMode = "signin" | "signup";

type AuthModalProps = {
  open: boolean;
  initialMode: AuthMode;
  onClose: () => void;
  onAuthenticated: () => void;
};

export default function AuthModal({
  open,
  initialMode,
  onClose,
  onAuthenticated
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setErrorMessage("");
      setSuccessMessage("");
    }
  }, [open, initialMode]);

  if (!open) return null;

  function closeModal() {
    setPassword("");
    setErrorMessage("");
    setSuccessMessage("");
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!isSupabaseConfigured()) {
      setErrorMessage(
        "Supabase is not connected yet. Add your project URL and publishable key to .env.local, then restart the development server."
      );
      return;
    }

    setBusy(true);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const cleanUsername = username.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: username.trim()
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });

        if (error) throw error;

        if (data.session) {
          onAuthenticated();
          setPassword("");
          onClose();
        } else {
          setSuccessMessage(
            "Your account request is ready. Check your inbox and confirm your email, then return here to sign in."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
        onAuthenticated();
        setPassword("");
        onClose();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop auth-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        className="composer-modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <div className="modal-header">
          <div>
            <span className="modal-kicker">VICE CITY CENTRAL / MEMBERS</span>
            <h2 id="auth-title">
              {mode === "signup" ? "Join the crew." : "Welcome back."}
            </h2>
          </div>
          <button className="icon-button" onClick={closeModal} aria-label="Close sign in">
            <X size={19} />
          </button>
        </div>

        <p className="auth-intro">
          {mode === "signup"
            ? "Create your community identity and join the conversation."
            : "Sign in to publish discussions, save posts and join the conversation."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="form-label">
              USERNAME
              <input
                required
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. ViceCityFan"
              />
              <small className="auth-hint">3–24 letters, numbers or underscores.</small>
            </label>
          )}

          <label className="form-label">
            EMAIL ADDRESS
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className="form-label">
            PASSWORD
            <input
              required
              type="password"
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>

          {errorMessage && <p className="auth-message auth-error" role="alert">{errorMessage}</p>}
          {successMessage && <p className="auth-message auth-success" role="status">{successMessage}</p>}

          <button className="button button-primary auth-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="auth-spinner" size={15} /> : null}
            {busy
              ? "PLEASE WAIT..."
              : mode === "signup"
                ? "CREATE MY ACCOUNT"
                : "SIGN IN TO VICE CITY"}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signup" ? "Already part of the crew?" : "New to Vice City Central?"}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setErrorMessage("");
              setSuccessMessage("");
            }}
          >
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </div>

        <p className="modal-disclaimer">
          This is an unofficial fan community and is not affiliated with Rockstar Games.
          Never reuse a password from another service.
        </p>
      </section>
    </div>
  );
}
