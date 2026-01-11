/**
 * HTML Sanitization utilities to prevent XSS attacks
 */

/**
 * Escapes HTML special characters to prevent XSS
 * @param str - String to sanitize
 * @returns Sanitized string safe for innerHTML
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) {
    return '';
  }
  
  const stringValue = String(str);
  
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  
  return stringValue.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Sanitizes a value for use in HTML, returning a fallback for empty values
 * @param str - String to sanitize
 * @param fallback - Fallback value if string is empty (default: "-")
 * @returns Sanitized string or fallback
 */
export function sanitizeForHtml(str: string | null | undefined, fallback: string = '-'): string {
  const sanitized = escapeHtml(str);
  return sanitized || escapeHtml(fallback);
}
