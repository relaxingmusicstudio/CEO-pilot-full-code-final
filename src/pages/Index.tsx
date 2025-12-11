import HeroSection from "@/components/HeroSection";
import RevenueCalculator from "@/components/RevenueCalculator";
import VoiceDemo from "@/components/VoiceDemo";
import ProcessTimeline from "@/components/ProcessTimeline";
import PricingPlans from "@/components/PricingPlans";
import SocialProof from "@/components/SocialProof";
import Chatbot from "@/components/Chatbot";
import StickyFooter from "@/components/StickyFooter";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <RevenueCalculator />
      <VoiceDemo />
      <ProcessTimeline />
      <PricingPlans />
      <SocialProof />
      <Footer />
      <Chatbot />
      <StickyFooter />
    </main>
  );
};

export default Index;
