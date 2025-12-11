import { Star, Quote } from "lucide-react";

const SocialProof = () => {
  const testimonial = {
    quote: "Recovered $58k in 90 days. The AI closes leads we didn't even know we had.",
    author: "Mike R.",
    company: "3-Truck Plumbing Co.",
    stars: 5,
  };

  const integrations = [
    "ServiceTitan",
    "Housecall Pro",
    "Google Calendar",
    "Jobber",
    "Calendly",
  ];

  return (
    <section className="py-20 bg-secondary">
      <div className="container">
        <div className="max-w-4xl mx-auto">
          {/* Testimonial */}
          <div className="bg-card rounded-2xl card-shadow p-8 md:p-12 text-center mb-12">
            <Quote className="w-12 h-12 text-accent mx-auto mb-6 opacity-50" />
            
            <blockquote className="text-2xl md:text-3xl font-bold text-foreground mb-6 leading-relaxed">
              "{testimonial.quote}"
            </blockquote>

            {/* Stars */}
            <div className="flex justify-center gap-1 mb-4">
              {[...Array(testimonial.stars)].map((_, i) => (
                <Star key={i} className="w-6 h-6 text-accent fill-accent" />
              ))}
            </div>

            <div className="text-foreground font-semibold">{testimonial.author}</div>
            <div className="text-muted-foreground">{testimonial.company}</div>
          </div>

          {/* Integration Bar */}
          <div className="text-center">
            <p className="text-muted-foreground mb-6">Integrates seamlessly with:</p>
            <div className="flex flex-wrap justify-center gap-4 md:gap-8">
              {integrations.map((integration, index) => (
                <div
                  key={index}
                  className="bg-card px-6 py-3 rounded-lg card-shadow text-foreground font-medium hover:bg-primary hover:text-primary-foreground transition-all duration-300 cursor-default"
                >
                  {integration}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
