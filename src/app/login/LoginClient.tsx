"use client";

import { useMemo, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function humanizeAuthError(code: string | null) {
  if (!code) return null;

  switch (code) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "AccessDenied":
      return "Access denied.";
    case "Configuration":
      return "Auth configuration error. Check server env/config.";
    default:
      return "Unable to sign in. Please try again.";
  }
}

export default function LoginPage() {
  const router = useRouter();

  // read query params from the url
  // used for callback redirect and auth errors
  const searchParams = useSearchParams();

  // where to send the user after login
  // fallback keeps things safe if param is missing
  const callbackUrl = useMemo(() => {
    return searchParams.get("callbackUrl") ?? "/employees";
  }, [searchParams]);

  // map nextauth error codes from the url to human text
  const urlError = useMemo(() => {
    return humanizeAuthError(searchParams.get("error"));
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!res) {
        setFormError("Unable to sign in. Please try again.");
        return;
      }

      if (res.error) {
        setFormError(
          humanizeAuthError(res.error) ?? "Invalid email or password.",
        );
        return;
      }

      router.replace(res.url ?? callbackUrl);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  // prefer local form error but fall back to url error
  const showError = formError ?? urlError;

  return (
    <div className="ui-page">
      <div className="ui-shell ui-fade-in">
        {/* top brand */}
        <div className="mb-6 text-center">
          <div className="ui-logo-box">
            <div className="ui-logo-icon" />
          </div>

          <h1 className="ui-title">HR Admin</h1>
          <p className="ui-muted mt-1">Sign in to continue</p>
        </div>

        <div className="ui-card">
          {showError ? (
            <div className="ui-alert-error mb-4">{showError}</div>
          ) : null}

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label htmlFor="email" className="ui-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="hradmin@test.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ui-input"
                disabled={submitting}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="ui-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ui-input"
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="ui-btn ui-btn-primary"
            >
              {submitting ? "Logging in…" : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
