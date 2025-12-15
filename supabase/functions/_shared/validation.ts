// Shared validation utilities for edge functions
// Phase 1: Security Hardening - Server-side validation

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Email validation
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

// Phone validation
export function isValidPhone(phone: string): boolean {
  if (!phone) return true; // Optional field
  if (typeof phone !== 'string') return false;
  const phoneRegex = /^[\d\s\-\+\(\)]{7,20}$/;
  return phoneRegex.test(phone);
}

// URL validation
export function isValidUrl(url: string): boolean {
  if (!url) return true; // Optional field
  if (typeof url !== 'string') return false;
  try {
    new URL(url);
    return url.length <= 2048;
  } catch {
    return false;
  }
}

// UUID validation
export function isValidUUID(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Sanitize string input
export function sanitizeString(str: string | undefined | null, maxLength: number = 500): string {
  if (!str || typeof str !== 'string') return '';
  // Remove null bytes and control characters
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim().slice(0, maxLength);
}

// Sanitize number input
export function sanitizeNumber(value: unknown, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return null;
  return Math.max(min, Math.min(max, num));
}

// Validate required fields
export function validateRequired(fields: Record<string, unknown>, required: string[]): ValidationResult {
  const errors: string[] = [];
  
  for (const field of required) {
    const value = fields[field];
    if (value === null || value === undefined || value === '') {
      errors.push(`${field} is required`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Validate request body structure
export function validateRequestBody(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Invalid request body'] };
  }
  return { valid: true, errors: [] };
}

// Rate limiting check (simple in-memory for demo)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string, 
  maxRequests: number = 100, 
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);
  
  if (!record || now > record.resetAt) {
    requestCounts.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

// Validate webhook signature (for Stripe, etc.)
export async function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  tolerance: number = 300
): Promise<boolean> {
  if (!signature || !secret) return false;
  
  try {
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const v1Signature = parts.find(p => p.startsWith('v1='))?.split('=')[1];
    
    if (!timestamp || !v1Signature) return false;
    
    // Check timestamp tolerance
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > tolerance) return false;
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );
    const expectedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return v1Signature === expectedSig;
  } catch {
    return false;
  }
}

// Validate JSON structure
export function validateJsonStructure(
  data: unknown, 
  requiredFields: string[]
): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid JSON structure'] };
  }
  
  const obj = data as Record<string, unknown>;
  const missing = requiredFields.filter(f => !(f in obj));
  
  return {
    valid: missing.length === 0,
    errors: missing.map(f => `Missing required field: ${f}`)
  };
}

// Sanitize object recursively
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  maxStringLength: number = 1000
): T {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value, maxStringLength);
    } else if (typeof value === 'number') {
      result[key] = isFinite(value) ? value : null;
    } else if (typeof value === 'boolean') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => 
        typeof v === 'string' ? sanitizeString(v, maxStringLength) : v
      );
    } else if (value && typeof value === 'object') {
      result[key] = sanitizeObject(value as Record<string, unknown>, maxStringLength);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

// Export CORS headers for consistency
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create standardized error response
export function createErrorResponse(
  message: string, 
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status, 
      headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    }
  );
}

// Create standardized success response
export function createSuccessResponse<T>(
  data: T, 
  status: number = 200
): Response {
  return new Response(
    JSON.stringify(data),
    { 
      status, 
      headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    }
  );
}
