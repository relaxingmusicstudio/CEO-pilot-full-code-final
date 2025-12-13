import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquare, Mail, User, Phone, Building, Users, PhoneCall, Clock, DollarSign, Headphones, Globe, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useVisitor } from "@/contexts/VisitorContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50, "First name must be less than 50 characters"),
  lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name must be less than 50 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().min(1, "Phone is required").max(20, "Phone must be less than 20 characters"),
  businessName: z.string().trim().min(1, "Business name is required").max(100, "Business name must be less than 100 characters"),
  website: z.string().trim().max(255, "Website must be less than 255 characters").optional(),
  businessType: z.string().min(1, "Business type is required"),
  teamSize: z.string().min(1, "Team size is required"),
  callVolume: z.string().min(1, "Call volume is required"),
  currentCallHandling: z.string().min(1, "Current call handling is required"),
  avgJobValue: z.string().min(1, "Average job value is required"),
  aiTimeline: z.string().min(1, "Timeline is required"),
  message: z.string().trim().max(1000, "Message must be less than 1000 characters").optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const businessTypes = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "General Contractor",
  "Other",
];

const teamSizes = [
  "Solo",
  "2-5",
  "6-10",
  "10+ trucks",
];

const callVolumes = [
  "Under 50 calls",
  "50-100 calls",
  "100-200 calls",
  "200+ calls",
];

const currentCallHandling = [
  "Answer myself",
  "Office staff",
  "Answering service",
  "Voicemail",
  "Miss most calls",
];

const avgJobValues = [
  "Under $250",
  "$250-500",
  "$500-1,000",
  "$1,000-2,500",
  "$2,500+",
];

const aiTimelines = [
  "ASAP - Losing calls now",
  "Within 30 days",
  "1-3 months",
  "Just exploring",
];

const otherServicesOptions = [
  "Websites That Convert",
  "SEO",
  "Local SEO",
  "Paid Ads",
];

const ContactForm = () => {
  const { toast } = useToast();
  const { getGHLData, trackSectionView } = useVisitor();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [formData, setFormData] = useState<ContactFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    businessName: "",
    website: "",
    businessType: "",
    teamSize: "",
    callVolume: "",
    currentCallHandling: "",
    avgJobValue: "",
    aiTimeline: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});

  const handleServiceToggle = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  };

  // Format phone number as XXX-XXX-XXXX
  const formatPhoneNumber = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');
    if (phoneNumber.length <= 3) {
      return phoneNumber;
    } else if (phoneNumber.length <= 6) {
      return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
    } else {
      return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'phone') {
      const formattedPhone = formatPhoneNumber(value);
      setFormData((prev) => ({ ...prev, phone: formattedPhone }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    
    if (errors[name as keyof ContactFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSelectChange = (name: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof ContactFormData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      // Get visitor intelligence data
      const visitorData = getGHLData();
      
      const { data, error } = await supabase.functions.invoke('contact-form', {
        body: {
          name: `${result.data.firstName} ${result.data.lastName}`,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          email: result.data.email,
          phone: result.data.phone,
          businessName: result.data.businessName,
          website: result.data.website || "",
          message: result.data.message || "",
          businessType: result.data.businessType,
          teamSize: result.data.teamSize,
          callVolume: result.data.callVolume,
          currentSolution: result.data.currentCallHandling,
          avgJobValue: result.data.avgJobValue,
          aiTimeline: result.data.aiTimeline,
          otherServicesNeeded: selectedServices.join(", "),
          formName: "Contact Form",
          // Visitor Intelligence fields
          visitorId: visitorData.visitor_id,
          isReturningVisitor: visitorData.is_returning_visitor,
          visitCount: visitorData.visit_count,
          firstVisitDate: visitorData.first_visit_date,
          lastVisitDate: visitorData.last_visit_date,
          utmSource: visitorData.utm_source,
          utmMedium: visitorData.utm_medium,
          utmCampaign: visitorData.utm_campaign,
          utmContent: visitorData.utm_content,
          utmTerm: visitorData.utm_term,
          referrerSource: visitorData.referrer_source,
          landingPage: visitorData.landing_page,
          entryPage: visitorData.entry_page,
          deviceType: visitorData.device_type,
          browser: visitorData.browser,
          pagesViewed: visitorData.pages_viewed,
          sectionsViewed: visitorData.sections_viewed,
          ctaClicks: visitorData.cta_clicks,
          calculatorUsed: visitorData.calculator_used,
          demoWatched: visitorData.demo_watched,
          demoWatchTime: visitorData.demo_watch_time,
          scrollDepth: visitorData.scroll_depth,
          timeOnSite: visitorData.time_on_site,
          chatbotOpened: visitorData.chatbot_opened,
          chatbotEngaged: visitorData.chatbot_engaged,
          engagementScore: visitorData.engagement_score,
          interestSignals: visitorData.interest_signals,
          behavioralIntent: visitorData.behavioral_intent,
        },
      });

      if (error) {
        throw error;
      }

      console.log("Form submission response:", data);

      toast({
        title: "Message Sent!",
        description: "We'll get back to you within 24 hours.",
      });

      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        businessName: "",
        website: "",
        businessType: "",
        teamSize: "",
        callVolume: "",
        currentCallHandling: "",
        avgJobValue: "",
        aiTimeline: "",
        message: "",
      });
      setSelectedServices([]);
    } catch (error) {
      console.error("Error sending to webhook:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-6">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">Get in Touch</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to Transform Your HVAC Business? <span className="text-accent">Let's Talk</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tell us about your business and we'll show you exactly how AI can help you capture more leads and grow revenue.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-card rounded-2xl p-8 md:p-10 shadow-lg border border-border relative">
            {/* Loading Overlay */}
            {isSubmitting && (
              <div className="absolute inset-0 bg-background/70 rounded-2xl flex items-center justify-center z-10 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
                  <span className="text-base font-medium text-foreground">Submitting your request...</span>
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* First Name Field */}
                <div className="space-y-2">
                  <label htmlFor="firstName" className="text-sm font-medium text-foreground flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    First Name *
                  </label>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={errors.firstName ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-destructive">{errors.firstName}</p>
                  )}
                </div>

                {/* Last Name Field */}
                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm font-medium text-foreground flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Last Name *
                  </label>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Smith"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={errors.lastName ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-destructive">{errors.lastName}</p>
                  )}
                </div>
              </div>

              {/* Contact Info Row */}
              <div className="grid md:grid-cols-3 gap-6">
                {/* Email Field */}
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Email Address *
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    className={errors.email ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>

                {/* Phone Field */}
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    Phone Number *
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="555-123-4567"
                    value={formData.phone}
                    onChange={handleChange}
                    className={errors.phone ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone}</p>
                  )}
                </div>

                {/* Business Name Field */}
                <div className="space-y-2">
                  <label htmlFor="businessName" className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    Business Name *
                  </label>
                  <Input
                    id="businessName"
                    name="businessName"
                    type="text"
                    placeholder="ABC HVAC Services"
                    value={formData.businessName}
                    onChange={handleChange}
                    className={errors.businessName ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.businessName && (
                    <p className="text-sm text-destructive">{errors.businessName}</p>
                  )}
                </div>
              </div>

              {/* Website Row */}
              <div className="space-y-2">
                <label htmlFor="website" className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  Website (Optional)
                </label>
                <Input
                  id="website"
                  name="website"
                  type="url"
                  placeholder="https://yourbusiness.com"
                  value={formData.website}
                  onChange={handleChange}
                  className={errors.website ? "border-destructive" : ""}
                  disabled={isSubmitting}
                />
                {errors.website && (
                  <p className="text-sm text-destructive">{errors.website}</p>
                )}
              </div>

              {/* Business Info Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Business Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    Business Type *
                  </label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(value) => handleSelectChange("businessType", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={errors.businessType ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.businessType && (
                    <p className="text-sm text-destructive">{errors.businessType}</p>
                  )}
                </div>

                {/* Team Size */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    Team Size *
                  </label>
                  <Select
                    value={formData.teamSize}
                    onValueChange={(value) => handleSelectChange("teamSize", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={errors.teamSize ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select team size" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamSizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.teamSize && (
                    <p className="text-sm text-destructive">{errors.teamSize}</p>
                  )}
                </div>
              </div>

              {/* Call Handling & Job Value Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Current Call Handling */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-muted-foreground" />
                    How do you handle calls now? *
                  </label>
                  <Select
                    value={formData.currentCallHandling}
                    onValueChange={(value) => handleSelectChange("currentCallHandling", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={errors.currentCallHandling ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select current solution" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentCallHandling.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.currentCallHandling && (
                    <p className="text-sm text-destructive">{errors.currentCallHandling}</p>
                  )}
                </div>

                {/* Average Job Value */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    Average Job Value *
                  </label>
                  <Select
                    value={formData.avgJobValue}
                    onValueChange={(value) => handleSelectChange("avgJobValue", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={errors.avgJobValue ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select avg job value" />
                    </SelectTrigger>
                    <SelectContent>
                      {avgJobValues.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.avgJobValue && (
                    <p className="text-sm text-destructive">{errors.avgJobValue}</p>
                  )}
                </div>
              </div>

              {/* Volume & Timeline Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Call Volume */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-muted-foreground" />
                    Monthly Call Volume *
                  </label>
                  <Select
                    value={formData.callVolume}
                    onValueChange={(value) => handleSelectChange("callVolume", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={errors.callVolume ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select call volume" />
                    </SelectTrigger>
                    <SelectContent>
                      {callVolumes.map((volume) => (
                        <SelectItem key={volume} value={volume}>
                          {volume}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.callVolume && (
                    <p className="text-sm text-destructive">{errors.callVolume}</p>
                  )}
                </div>

                {/* AI Timeline */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    When do you want to start? *
                  </label>
                  <Select
                    value={formData.aiTimeline}
                    onValueChange={(value) => handleSelectChange("aiTimeline", value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={errors.aiTimeline ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select timeline" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiTimelines.map((timeline) => (
                        <SelectItem key={timeline} value={timeline}>
                          {timeline}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.aiTimeline && (
                    <p className="text-sm text-destructive">{errors.aiTimeline}</p>
                  )}
                </div>
              </div>

              {/* Other Services Needed (Optional Multi-Select) */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  Other Services Needed (Optional)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {otherServicesOptions.map((service) => (
                    <div
                      key={service}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`service-${service}`}
                        checked={selectedServices.includes(service)}
                        onCheckedChange={() => handleServiceToggle(service)}
                        disabled={isSubmitting}
                      />
                      <label
                        htmlFor={`service-${service}`}
                        className="text-sm text-muted-foreground cursor-pointer"
                      >
                        {service}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message Field (Optional) */}
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-foreground flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  Additional Details (Optional)
                </label>
                <Textarea
                  id="message"
                  name="message"
                  placeholder="Tell us more about your specific needs or questions..."
                  rows={3}
                  value={formData.message}
                  onChange={handleChange}
                  className={errors.message ? "border-destructive" : ""}
                  disabled={isSubmitting}
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message}</p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full md:w-auto"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Get My Free Consultation
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Additional Info */}
          <p className="text-center text-muted-foreground text-sm mt-6">
            We typically respond within 24 hours during business days.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
