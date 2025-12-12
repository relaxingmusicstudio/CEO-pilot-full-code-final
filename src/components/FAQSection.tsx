import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "How does the AI handle emergency HVAC calls like no AC in summer?",
    answer:
      "Our AI recognizes emergency keywords like 'no AC,' 'not cooling,' 'furnace out,' and 'no heat' and prioritizes these calls immediately. It captures the address, confirms the $149 emergency diagnostic fee, and dispatches your nearest technician—all while the customer is still on the line. 55% of negative HVAC reviews cite slow response, so speed is critical for your reputation and revenue.",
  },
  {
    question: "Will the AI know the difference between repair vs. replacement leads?",
    answer:
      "Yes. The AI asks qualifying questions about system age, repair history, and symptoms. Systems over 10-15 years old with frequent repairs are flagged as potential replacement opportunities. With the average customer lifetime value at $15,340 and replacements commanding 62% of equipment sales, identifying these high-value opportunities is crucial for maximizing revenue.",
  },
  {
    question: "Can it handle calls about different HVAC services - AC, heating, heat pumps?",
    answer:
      "Absolutely. We train the AI on your full service menu including AC repair and installation, furnace service, heat pump installation, duct cleaning, indoor air quality, and smart thermostat setup. Heat pumps have outsold gas furnaces every year since 2021, so we ensure the AI can discuss modern options and position your company as a full-service provider.",
  },
  {
    question: "What about after-hours emergency calls?",
    answer:
      "This is where AI delivers the most value. 27% of calls are missed during business hours, but after-hours is where you lose the most emergency revenue—often $500+ jobs. Our AI answers every call 24/7/365, capturing those $351+ emergency repairs that would otherwise go to competitors. No more 2 AM calls waking up your family while still capturing every opportunity.",
  },
  {
    question: "How does this help with the HVAC technician shortage?",
    answer:
      "The industry faces a shortage of 110,000 technicians. Every minute your skilled techs spend answering phones is time not spent on billable work. Our AI handles all call answering, lead qualification, and scheduling—freeing your team to focus on what they do best. One AI dispatcher can handle unlimited concurrent calls during heat waves or cold snaps when you need it most.",
  },
  {
    question: "What's the ROI for an HVAC company?",
    answer:
      "With an average repair value of $351 and customer lifetime value of $15,340, capturing just 2-3 additional jobs per week typically covers your monthly investment multiple times over. The average cost per lead in HVAC is $153—our AI captures leads at a fraction of that cost while providing 24/7 coverage no receptionist can match.",
  },
  {
    question: "Can it schedule preventive maintenance appointments?",
    answer:
      "Yes, and this is a huge opportunity. Only 30% of homeowners schedule preventive maintenance despite it preventing 80% of emergency breakdowns. The AI proactively mentions maintenance plans during service calls, helping you build recurring revenue. Maintenance contracts are the foundation of profitable HVAC businesses.",
  },
  {
    question: "How does it handle multiple calls at once during heat waves or cold snaps?",
    answer:
      "Unlike human receptionists, our AI handles unlimited simultaneous calls. During extreme weather events when call volume spikes 300-400%, every call still gets answered instantly. This is exactly when 80% of your competitors' callers hang up on voicemail and start searching for someone who actually picks up—that someone should be you.",
  },
];

const FAQSection = () => {
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
