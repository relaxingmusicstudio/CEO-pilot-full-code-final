import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Calculator, TrendingDown, TrendingUp, Phone } from "lucide-react";

const RevenueCalculator = () => {
  const [monthlyCalls, setMonthlyCalls] = useState([200]);
  const [avgJobValue, setAvgJobValue] = useState(850);
  const [conversionRate, setConversionRate] = useState(30);
  const [showResults, setShowResults] = useState(false);

  const missedCallRate = 0.28; // 28% missed calls industry average
  const missedCalls = Math.round(monthlyCalls[0] * missedCallRate);
  const potentialJobs = Math.round(missedCalls * (conversionRate / 100));
  const lostRevenue = potentialJobs * avgJobValue;
  const recoveredRevenue = Math.round(lostRevenue * 0.78); // 78% recovery with AI

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="calculator" className="py-20 bg-secondary">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            How Much Is Your Phone <span className="text-accent">Costing You?</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Calculate the revenue you're losing from missed calls right now.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-2xl p-8 card-shadow">
            <div className="grid md:grid-cols-3 gap-8 mb-8">
              {/* Monthly Calls Slider */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 font-semibold text-foreground">
                  <Phone className="w-5 h-5 text-primary" />
                  Monthly Calls
                </label>
                <Slider
                  value={monthlyCalls}
                  onValueChange={setMonthlyCalls}
                  min={50}
                  max={500}
                  step={10}
                  className="mt-4"
                />
                <div className="text-center">
                  <span className="text-3xl font-bold text-primary">{monthlyCalls[0]}</span>
                  <span className="text-muted-foreground ml-2">calls/month</span>
                </div>
              </div>

              {/* Average Job Value */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 font-semibold text-foreground">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Avg. Job Value
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={avgJobValue}
                    onChange={(e) => setAvgJobValue(Number(e.target.value))}
                    className="w-full h-12 pl-8 pr-4 rounded-lg border-2 border-border bg-background text-foreground text-lg font-semibold focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 font-semibold text-foreground">
                  <Calculator className="w-5 h-5 text-primary" />
                  Conversion Rate
                </label>
                <select
                  value={conversionRate}
                  onChange={(e) => setConversionRate(Number(e.target.value))}
                  className="w-full h-12 px-4 rounded-lg border-2 border-border bg-background text-foreground text-lg font-semibold focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all cursor-pointer"
                >
                  <option value={25}>25%</option>
                  <option value={30}>30%</option>
                  <option value={35}>35%</option>
                </select>
              </div>
            </div>

            <div className="flex justify-center mb-8">
              <Button
                variant="accent"
                size="lg"
                onClick={() => setShowResults(true)}
                className="group"
              >
                <Calculator className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                CALCULATE MY LOSS
              </Button>
            </div>

            {/* Results */}
            {showResults && (
              <div className="bg-destructive/5 border-2 border-destructive/20 rounded-xl p-6 animate-scale-in">
                <div className="flex items-center gap-3 mb-6">
                  <TrendingDown className="w-8 h-8 text-destructive" />
                  <h3 className="text-xl font-bold text-destructive">Your Estimated Monthly Loss</h3>
                </div>

                <div className="grid md:grid-cols-3 gap-6 mb-6">
                  <div className="text-center p-4 bg-card rounded-lg">
                    <div className="text-3xl font-bold text-destructive mb-1">{missedCalls}</div>
                    <div className="text-muted-foreground text-sm">Missed Calls</div>
                  </div>
                  <div className="text-center p-4 bg-card rounded-lg">
                    <div className="text-3xl font-bold text-destructive mb-1">${lostRevenue.toLocaleString()}</div>
                    <div className="text-muted-foreground text-sm">Lost Revenue</div>
                  </div>
                  <div className="text-center p-4 bg-accent/10 rounded-lg border-2 border-accent/30">
                    <div className="text-3xl font-bold text-accent mb-1">+${recoveredRevenue.toLocaleString()}</div>
                    <div className="text-foreground text-sm font-medium">Recover with ApexLocal360</div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button
                    variant="hero"
                    size="lg"
                    onClick={scrollToPricing}
                  >
                    😮 I NEED THIS - SHOW ME PLANS
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RevenueCalculator;
