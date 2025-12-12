import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquare, Mail, User, Phone, Building, Users, PhoneCall, Clock, Sparkles } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().min(1, "Phone is required").max(20, "Phone must be less than 20 characters"),
  businessType: z.string().min(1, "Business type is required"),
  teamSize: z.string().min(1, "Team size is required"),
  callVolume: z.string().min(1, "Call volume is required"),
  aiTimeline: z.string().min(1, "Timeline is required"),
  interests: z.array(z.string()).min(1, "Select at least one interest"),
  message: z.string().trim().max(1000, "Message must be less than 1000 characters").optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const businessTypes = [
  "Home Services (HVAC, Plumbing, Electrical)",
  "Medical/Healthcare",
  "Legal Services",
  "Real Estate",
  "Insurance",
  "Financial Services",
  "Retail/E-commerce",
  "Other",
];

const teamSizes = [
  "Solo (just me)",
  "2-5 employees",
  "6-20 employees",
  "21-50 employees",
  "50+ employees",
];

const callVolumes = [
  "Less than 50/month",
  "50-200/month",
  "200-500/month",
  "500+/month",
];

const aiTimelines = [
  "Immediately",
  "Within 1 month",
  "1-3 months",
  "Just exploring",
];

const interestOptions = [
  "AI Receptionist",
  "Appointment Booking",
  "Lead Qualification",
  "After-Hours Support",
  "Outbound Calls",
];

const ContactForm = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    businessType: "",
    teamSize: "",
    callVolume: "",
    aiTimeline: "",
    interests: [],
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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

  const handleInterestToggle = (interest: string) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
    if (errors.interests) {
      setErrors((prev) => ({ ...prev, interests: undefined }));
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
      const { data, error } = await supabase.functions.invoke('contact-form', {
        body: {
          name: result.data.name,
          email: result.data.email,
          phone: result.data.phone,
          message: result.data.message || "",
          businessType: result.data.businessType,
          teamSize: result.data.teamSize,
          callVolume: result.data.callVolume,
          aiTimeline: result.data.aiTimeline,
          interests: result.data.interests,
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
        name: "",
        email: "",
        phone: "",
        businessType: "",
        teamSize: "",
        callVolume: "",
        aiTimeline: "",
        interests: [],
        message: "",
      });
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
              Ready to Transform Your Business? <span className="text-accent">Let's Talk</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tell us about your business and we'll show you exactly how AI can help you capture more leads and grow revenue.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-card rounded-2xl p-8 md:p-10 shadow-lg border border-border">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Contact Info Row */}
              <div className="grid md:grid-cols-3 gap-6">
                {/* Name Field */}
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Your Name *
                  </label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="John Smith"
                    value={formData.name}
                    onChange={handleChange}
                    className={errors.name ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

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
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={handleChange}
                    className={errors.phone ? "border-destructive" : ""}
                    disabled={isSubmitting}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone}</p>
                  )}
                </div>
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

              {/* Interests */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  What are you interested in? *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {interestOptions.map((interest) => (
                    <label
                      key={interest}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.interests.includes(interest)
                          ? "bg-accent/10 border-accent"
                          : "bg-background border-border hover:border-accent/50"
                      }`}
                    >
                      <Checkbox
                        checked={formData.interests.includes(interest)}
                        onCheckedChange={() => handleInterestToggle(interest)}
                        disabled={isSubmitting}
                      />
                      <span className="text-sm">{interest}</span>
                    </label>
                  ))}
                </div>
                {errors.interests && (
                  <p className="text-sm text-destructive">{errors.interests}</p>
                )}
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
