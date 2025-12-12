import { Button } from "@/components/ui/button";
import { Check, X, Star, Wrench, Rocket, Phone } from "lucide-react";

const PricingPlans = () => {
  const plans = [
    {
      name: "STARTER",
      price: "$497",
      period: "/mo",
      bestFor: "Solo HVAC tech / 1 truck",
      icon: Wrench,
      popular: false,
      features: [
        { text: "Core AI Dispatcher", included: true, note: "Answers, Books, Q&A" },
        { text: "The Closer Agent", included: false, note: "Follow up on quotes" },
        { text: "500 mins/month", included: true },
        { text: "Email & Setup Support", included: true },
        { text: "Basic Analytics", included: true },
      ],
      cta: "🛠️ ACTIVATE STARTER PLAN",
      stripeLink: "[STRIPE_STARTER_LINK]",
    },
    {
      name: "PROFESSIONAL",
      price: "$1,497",
      period: "/mo",
      bestFor: "2-4 truck HVAC operations",
      icon: Rocket,
      popular: true,
      features: [
        { text: "ADVANCED AI Dispatcher", included: true, note: "With Upsell & Probe Logic" },
        { text: "The Closer Agent", included: true, note: "White-labeled nurture" },
        { text: "Custom AI Lead Gen System", included: true, note: "Automated follow-ups & conversions", highlight: true },
        { text: "1,500 mins/month", included: true },
        { text: "Priority Support & Weekly Tuning", included: true },
        { text: "Full Analytics Dashboard", included: true },
      ],
      cta: "🚀 ACTIVATE PROFESSIONAL PLAN",
      stripeLink: "[STRIPE_GROWTH_LINK]",
    },
  ];

  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Choose Your <span className="text-accent">AI Partner</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            No meetings. No contracts. Just activation. Built for HVAC companies.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-2xl p-8 transition-all duration-300 ${
                  plan.popular
                    ? "bg-primary text-primary-foreground card-shadow-hover scale-105 border-4 border-accent"
                    : "bg-card text-card-foreground card-shadow hover:card-shadow-hover"
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg">
                    <Star className="w-4 h-4 fill-current" />
                    MOST POPULAR
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center mb-8 pt-4">
                  <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                    plan.popular ? "bg-accent" : "bg-primary"
                  }`}>
                    <plan.icon className={`w-8 h-8 ${plan.popular ? "text-accent-foreground" : "text-primary-foreground"}`} />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className={`text-sm ${plan.popular ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {plan.bestFor}
                  </p>
                </div>

                {/* Price */}
                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-extrabold">{plan.price}</span>
                    <span className={`text-lg ml-1 ${plan.popular ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {plan.period}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className={`flex items-start gap-3 ${feature.highlight ? "bg-accent/20 -mx-2 px-2 py-2 rounded-lg border border-accent/30" : ""}`}>
                      {feature.included ? (
                        <Check className={`w-5 h-5 mt-0.5 shrink-0 ${feature.highlight ? "text-accent" : plan.popular ? "text-accent" : "text-accent"}`} />
                      ) : (
                        <X className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground/50" />
                      )}
                      <div>
                        <span className={`${feature.included ? "" : "opacity-50"} ${feature.highlight ? "font-semibold text-accent" : ""}`}>
                          {feature.text}
                        </span>
                        {feature.note && (
                          <span className={`block text-sm ${
                            plan.popular ? "text-primary-foreground/60" : "text-muted-foreground"
                          }`}>
                            {feature.note}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <a href={plan.stripeLink} target="_blank" rel="noopener noreferrer" className="w-full">
                  <Button
                    variant={plan.popular ? "hero" : "accent"}
                    size="xl"
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </a>
              </div>
            ))}
          </div>

          {/* Custom Quote CTA */}
          <div className="mt-12 text-center">
            <div className="inline-block bg-secondary rounded-2xl p-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Phone className="w-6 h-6 text-primary" />
                <span className="text-lg font-semibold text-foreground">
                  Running a larger HVAC operation?
                </span>
              </div>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
              >
                📞 NEED A CUSTOM QUOTE FOR 5+ TRUCKS?
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingPlans;
