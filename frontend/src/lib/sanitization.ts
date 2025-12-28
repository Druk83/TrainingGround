import DOMPurify from 'dompurify';

export function sanitizeDisplayName(text: string, maxLength = 100): string {
  if (!text) return '';
  const sanitized = text.replace(/[<>"']/g, '').trim();
  return sanitized.slice(0, maxLength);
}

export function sanitizeHTML(html: string): string {
  if (!html) {
    return '';
  }

  const purified = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  if (typeof purified === 'string') {
    if (!/[<>]/.test(purified)) {
      return purified;
    }
    return stripTags(purified);
  }

  return stripTags(html);
}

function stripTags(input: string): string {
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    const tmp = window.document.createElement('div');
    tmp.innerHTML = input;
    tmp.querySelectorAll('script,style').forEach((node) => node.remove());
    return tmp.textContent ?? '';
  }

  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
}
