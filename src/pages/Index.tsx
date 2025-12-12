import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import RevenueCalculator from "@/components/RevenueCalculator";
import VoiceDemo from "@/components/VoiceDemo";
import ProcessTimeline from "@/components/ProcessTimeline";
import PricingPlans from "@/components/PricingPlans";
import SocialProof from "@/components/SocialProof";
import FAQSection from "@/components/FAQSection";
import ContactForm from "@/components/ContactForm";
import Chatbot from "@/components/Chatbot";
import StickyFooter from "@/components/StickyFooter";
import Footer from "@/components/Footer";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import PlaybookSection from "@/components/PlaybookSection";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>AI Voice Agent for Plumbers | 24/7 Dispatcher - ApexLocal360</title>
        <meta name="description" content="Stop missing $1,200+ plumbing calls. Our AI voice agent answers 24/7, books appointments, upsells services, and qualifies leads. Done-for-you setup in 48 hours. No contracts." />
      </Helmet>
      <main className="min-h-screen bg-background" itemScope itemType="https://schema.org/WebPage">
        <Header />
        <article itemProp="mainContentOfPage">
          <HeroSection />
          <section id="calculator" aria-label="Revenue Calculator">
            <RevenueCalculator />
          </section>
          <section id="demo" aria-label="AI Voice Demo">
            <VoiceDemo />
          </section>
          <section id="process" aria-label="Our Process">
            <ProcessTimeline />
          </section>
          <section id="pricing" aria-label="Pricing Plans">
            <PricingPlans />
          </section>
          <section id="testimonials" aria-label="Customer Testimonials">
            <SocialProof />
          </section>
          <section id="playbook" aria-label="Free Local Service Playbook">
            <PlaybookSection />
          </section>
          <section id="faq" aria-label="Frequently Asked Questions">
            <FAQSection />
          </section>
          <section id="contact" aria-label="Contact Form">
            <ContactForm />
          </section>
        </article>
        <Footer />
        <Chatbot />
        <StickyFooter />
        <ExitIntentPopup />
      </main>
    </>
  );
};

export default Index;
