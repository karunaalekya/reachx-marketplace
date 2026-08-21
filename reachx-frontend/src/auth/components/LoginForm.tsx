import { useState } from "react";
import { Loader2, Mail, Lock } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

export function LoginForm() {
  const { login, isAuthenticating, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || isAuthenticating) return;
    login(email, password);
  }

  return (
    <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-premium-card">
      <h1 className="font-display text-2xl text-brand-indigo">Vendor sign in</h1>
      <p className="mt-1 text-sm opacity-70">Sign in to your ReachX seller account.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">Email</span>
          <span className="flex items-center gap-2 rounded-md border border-brand-indigo/20 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-indigo">
            <Mail size={16} className="shrink-0 text-brand-indigo/50" aria-hidden="true" />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="you@business.com"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">Password</span>
          <span className="flex items-center gap-2 rounded-md border border-brand-indigo/20 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-indigo">
            <Lock size={16} className="shrink-0 text-brand-indigo/50" aria-hidden="true" />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="••••••••"
            />
          </span>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isAuthenticating}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-indigo px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-60"
        >
          {isAuthenticating && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {isAuthenticating ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
