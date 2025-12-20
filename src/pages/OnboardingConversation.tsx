import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Brain, ArrowRight, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { defaultOnboardingState, OnboardingData } from "@/lib/onboarding";

type StepField = {
  key: keyof OnboardingData;
  label: string;
  placeholder?: string;
  optional?: boolean;
};

type Step = {
  title: string;
  description: string;
  fields: StepField[];
};

const STEPS: Step[] = [
  {
    title: "Business basics",
    description: "Tell us who you are and where you operate.",
    fields: [
      { key: "businessName", label: "Business name", placeholder: "Pipeline Pros LLC" },
      { key: "industry", label: "Industry", placeholder: "HVAC, Plumbing, etc." },
      { key: "serviceArea", label: "Service area", placeholder: "Austin, TX" },
    ],
  },
  {
    title: "Goals & offer",
    description: "What you sell and what success looks like.",
    fields: [
      { key: "primaryGoal", label: "Primary goal metric", placeholder: "MRR or booked jobs" },
      { key: "offerPricing", label: "Offer & pricing", placeholder: "Tune-up $129, Membership $39/mo" },
      { key: "targetCustomer", label: "Target customer", placeholder: "Homeowners 30-55, zip 78704" },
    ],
  },
  {
    title: "Leads & scheduling",
    description: "Where leads come from and how to book time.",
    fields: [
      { key: "leadSources", label: "Lead sources", placeholder: "Google Ads, LSA, Referrals" },
      { key: "calendarLink", label: "Calendar link (optional)", optional: true, placeholder: "https://cal.com/..." },
      { key: "contactPhone", label: "Contact phone (optional)", optional: true, placeholder: "(555) 123-4567" },
    ],
  },
];

export default function OnboardingConversation() {
  const navigate = useNavigate();
  const { data, updateData, markComplete, reset, status } = useOnboardingStatus();
  const [step, setStep] = useState(0);
  const [formState, setFormState] = useState<OnboardingData>(data);

  const totalSteps = STEPS.length;
  const progress = useMemo(() => Math.round(((step + 1) / totalSteps) * 100), [step, totalSteps]);

  useEffect(() => {
    setFormState(data);
  }, [data]);

  const handleChange = (key: keyof OnboardingData, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const goNext = () => {
    updateData(formState);
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const goPrev = () => setStep((s) => Math.max(s - 1, 0));

  const handleComplete = () => {
    updateData(formState);
    markComplete();
    navigate("/app", { replace: true });
  };

  const handleReset = () => {
    if (window.confirm("Start over and clear onboarding data?")) {
      reset();
      setFormState(defaultOnboardingState.data);
      setStep(0);
    }
  };

  const currentStep = STEPS[step];

  return (
    <>
      <Helmet>
        <title>Onboarding | CEO Agent</title>
      </Helmet>
      <div
        data-testid="onboarding-root"
        className="min-h-screen bg-background flex items-center justify-center p-4"
      >
        <Card className="w-full max-w-3xl">
          <CardHeader className="flex flex-col gap-2">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              CEO Agent Onboarding
            </CardTitle>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{currentStep.title}</span>
              <span>
                Step {step + 1} / {totalSteps}
              </span>
            </div>
            <Progress value={progress} />
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">{currentStep.description}</p>

            <div className="grid gap-4">
              {currentStep.fields.map((field) => (
                <div className="grid gap-2" key={field.key}>
                  <label className="text-sm font-medium" htmlFor={`field-${field.key}`}>
                    {field.label}
                    {field.optional ? " (optional)" : ""}
                  </label>
                  <Input
                    id={`field-${field.key}`}
                    value={(formState as any)[field.key] || ""}
                    placeholder={field.placeholder}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex justify-between">
                <Button variant="outline" onClick={handleReset} size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Start over
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={goPrev} disabled={step === 0}>
                    Back
                  </Button>
                  {step < totalSteps - 1 ? (
                    <Button onClick={goNext}>
                      Next
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      data-testid="finish-onboarding"
                      onClick={handleComplete}
                      disabled={!formState.businessName || !formState.primaryGoal}
                    >
                      Finish & continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="font-semibold mb-2">Summary</div>
                <ul className="text-sm space-y-1">
                  <li><strong>Business:</strong> {formState.businessName || "-"}</li>
                  <li><strong>Industry:</strong> {formState.industry || "-"}</li>
                  <li><strong>Service area:</strong> {formState.serviceArea || "-"}</li>
                  <li><strong>Goal:</strong> {formState.primaryGoal || "-"}</li>
                  <li><strong>Offer:</strong> {formState.offerPricing || "-"}</li>
                  <li><strong>Target:</strong> {formState.targetCustomer || "-"}</li>
                  <li><strong>Lead sources:</strong> {formState.leadSources || "-"}</li>
                  <li><strong>Calendar:</strong> {formState.calendarLink || "-"}</li>
                  <li><strong>Phone:</strong> {formState.contactPhone || "-"}</li>
                  <li><strong>Status:</strong> {status}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
