// [LOCKED:PHASE1] Simple auth UI. No extra dependencies.
// If you want your fancy UI back later, we’ll swap it in after stability.

import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Auth() {
  const { signIn, signUp, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate("/app", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res =
        mode === "login"
          ? await signIn({ email, password })
          : await signUp({ email, password });

      if (res.error) {
        setErrorMsg(res.error.message);
        setIsSubmitting(false);
        return;
      }

      const goTo = location?.state?.from ?? "/app";
      navigate(goTo, { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>
        {mode === "login" ? "Sign In" : "Create Account"}
      </h1>

      <form data-testid="auth-form" onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        {errorMsg && (
          <div style={{ color: "crimson", fontSize: 14 }}>{errorMsg}</div>
        )}

        <button
          data-testid="sign-in"
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {isSubmitting ? "Working…" : mode === "login" ? "Sign In" : "Sign Up"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
