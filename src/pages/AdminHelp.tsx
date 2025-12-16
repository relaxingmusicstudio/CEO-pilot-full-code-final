import { useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Video,
  HelpCircle,
  MessageCircle,
  Search,
  CheckCircle,
  ExternalLink,
  Zap,
  Users,
  BarChart3,
  Phone,
  Mail,
  Brain,
  Settings,
  FileText,
  TrendingUp,
} from "lucide-react";

interface GuideItem {
  id: string;
  title: string;
  description: string;
  steps: string[];
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

const guides: GuideItem[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Set up your AI voice agent and start capturing leads",
    category: "basics",
    difficulty: "beginner",
    steps: [
      "Navigate to Settings → User Settings to enter your business information",
      "Add your services, business hours, and service area",
      "Build your Knowledge Base with FAQs, pricing, and policies",
      "Test your AI agent using the Voice Demo on the homepage",
      "Monitor leads in the CRM section",
    ],
  },
  {
    id: "ceo-console",
    title: "Using the CEO Console",
    description: "Get AI-powered insights and recommendations",
    category: "features",
    difficulty: "intermediate",
    steps: [
      "Access the CEO Console from the sidebar",
      "Ask natural language questions about your business",
      "Review AI-generated insights and recommendations",
      "Use quick actions like 'Weekly Summary' or 'Conversion Insights'",
      "Let the AI suggest prompt improvements based on conversation analysis",
    ],
  },
  {
    id: "lead-management",
    title: "Managing Leads",
    description: "Track and convert leads through the pipeline",
    category: "features",
    difficulty: "beginner",
    steps: [
      "View all leads in the CRM → Leads section",
      "Filter by status: New, Contacted, Qualified, Won, Lost",
      "Click on a lead to view full conversation history",
      "Use the CEO Agent to update lead statuses via natural language",
      "Set up automated follow-up sequences in the Sequences section",
    ],
  },
  {
    id: "billing-management",
    title: "Client Billing",
    description: "Create invoices and track payments",
    category: "features",
    difficulty: "intermediate",
    steps: [
      "Navigate to the Billing section",
      "Create a new invoice by clicking 'Create Invoice'",
      "Select a client and add line items",
      "Send invoices directly to clients",
      "Track payment status and record payments when received",
    ],
  },
  {
    id: "knowledge-base",
    title: "Building Your Knowledge Base",
    description: "Help your AI agent answer questions accurately",
    category: "basics",
    difficulty: "beginner",
    steps: [
      "Go to Settings → User Settings → Knowledge tab",
      "Add entries for common questions (pricing, hours, services)",
      "Categorize entries for better organization",
      "Toggle 'AI Accessible' for entries you want the agent to use",
      "Regularly update based on customer conversations",
    ],
  },
  {
    id: "analytics",
    title: "Understanding Analytics",
    description: "Track performance and optimize conversions",
    category: "features",
    difficulty: "intermediate",
    steps: [
      "Review the Analytics dashboard for traffic and conversion data",
      "Analyze traffic sources to see where leads come from",
      "Check conversation outcomes to identify drop-off points",
      "Use A/B testing to optimize chatbot prompts",
      "Export reports for deeper analysis",
    ],
  },
];

const faqs = [
  {
    question: "How does the AI voice agent work?",
    answer: "Our AI agent uses advanced language models to have natural conversations with your customers. It can answer questions about your services, pricing, and availability, and it automatically captures lead information for follow-up.",
  },
  {
    question: "What happens when the AI can't answer a question?",
    answer: "The AI is trained to gracefully handle questions it can't answer. It will acknowledge the customer's question and offer to have a human team member follow up. These interactions are flagged in your dashboard for review.",
  },
  {
    question: "How do I improve the AI's responses?",
    answer: "Build a comprehensive Knowledge Base in Settings → User Settings. Add specific information about your pricing, services, policies, and FAQs. The more context you provide, the better the AI can assist your customers.",
  },
  {
    question: "Can I customize the AI's personality?",
    answer: "Yes! In Settings → User Settings → AI Preferences, you can adjust the agent's tone (professional, friendly, casual) and other behavioral settings to match your brand voice.",
  },
  {
    question: "How are leads scored?",
    answer: "Leads are automatically scored based on engagement signals: conversation length, questions asked, services discussed, and urgency indicators. Hot leads (score 75+) are prioritized for immediate follow-up.",
  },
  {
    question: "What integrations are available?",
    answer: "We integrate with popular CRMs, calendar systems, and communication tools. Check Settings → Integrations to configure Stripe, Google Calendar, Twilio, and more.",
  },
  {
    question: "How do I track missed calls?",
    answer: "The system logs all incoming calls, including missed ones. View the Call Logs section to see call history, and set up notifications to alert you when calls go unanswered.",
  },
  {
    question: "Can the AI book appointments?",
    answer: "Yes, when integrated with your calendar system (Google Calendar, Calendly, etc.), the AI can check availability and book appointments directly during conversations.",
  },
];

const AdminHelp = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [contactForm, setContactForm] = useState({ subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const filteredGuides = guides.filter(
    (guide) =>
      guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guide.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleContactSubmit = async () => {
    if (!contactForm.subject || !contactForm.message) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    // Simulate submission
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSubmitting(false);
    setContactForm({ subject: "", message: "" });
    toast({ title: "Support request submitted", description: "We'll get back to you within 24 hours." });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-500/10 text-green-500";
      case "intermediate":
        return "bg-yellow-500/10 text-yellow-500";
      case "advanced":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <>
      <Helmet>
        <title>Help Center | ApexLocal360</title>
      </Helmet>
      <AdminLayout title="Help Center" subtitle="Guides, tutorials, and support resources">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search guides, FAQs, and documentation..."
              className="pl-10 h-12 text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <Zap className="h-8 w-8 mb-2 text-primary" />
                <span className="font-medium">Quick Start</span>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <Video className="h-8 w-8 mb-2 text-primary" />
                <span className="font-medium">Video Tutorials</span>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <Brain className="h-8 w-8 mb-2 text-primary" />
                <span className="font-medium">AI Training</span>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <MessageCircle className="h-8 w-8 mb-2 text-primary" />
                <span className="font-medium">Contact Support</span>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="guides" className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="guides" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Guides
              </TabsTrigger>
              <TabsTrigger value="faqs" className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                FAQs
              </TabsTrigger>
              <TabsTrigger value="support" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Support
              </TabsTrigger>
            </TabsList>

            {/* Guides Tab */}
            <TabsContent value="guides" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {filteredGuides.map((guide) => (
                  <Card key={guide.id} className="hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{guide.title}</CardTitle>
                          <CardDescription>{guide.description}</CardDescription>
                        </div>
                        <Badge className={getDifficultyColor(guide.difficulty)}>
                          {guide.difficulty}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {guide.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filteredGuides.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No guides found matching "{searchQuery}"</p>
                </div>
              )}
            </TabsContent>

            {/* FAQs Tab */}
            <TabsContent value="faqs">
              <Card>
                <CardHeader>
                  <CardTitle>Frequently Asked Questions</CardTitle>
                  <CardDescription>
                    Find answers to the most common questions about the platform
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {filteredFaqs.map((faq, index) => (
                      <AccordionItem key={index} value={`faq-${index}`}>
                        <AccordionTrigger className="text-left">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

                  {filteredFaqs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No FAQs found matching "{searchQuery}"</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Support Tab */}
            <TabsContent value="support" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Submit a Support Request
                    </CardTitle>
                    <CardDescription>
                      Our team typically responds within 24 hours
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        placeholder="Brief description of your issue"
                        value={contactForm.subject}
                        onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Please describe your issue or question in detail..."
                        className="min-h-[150px]"
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleContactSubmit}
                      disabled={submitting}
                    >
                      {submitting ? "Submitting..." : "Submit Request"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      Other Ways to Get Help
                    </CardTitle>
                    <CardDescription>
                      Additional support resources
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Brain className="h-5 w-5 text-primary" />
                        Ask the CEO Agent
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Get instant answers by asking questions in the CEO Console. The AI can help with analytics, strategy, and platform usage.
                      </p>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/app/ceo">Open CEO Console</a>
                      </Button>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <FileText className="h-5 w-5 text-primary" />
                        Documentation
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Browse our comprehensive documentation for detailed setup guides and API references.
                      </p>
                      <Button variant="outline" size="sm">
                        View Docs
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Users className="h-5 w-5 text-primary" />
                        Community
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Join our community of HVAC business owners to share tips and get advice.
                      </p>
                      <Button variant="outline" size="sm">
                        Join Community
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Card */}
              <Card className="border-green-500/50 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                    <div>
                      <p className="font-medium text-green-600">All Systems Operational</p>
                      <p className="text-sm text-muted-foreground">
                        Last checked: {new Date().toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </>
  );
};

export default AdminHelp;
