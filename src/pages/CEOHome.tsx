// src/pages/CEOHome.tsx
/**
 * PHASE 1 LOCK ?
 * - [LOCKED] Page renders without crashing
 * - [LOCKED] Helmet works because main.tsx provides <HelmetProvider>
 * - [TODO-P2] Mount CEO agent chat + onboarding panels once Phase 1 stable
 */

import React from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { getOnboardingData } from "@/lib/onboarding";

export default function CEOHome() {
  const { email, role, signOut } = useAuth();
  const { status, isOnboardingComplete } = useOnboardingStatus();
  const navigate = useNavigate();
  const context = getOnboardingData(undefined, email);
  const hasContext =
    !!context.businessName ||
    !!context.industry ||
    !!context.serviceArea ||
    !!context.primaryGoal ||
    !!context.offerPricing;

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

      {isOnboardingComplete && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Business Context</div>
            {!hasContext && (
              <button
                onClick={() => navigate("/app/onboarding")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Re-run onboarding
              </button>
            )}
          </div>
          {!hasContext && (
            <div style={{ marginBottom: 8, color: "#b7791f", fontWeight: 600 }}>
              Onboarding data is missing or incomplete. Re-run onboarding to fill it in.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            <ContextField label="Business name" value={context.businessName} />
            <ContextField label="Industry" value={context.industry} />
            <ContextField label="Service area" value={context.serviceArea} />
            <ContextField label="Primary goal" value={context.primaryGoal} />
            <ContextField label="Offer & pricing" value={context.offerPricing} />
          </div>
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
        ? Phase 1: routing + auth + stability is the mission.  
        Next: we plug in the CEO Agent panel without breaking the app.
      </div>
    </div>
  );
}

const ContextField = ({ label, value }: { label: string; value?: string }) => (
  <div
    style={{
      padding: 10,
      borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.1)",
      background: "white",
      minHeight: 64,
    }}
  >
    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6 }}>{label}</div>
    <div style={{ fontWeight: 700, marginTop: 4 }}>{value || "—"}</div>
  </div>
);
