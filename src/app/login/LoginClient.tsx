"use client";

import { useMemo, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function humanizeAuthError(code: string | null) {
  if (!code) return null;

  // map next auth error codes to user friendly messages
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

// login page component
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const callbackUrl = useMemo(() => {
    return searchParams.get("callbackUrl") ?? "/employees";
  }, [searchParams]);

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

    // sign in with credentials
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

  const showError = formError ?? urlError;

  // main login form component
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="bg-background w-full max-w-sm rounded-lg border p-6 shadow-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold">HR Admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in to your account
          </p>
        </div>

        {/* Error */}
        {showError ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">
            {showError}
          </div>
        ) : null}

        {/* Form */}
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
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
              className="w-full rounded-md border px-3 py-2 text-sm"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="TestPass1234"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              disabled={submitting}
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="border-primary/70 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary w-full rounded-md border px-4 py-2 text-sm font-medium shadow-sm hover:shadow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
          >
            {submitting ? "Logging in…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
