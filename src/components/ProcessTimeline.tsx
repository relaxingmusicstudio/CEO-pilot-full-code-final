import { Lightbulb, Wrench, Rocket, CheckCircle, Clock, TrendingUp } from "lucide-react";

const ProcessTimeline = () => {
  const steps = [
    {
      day: "Day 1",
      title: "Kickoff",
      description: "We learn your business, services, pricing, and how you handle calls.",
      icon: Lightbulb,
      color: "bg-primary",
    },
    {
      day: "Day 2",
      title: "Build",
      description: "We craft your custom AI agent and connect to your scheduling tools.",
      icon: Wrench,
      color: "bg-accent",
    },
    {
      day: "Day 3",
      title: "Launch",
      description: "We go live and manage everything. You start capturing lost revenue.",
      icon: Rocket,
      color: "bg-primary",
    },
  ];

  const trustStats = [
    { icon: CheckCircle, value: "78%", label: "Fewer Missed Calls" },
    { icon: Clock, value: "40+", label: "Hours/Month Saved" },
    { icon: TrendingUp, value: "30-Day", label: "ROI Guarantee" },
  ];

  return (
    <section className="py-20 bg-secondary">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            We Build It. <span className="text-accent">You Profit.</span> It's That Simple.
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Your AI dispatcher is live in 48 hours. No meetings. No hassle.
          </p>
        </div>

        {/* Timeline */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="relative">
            {/* Connection Line */}
            <div className="absolute top-16 left-0 right-0 h-1 bg-border hidden md:block">
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary opacity-50" />
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="relative flex flex-col items-center text-center group"
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  {/* Icon Container */}
                  <div
                    className={`w-32 h-32 rounded-full ${step.color} flex items-center justify-center shadow-lg transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl relative z-10 mb-6`}
                  >
                    <step.icon className="w-12 h-12 text-primary-foreground" />
                  </div>

                  {/* Day Badge */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-bold shadow-md">
                    {step.day}
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-foreground mb-2">{step.title}</h3>
                  <p className="text-muted-foreground max-w-xs">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trust Bar */}
        <div className="bg-card rounded-2xl card-shadow p-8">
          <div className="grid md:grid-cols-3 gap-8">
            {trustStats.map((stat, index) => (
              <div
                key={index}
                className="flex items-center justify-center gap-4 p-4 rounded-xl bg-secondary/50"
              >
                <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                  <stat.icon className="w-7 h-7 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-muted-foreground text-sm">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProcessTimeline;
