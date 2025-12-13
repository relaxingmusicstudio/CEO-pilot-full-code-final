import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";
import { useVisitor } from "@/contexts/VisitorContext";

const faqs = [
  {
    question: "What is an AI voice agent for HVAC companies?",
    answer:
      "Think of it as your best dispatcher who never sleeps, never calls in sick, and never has a bad day. An AI voice agent answers your phone 24/7, talks to customers naturally, books jobs on your calendar, and even upsells services like preventative maintenance or system tune-ups. The difference? It costs a fraction of a full-time employee and works every single night, weekend, and holiday—including those extreme weather days when call volume spikes 300-400%.",
  },
  {
    question: "How much does a missed call cost an HVAC business?",
    answer:
      "Here's the math that keeps HVAC contractors up at night: the average HVAC repair costs $351, but emergency jobs during peak season? Those run $500-$1,500. System replacements average $8,000-$15,000. With the industry missing 27% of calls and 80% of those callers going to competitors, you're potentially losing $7,500+ per month. The customer lifetime value in HVAC is $15,340—miss one customer and you lose years of maintenance contracts and referrals.",
  },
  {
    question: "How quickly can I get an AI voice agent set up?",
    answer:
      "We handle everything in 48 hours, start to finish. No tech headaches on your end. We'll hop on a quick call to learn your business, then our team builds and trains your custom AI agent with your pricing, service area, and booking preferences. By day three, you're capturing those emergency AC calls at 2 AM and heating emergencies during cold snaps.",
  },
  {
    question: "Can the AI handle emergency HVAC calls?",
    answer:
      "Absolutely—this is where it really shines. The AI is trained to recognize urgency words like 'no AC,' 'furnace not working,' 'no heat with kids at home,' or 'smell gas.' It immediately prioritizes these calls, gathers critical info (address, system type, symptoms), and can text or call your on-call technician within seconds. During extreme weather when call volume spikes 300-400%, your AI handles every single call without breaking a sweat.",
  },
  {
    question: "Does the AI understand HVAC-specific questions?",
    answer:
      "Your AI is trained on YOUR business—it knows your service area, pricing for repairs vs. replacements, which HVAC brands you work on, and your availability. It can answer questions about heat pump efficiency, explain why a system might be short-cycling, and even discuss energy rebates in your area. It's not a generic bot; it's YOUR virtual dispatcher who speaks fluent HVAC.",
  },
  {
    question: "How does the AI qualify repair vs. replacement opportunities?",
    answer:
      "The AI is trained to ask the right probing questions: 'How old is your system?' 'Has it needed repairs recently?' 'Are you noticing higher energy bills?' When a system is 10-15 years old and showing signs of wear, the AI flags it as a replacement opportunity and can mention your efficiency upgrade options. With heat pumps outselling gas furnaces since 2021, this qualification is more valuable than ever.",
  },
  {
    question: "What about the 110,000 technician shortage? Can AI help?",
    answer:
      "The HVAC industry needs 110,000 more technicians—they don't exist. AI doesn't replace your techs; it makes them 10-15 hours per week more efficient by eliminating phone tag, booking callbacks, and ensuring every lead is captured and qualified. Your technicians stay focused on installations and repairs while the AI handles the front office chaos.",
  },
  {
    question: "Will the AI work with my existing scheduling software?",
    answer:
      "We integrate with everything HVAC contractors actually use—ServiceTitan, Housecall Pro, Jobber, Google Calendar, Calendly, you name it. During setup, we connect directly to your system so when the AI books a job, it shows up on your calendar instantly. No double-booking, no manual entry, no 'oops, I forgot to add that appointment.'",
  },
  {
    question: "What happens during peak season when call volume explodes?",
    answer:
      "This is your secret weapon. While competitors let calls go to voicemail during the first heat wave or cold snap, your AI answers every single one—even when volume spikes 300-400%. No busy signals, no hold music, no frustrated customers calling the next company. You capture the surge while others scramble.",
  },
  {
    question: "Is there a long-term contract or commitment?",
    answer:
      "Nope, and that's intentional. We're confident enough in what we deliver that we don't need to lock you in. It's month-to-month, cancel anytime. That said, once you see your after-hours emergency calls turning into booked jobs and system replacements, you're not going to want to go back to voicemail purgatory.",
  },
];

const FAQSection = () => {
  const { trackCtaClick } = useVisitor();

  const handleAccordionChange = (value: string) => {
    if (value) {
      const index = parseInt(value.replace('item-', ''));
      const faq = faqs[index];
      if (faq) {
        trackCtaClick(`faq-${index + 1}-${faq.question.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      }
    }
  };

  return (
    <section className="py-20 bg-secondary/30" aria-labelledby="faq-heading">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <HelpCircle className="w-4 h-4" />
            Frequently Asked Questions
          </div>
          <h2
            id="faq-heading"
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
          >
            Everything You Need to Know
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Get answers to the most common questions about our AI voice agents
            for HVAC businesses.
          </p>
        </div>

        {/* FAQ Accordion */}
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-4"
          itemScope
          itemType="https://schema.org/FAQPage"
          onValueChange={handleAccordionChange}
        >
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="bg-card border border-border rounded-lg px-6 shadow-sm data-[state=open]:shadow-md transition-shadow"
              itemScope
              itemProp="mainEntity"
              itemType="https://schema.org/Question"
            >
              <AccordionTrigger className="text-left text-foreground font-semibold hover:text-accent hover:no-underline py-5 text-base md:text-lg">
                <span itemProp="name">{faq.question}</span>
              </AccordionTrigger>
              <AccordionContent
                className="text-muted-foreground pb-5 text-base leading-relaxed"
                itemScope
                itemProp="acceptedAnswer"
                itemType="https://schema.org/Answer"
              >
                <span itemProp="text">{faq.answer}</span>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            Still have questions? We're here to help.
          </p>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 text-accent font-semibold hover:underline"
            onClick={() => trackCtaClick("faq-contact-link")}
          >
            Contact our team
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
