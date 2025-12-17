/**
 * OnboardingCard - In-dashboard onboarding experience
 * 
 * Shows progress and CTA for new users to complete setup.
 * Triggers the CEO agent onboarding conversation when clicked.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Rocket, ArrowRight, CheckCircle2 } from "lucide-react";

interface OnboardingCardProps {
  currentStep: number;
  totalSteps: number;
  onContinue: () => void;
  isLoading?: boolean;
}

const STEPS = [
  { label: "Business basics", description: "Name, industry, and services" },
  { label: "Your goals", description: "What you want to achieve" },
  { label: "Get started", description: "Personalized recommendations" },
];

export function OnboardingCard({
  currentStep,
  totalSteps,
  onContinue,
  isLoading = false,
}: OnboardingCardProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Left: Icon and Text */}
          <div className="flex items-start gap-4 flex-1">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">
                Welcome! Let's set up your Command Center
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Answer a few quick questions so your AI CEO can start helping you run your business.
              </p>
            </div>
          </div>

          {/* Right: Progress and CTA */}
          <div className="flex flex-col gap-4 md:w-64 shrink-0">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Setup progress</span>
                <span className="font-medium">{currentStep}/{totalSteps}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* CTA Button */}
            <Button 
              onClick={onContinue}
              disabled={isLoading}
              className="w-full gap-2"
            >
              {currentStep === 0 ? "Start setup" : "Continue setup"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Steps Preview */}
        <div className="mt-6 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 md:gap-8 overflow-x-auto">
            {STEPS.map((step, index) => {
              const isComplete = index < currentStep;
              const isCurrent = index === currentStep;
              
              return (
                <div 
                  key={step.label}
                  className={`flex items-center gap-2 shrink-0 ${
                    isComplete ? "text-primary" : isCurrent ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isComplete 
                      ? "bg-primary text-primary-foreground" 
                      : isCurrent 
                        ? "bg-primary/20 text-primary border border-primary" 
                        : "bg-muted"
                  }`}>
                    {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium">{step.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingCard;
