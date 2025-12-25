/**
 * Frontend sanitization utilities for XSS protection
 * This provides defense-in-depth alongside backend sanitization
 */

/**
 * Sanitize user-generated text for safe display in HTML
 * - Removes potentially dangerous characters
 * - Limits length to prevent UI breaking
 * - Allows only safe characters: alphanumeric, whitespace, and basic punctuation
 *
 * Note: Lit automatically escapes HTML in templates, but this provides an additional layer
 * of defense-in-depth protection and matches backend sanitization.
 *
 * @param text - The text to sanitize
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns Sanitized text safe for display
 */
export function sanitizeDisplayName(text: string, maxLength = 100): string {
  if (!text) return '';

  // Filter to only safe characters: alphanumeric, whitespace, and - _ .
  // This matches the backend sanitization in analytics_worker.rs
  const sanitized = Array.from(text)
    .filter((char) => {
      return (
        /[a-zA-Z0-9\s]/.test(char) || // alphanumeric and whitespace
        ['-', '_', '.'].includes(char) // safe punctuation
      );
    })
    .slice(0, maxLength)
    .join('');

  return sanitized || 'Unknown';
}

/**
 * Sanitize HTML to prevent XSS attacks
 * This is a basic implementation - for production consider using DOMPurify
 *
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHTML(html: string): string {
  const div = document.createElement('div');
  div.textContent = html; // textContent automatically escapes HTML
  return div.innerHTML;
}
