// src/pages/CEOHome.tsx
/**
 * PHASE 1 LOCK ✅
 * - [LOCKED] Page renders without crashing
 * - [LOCKED] Helmet works because main.tsx provides <HelmetProvider>
 * - [TODO-P2] Mount CEO agent chat + onboarding panels once Phase 1 stable
 */

import React from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

export default function CEOHome() {
  const { email, role, signOut } = useAuth();
  const { status } = useOnboardingStatus();
  const navigate = useNavigate();

  return (
    <div data-testid="dashboard-home" style={{ padding: 24, fontFamily: "system-ui" }}>
      <Helmet>
        <title>PipelinePRO - CEO</title>
      </Helmet>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>CEO Home</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Signed in as <b>{email ?? "unknown"}</b> - role: <b>{role}</b>
      </div>

      {status === "in_progress" && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Finish onboarding</div>
          <p style={{ marginBottom: 10, opacity: 0.8 }}>
            You started onboarding. Resume to finalize the CEO Agent setup.
          </p>
          <button
            data-testid="resume-onboarding"
            onClick={() => navigate("/app/onboarding")}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Resume onboarding
          </button>
        </div>
      )}

      <button
        data-testid="sign-out"
        onClick={() => signOut()}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Sign out
      </button>

      <button
        data-testid="go-integrations"
        onClick={() => navigate("/app/integrations")}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontWeight: 700,
          marginLeft: 12,
        }}
      >
        Integrations
      </button>

      <hr style={{ margin: "24px 0", opacity: 0.2 }} />

      <div style={{ opacity: 0.85 }}>
        ✅ Phase 1: routing + auth + stability is the mission.  
        Next: we plug in the CEO Agent panel without breaking the app.
      </div>
    </div>
  );
}
