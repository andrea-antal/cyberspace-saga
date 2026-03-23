/**
 * Attempts to repair common JSON issues from LLM output.
 * Handles: markdown fences, trailing commas, unclosed brackets,
 * truncated output, leading/trailing text around JSON.
 */
export function repairJSON(raw: string): string {
  let s = raw.trim();

  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  // Extract JSON object if surrounded by other text
  const firstBrace = s.indexOf('{');
  if (firstBrace > 0) {
    s = s.slice(firstBrace);
  }

  // Find the matching closing brace (handle nested braces)
  let depth = 0;
  let lastBrace = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { lastBrace = i; break; } }
  }

  if (lastBrace > 0 && lastBrace < s.length - 1) {
    s = s.slice(0, lastBrace + 1);
  }

  // Fix trailing commas before } or ]
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Fix truncated output — try to close unclosed brackets
  if (depth > 0 || lastBrace === -1) {
    // Count open braces/brackets
    let openBraces = 0;
    let openBrackets = 0;
    inString = false;
    escape = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') openBraces++;
      if (ch === '}') openBraces--;
      if (ch === '[') openBrackets++;
      if (ch === ']') openBrackets--;
    }

    // If we're inside a string, close it
    if (inString) {
      s += '"';
    }

    // Close unclosed brackets/braces
    for (let i = 0; i < openBrackets; i++) s += ']';
    for (let i = 0; i < openBraces; i++) s += '}';

    // Fix trailing commas again after closing
    s = s.replace(/,\s*([\]}])/g, '$1');
  }

  // Remove any control characters that might break parsing
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');

  return s;
}
