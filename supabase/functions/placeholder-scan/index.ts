import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FileInput {
  file: string;
  content: string;
}

interface Finding {
  severity: "critical" | "warning";
  pattern: string;
  file: string;
  line: number;
  snippet: string;
}

interface ScanRequest {
  files?: FileInput[];
  mode?: "quick" | "full";
}

interface ScanResponse {
  ok: boolean;
  scanned: number;
  findings: Finding[];
  summary: { critical: number; warning: number };
  duration_ms: number;
}

// Critical patterns - likely broken code or placeholders
const CRITICAL_PATTERNS = [
  { regex: /}\s*\/?>/, name: "Malformed JSX closing (}/> or } />)" },
  { regex: /REPLACE_ME/i, name: "REPLACE_ME placeholder" },
  { regex: /CHANGE_ME/i, name: "CHANGE_ME placeholder" },
  { regex: /PLACEHOLDER/i, name: "PLACEHOLDER marker" },
  { regex: /TODO:\s*REMOVE/i, name: "TODO: REMOVE marker" },
  { regex: /\bTEMP\b/i, name: "TEMP marker" },
  { regex: /\bstub\b/i, name: "stub marker" },
  { regex: /\bmock(?:ed|ing)?\b/i, name: "mock marker (in production)" },
  { regex: /return\s+null\s*;?\s*\/\/\s*(?:TODO|TEMP|placeholder)/i, name: "Placeholder return null" },
  { regex: /<Route[^>]*element=\{null\}/, name: "Route with null element" },
  { regex: /import\s+.*from\s+["'][^"']*(?:PLACEHOLDER|TEMP|TODO)[^"']*["']/, name: "Import from placeholder path" },
  { regex: /["'](?:YOUR_|MY_|EXAMPLE_|DEMO_)[A-Z_]+["']/, name: "Example/demo placeholder string" },
];

// Warning patterns - code smells
const WARNING_PATTERNS = [
  { regex: /\/\/\s*TODO(?!:\s*REMOVE)/i, name: "TODO comment" },
  { regex: /\/\/\s*FIXME/i, name: "FIXME comment" },
  { regex: /\/\/\s*HACK/i, name: "HACK comment" },
  { regex: /\(undefined\)/, name: "(undefined) in string" },
  { regex: /\(not set\)/, name: "(not set) in string" },
  { regex: /as\s+any\b/, name: "as unknown type assertion" },
  { regex: /console\.log\s*\(/, name: "console.log (debug)" },
  { regex: /console\.error\s*\(/, name: "console.error (may be intentional)" },
  { regex: /\bXXX\b/, name: "XXX marker" },
  { regex: /\bNOTE:\s*(?:temporary|temp|remove)/i, name: "NOTE: temporary marker" },
];

function scanContent(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmedLine = line.trim();
    
    // Skip empty lines and very short lines
    if (trimmedLine.length < 2) return;

    // Check critical patterns
    for (const pattern of CRITICAL_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          severity: "critical",
          pattern: pattern.name,
          file,
          line: lineNum,
          snippet: trimmedLine.substring(0, 120) + (trimmedLine.length > 120 ? "..." : ""),
        });
      }
    }

    // Check warning patterns
    for (const pattern of WARNING_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          severity: "warning",
          pattern: pattern.name,
          file,
          line: lineNum,
          snippet: trimmedLine.substring(0, 120) + (trimmedLine.length > 120 ? "..." : ""),
        });
      }
    }
  });

  return findings;
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ScanRequest = await req.json();
    const { files, mode = "quick" } = body;

    // Validate input
    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "files_required",
          message: "Edge function cannot read filesystem. Provide files[] array with {file, content} objects.",
          example: {
            files: [
              { file: "src/App.tsx", content: "// paste file content here" }
            ]
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Scan all provided files
    const allFindings: Finding[] = [];
    let scannedCount = 0;

    for (const fileInput of files) {
      if (!fileInput.file || !fileInput.content) {
        console.log(`Skipping invalid file input: ${JSON.stringify(fileInput).substring(0, 100)}`);
        continue;
      }
      
      const findings = scanContent(fileInput.file, fileInput.content);
      allFindings.push(...findings);
      scannedCount++;
    }

    // Sort findings: critical first, then by file, then by line
    allFindings.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }
      return a.line - b.line;
    });

    // In quick mode, limit findings per file
    let limitedFindings = allFindings;
    if (mode === "quick") {
      const byFile = new Map<string, Finding[]>();
      for (const f of allFindings) {
        if (!byFile.has(f.file)) byFile.set(f.file, []);
        byFile.get(f.file)!.push(f);
      }
      limitedFindings = [];
      for (const [, fileFindings] of byFile) {
        // Keep all critical, limit warnings to 5 per file
        const critical = fileFindings.filter(f => f.severity === "critical");
        const warnings = fileFindings.filter(f => f.severity === "warning").slice(0, 5);
        limitedFindings.push(...critical, ...warnings);
      }
    }

    const summary = {
      critical: limitedFindings.filter(f => f.severity === "critical").length,
      warning: limitedFindings.filter(f => f.severity === "warning").length,
    };

    const response: ScanResponse = {
      ok: summary.critical === 0,
      scanned: scannedCount,
      findings: limitedFindings,
      summary,
      duration_ms: Date.now() - startTime,
    };

    console.log(`Placeholder scan complete: ${scannedCount} files, ${summary.critical} critical, ${summary.warning} warnings`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Placeholder scan error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "scan_failed",
        message: error instanceof Error ? error.message : "Unknown error",
        duration_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
