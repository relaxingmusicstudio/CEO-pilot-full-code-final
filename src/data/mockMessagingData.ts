// Mock data for the messaging hub - used to seed the database with realistic test data

export interface MockContact {
  name: string;
  email: string;
  phone: string;
  whatsapp_id?: string;
  tags: string[];
}

export interface MockConversation {
  channel_type: 'sms' | 'whatsapp' | 'email';
  status: 'open' | 'closed' | 'archived';
  messages: {
    direction: 'inbound' | 'outbound';
    content: string;
    sent_at: string;
  }[];
}

export const mockContacts: MockContact[] = [
  {
    name: "John Smith",
    email: "john.smith@email.com",
    phone: "+15551234567",
    whatsapp_id: "15551234567",
    tags: ["hot-lead", "hvac"],
  },
  {
    name: "Sarah Johnson",
    email: "sarah.j@company.com",
    phone: "+15559876543",
    whatsapp_id: "15559876543",
    tags: ["warm-lead", "commercial"],
  },
  {
    name: "Mike Williams",
    email: "mike.w@business.net",
    phone: "+15555555555",
    tags: ["new-lead"],
  },
  {
    name: "Emily Davis",
    email: "emily.d@startup.io",
    phone: "+15551112222",
    whatsapp_id: "15551112222",
    tags: ["hot-lead", "urgent"],
  },
  {
    name: "Robert Brown",
    email: "rbrown@enterprise.com",
    phone: "+15553334444",
    tags: ["enterprise", "decision-maker"],
  },
];

export const mockConversations: { contactIndex: number; conversation: MockConversation }[] = [
  {
    contactIndex: 0,
    conversation: {
      channel_type: "sms",
      status: "open",
      messages: [
        { direction: "inbound", content: "Hi, I need my AC fixed ASAP. It's not cooling at all.", sent_at: new Date(Date.now() - 3600000).toISOString() },
        { direction: "outbound", content: "Hi John! I'm sorry to hear about your AC issue. I can have a technician out today. What time works best for you?", sent_at: new Date(Date.now() - 3500000).toISOString() },
        { direction: "inbound", content: "Anytime after 2pm would be great", sent_at: new Date(Date.now() - 3400000).toISOString() },
        { direction: "outbound", content: "Perfect! I've scheduled a technician for 3pm today. They'll call you 30 minutes before arrival.", sent_at: new Date(Date.now() - 3300000).toISOString() },
        { direction: "inbound", content: "Thank you so much!", sent_at: new Date(Date.now() - 3200000).toISOString() },
      ],
    },
  },
  {
    contactIndex: 1,
    conversation: {
      channel_type: "whatsapp",
      status: "open",
      messages: [
        { direction: "inbound", content: "Hello, we're looking for HVAC maintenance for our office building. About 15,000 sq ft.", sent_at: new Date(Date.now() - 86400000).toISOString() },
        { direction: "outbound", content: "Hi Sarah! Thanks for reaching out. Commercial maintenance is definitely something we specialize in. Can I schedule a site visit to give you an accurate quote?", sent_at: new Date(Date.now() - 85000000).toISOString() },
        { direction: "inbound", content: "Yes, that would be great. What days are available?", sent_at: new Date(Date.now() - 84000000).toISOString() },
      ],
    },
  },
  {
    contactIndex: 2,
    conversation: {
      channel_type: "email",
      status: "open",
      messages: [
        { direction: "inbound", content: "Subject: Quote Request\n\nHi, I'm interested in getting a quote for a new HVAC system for my home. It's about 2,500 sq ft and the current system is 20 years old.", sent_at: new Date(Date.now() - 172800000).toISOString() },
        { direction: "outbound", content: "Subject: Re: Quote Request\n\nHi Mike,\n\nThank you for your interest! A 20-year-old system is definitely due for replacement. We'd be happy to provide a free in-home estimate.\n\nOur technicians can assess your current setup and recommend the best options for your home and budget.\n\nWould you prefer a weekday or weekend appointment?\n\nBest regards,\nThe HVAC Team", sent_at: new Date(Date.now() - 170000000).toISOString() },
      ],
    },
  },
  {
    contactIndex: 3,
    conversation: {
      channel_type: "whatsapp",
      status: "open",
      messages: [
        { direction: "inbound", content: "URGENT - my furnace stopped working and it's freezing!", sent_at: new Date(Date.now() - 1800000).toISOString() },
        { direction: "outbound", content: "Oh no, Emily! I'm so sorry - that's an emergency situation. I'm dispatching our on-call technician right now. Can you confirm your address?", sent_at: new Date(Date.now() - 1700000).toISOString() },
        { direction: "inbound", content: "123 Main St, Apt 4B", sent_at: new Date(Date.now() - 1600000).toISOString() },
        { direction: "outbound", content: "Got it! Tech is on the way - ETA 25 minutes. Stay safe and keep warm!", sent_at: new Date(Date.now() - 1500000).toISOString() },
      ],
    },
  },
  {
    contactIndex: 4,
    conversation: {
      channel_type: "sms",
      status: "closed",
      messages: [
        { direction: "outbound", content: "Hi Robert, following up on our conversation about the commercial HVAC contract. Have you had a chance to review the proposal?", sent_at: new Date(Date.now() - 604800000).toISOString() },
        { direction: "inbound", content: "Yes, the board approved it. Let's set up a call to finalize details.", sent_at: new Date(Date.now() - 600000000).toISOString() },
        { direction: "outbound", content: "Excellent news! I'll have our account manager reach out to schedule. Thanks for choosing us!", sent_at: new Date(Date.now() - 590000000).toISOString() },
      ],
    },
  },
];

export const mockSequences = [
  {
    name: "New Lead Welcome",
    description: "Automated welcome sequence for new leads",
    trigger_type: "lead_created",
    is_active: true,
    steps: [
      { delay_minutes: 0, channel: "email", subject: "Welcome!", content: "Hi {{name}}, thanks for reaching out! We're excited to help you with your HVAC needs." },
      { delay_minutes: 60, channel: "sms", content: "Hi {{name}}, just checking in - did you have any questions about our services?" },
      { delay_minutes: 1440, channel: "email", subject: "Special Offer", content: "As a thank you for considering us, here's 10% off your first service!" },
    ],
  },
  {
    name: "Follow-up Sequence",
    description: "Follow up with leads who haven't responded",
    trigger_type: "manual",
    is_active: true,
    steps: [
      { delay_minutes: 0, channel: "sms", content: "Hi {{name}}, just following up on our previous conversation. Is there anything else I can help with?" },
      { delay_minutes: 2880, channel: "email", subject: "Still interested?", content: "Hi {{name}}, I wanted to make sure you received my previous message. We're here to help whenever you're ready!" },
      { delay_minutes: 10080, channel: "sms", content: "Hi {{name}}, this is my final follow-up. If you ever need HVAC service, we're just a call away!" },
    ],
  },
  {
    name: "Appointment Reminder",
    description: "Remind customers about upcoming appointments",
    trigger_type: "manual",
    is_active: true,
    steps: [
      { delay_minutes: -1440, channel: "sms", content: "Hi {{name}}, reminder: your HVAC appointment is tomorrow. Reply YES to confirm or call us to reschedule." },
      { delay_minutes: -60, channel: "sms", content: "Hi {{name}}, our technician will arrive in about 1 hour. Please ensure someone is home to let them in." },
    ],
  },
];

export const channelConfigs = [
  {
    channel_type: "sms",
    name: "Twilio SMS",
    is_active: true,
    credentials: { status: "mock_mode", note: "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable" },
  },
  {
    channel_type: "whatsapp",
    name: "WhatsApp Business",
    is_active: true,
    credentials: { status: "mock_mode", note: "Add WHATSAPP_ACCESS_TOKEN to enable" },
  },
  {
    channel_type: "email",
    name: "Resend Email",
    is_active: true,
    credentials: { status: "configured", note: "Using RESEND_API_KEY" },
  },
];
