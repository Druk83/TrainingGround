import { describe, expect, it } from 'vitest';

import { sanitizeDisplayName, sanitizeHTML } from './sanitization';

describe('sanitizeDisplayName', () => {
  it('removes dangerous characters and trims whitespace', () => {
    const raw = `  <Admin "Name">  `;
    const sanitized = sanitizeDisplayName(raw);
    expect(sanitized).toBe('Admin Name');
  });

  it('cuts off values that exceed max length', () => {
    const long = 'a'.repeat(150);
    const sanitized = sanitizeDisplayName(long, 20);
    expect(sanitized).toHaveLength(20);
    expect(sanitized).toBe('a'.repeat(20));
  });

  it('returns empty string for falsy inputs', () => {
    expect(sanitizeDisplayName('')).toBe('');
    // @ts-expect-error verifying runtime behaviour
    expect(sanitizeDisplayName(null)).toBe('');
    // @ts-expect-error verifying runtime behaviour
    expect(sanitizeDisplayName(undefined)).toBe('');
  });
});

describe('sanitizeHTML', () => {
  it('removes HTML tags and scripts completely', () => {
    const html = `<div><strong>Hello</strong><script>alert(1)</script></div>`;
    const sanitized = sanitizeHTML(html);
    expect(sanitized).toBe('Hello');
  });

  it('leaves plain text untouched', () => {
    const text = 'Привет, безопасный текст';
    expect(sanitizeHTML(text)).toBe(text);
  });
});
