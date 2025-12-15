// Security utilities for production readiness

/**
 * Rate limiter for client-side request throttling
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    
    // Remove expired timestamps
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }
    
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  getRemainingRequests(key: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - validTimestamps.length);
  }

  reset(key: string): void {
    this.requests.delete(key);
  }
}

// Global rate limiters for different actions
export const apiRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute
export const formSubmitLimiter = new RateLimiter(60000, 10); // 10 form submissions per minute
export const chatMessageLimiter = new RateLimiter(60000, 30); // 30 chat messages per minute

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";
  
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (basic validation)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\d\s\-+()]{10,}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a secure random string
 */
export function generateSecureId(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Check if request is from a trusted origin
 */
export function isTrustedOrigin(origin: string): boolean {
  const trustedOrigins = [
    window.location.origin,
    "https://lovable.dev",
    "https://*.lovable.dev",
  ];
  
  return trustedOrigins.some(trusted => {
    if (trusted.includes("*")) {
      const pattern = trusted.replace("*", ".*");
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return trusted === origin;
  });
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (!data || data.length <= visibleChars * 2) {
    return "***";
  }
  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  return `${start}****${end}`;
}

/**
 * Content Security Policy headers for reference
 */
export const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "https://cdn.gpteng.co"],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  "img-src": ["'self'", "data:", "https:", "blob:"],
  "connect-src": [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://ai.gateway.lovable.dev",
  ],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
};

/**
 * Validate JSON structure against expected schema
 */
export function validateJsonStructure(
  data: unknown,
  requiredFields: string[]
): { valid: boolean; missing: string[] } {
  if (!data || typeof data !== "object") {
    return { valid: false, missing: requiredFields };
  }
  
  const missing = requiredFields.filter(field => !(field in (data as Record<string, unknown>)));
  return { valid: missing.length === 0, missing };
}

/**
 * Debounce function for rate limiting UI interactions
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for limiting function calls
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
