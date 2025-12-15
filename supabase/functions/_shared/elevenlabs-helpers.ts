// Shared ElevenLabs helper functions for edge functions

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top ElevenLabs voice IDs
export const VOICE_IDS: Record<string, string> = {
  'roger': 'CwhRBWXzGAHq8TQ4Fs17',
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'laura': 'FGY2WhTYpPnrIDTdsKH5',
  'charlie': 'IKne3meq5aSn9XLyUdCD',
  'george': 'JBFqnCBsd6RMkjVDRZzb',
  'callum': 'N2lVS1w4EtoT3dr4eOWO',
  'river': 'SAz9YHcvj6GT2YYXdXww',
  'liam': 'TX3LPaxmHKxFdv7VOQHJ',
  'alice': 'Xb7hH8MSUJpSbSDYk0k2',
  'matilda': 'XrExE9yKIg1WjnnlVkGX',
  'will': 'bIHbv24MWmeRgasZH58o',
  'jessica': 'cgSgspJ2msm6clMCkdW9',
  'eric': 'cjVigY5qzO86Huf0OWal',
  'chris': 'iP95p4xoKVk53GoZ742B',
  'brian': 'nPczCjzI2devNBz1zQrb',
  'daniel': 'onwK4e9ZLuTAKqWW03F9',
  'lily': 'pFZP5JQG7iQjIQuC4Bku',
  'bill': 'pqHfZKP75CvOlQylNhV4',
};

// TTS Models
export const TTS_MODELS = {
  multilingual_v2: 'eleven_multilingual_v2',  // Highest quality, 29 languages
  turbo_v2_5: 'eleven_turbo_v2_5',            // Low latency, high quality
  turbo_v2: 'eleven_turbo_v2',                // Fast generation
} as const;

// STT Models
export const STT_MODELS = {
  scribe_v1: 'scribe_v1',                     // Batch transcription
  scribe_v2_realtime: 'scribe_v2_realtime',   // Real-time streaming
} as const;

/**
 * Resolve voice name to ElevenLabs voice ID
 */
export function resolveVoiceId(voice: string): string {
  // If it looks like a voice ID (long alphanumeric), return as-is
  if (voice.length > 15) {
    return voice;
  }
  // Otherwise, look up by name
  return VOICE_IDS[voice.toLowerCase()] || VOICE_IDS['sarah'];
}

/**
 * Get ElevenLabs API key from environment
 */
export function getElevenLabsApiKey(): string {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }
  return apiKey;
}

/**
 * Create a standard error response
 */
export function errorResponse(message: string, status: number = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Create a standard success response
 */
export function successResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

/**
 * Make authenticated request to ElevenLabs API
 */
export async function elevenLabsRequest(
  endpoint: string, 
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = getElevenLabsApiKey();
  
  return fetch(`https://api.elevenlabs.io${endpoint}`, {
    ...options,
    headers: {
      'xi-api-key': apiKey,
      ...options.headers,
    },
  });
}
