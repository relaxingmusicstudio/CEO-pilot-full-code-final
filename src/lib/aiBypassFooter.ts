/**
 * AI Bypass Footer - Universal footer for all AI-generated communications
 * 
 * This footer MUST be included in all outbound AI communications:
 * - Cold outreach emails
 * - SMS blasts
 * - Follow-up sequences
 * - Automated responses
 * 
 * When a recipient replies with HUMAN or STOP, the system:
 * 1. Immediately pauses AI on that conversation
 * 2. Creates a high-priority notification for the owner
 * 3. Adds the request to the bypass queue for human follow-up
 */

export const AI_BYPASS_KEYWORDS = ['HUMAN', 'STOP', 'UNSUBSCRIBE', 'REMOVE', 'TALK TO PERSON', 'REAL PERSON'] as const;

export const EMAIL_BYPASS_FOOTER = `
---
⏸️ To pause automated messages: Reply STOP
👋 To speak to a human: Reply HUMAN

ApexLocal360 AI Assistant
`;

export const SMS_BYPASS_FOOTER = `

Reply STOP to pause or HUMAN to talk to a person.`;

export const EMAIL_BYPASS_FOOTER_HTML = `
<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
  <p style="margin: 0 0 8px 0;">
    ⏸️ To pause automated messages: <strong>Reply STOP</strong>
  </p>
  <p style="margin: 0 0 8px 0;">
    👋 To speak to a human: <strong>Reply HUMAN</strong>
  </p>
  <p style="margin: 16px 0 0 0; color: #9ca3af;">
    ApexLocal360 AI Assistant
  </p>
</div>
`;

/**
 * Appends the appropriate bypass footer to a message
 */
export function appendBypassFooter(message: string, channel: 'email' | 'sms' | 'email_html'): string {
  switch (channel) {
    case 'email':
      return `${message}\n${EMAIL_BYPASS_FOOTER}`;
    case 'email_html':
      return `${message}${EMAIL_BYPASS_FOOTER_HTML}`;
    case 'sms':
      return `${message}${SMS_BYPASS_FOOTER}`;
    default:
      return message;
  }
}

/**
 * Checks if a message contains a bypass keyword
 */
export function containsBypassKeyword(message: string): { triggered: boolean; keyword: string | null } {
  const normalized = message.toUpperCase().trim();
  
  for (const keyword of AI_BYPASS_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { triggered: true, keyword };
    }
  }
  
  return { triggered: false, keyword: null };
}

/**
 * Generates unsubscribe/preference link for emails
 */
export function generateUnsubscribeLink(contactId: string, campaignId?: string): string {
  const params = new URLSearchParams({ contact: contactId });
  if (campaignId) params.append('campaign', campaignId);
  return `https://apexlocal360.com/preferences?${params.toString()}`;
}
