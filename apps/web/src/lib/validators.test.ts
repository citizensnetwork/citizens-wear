import { describe, expect, it } from 'vitest';
import { safeUrl } from './validators';

describe('safeUrl', () => {
  it('accepts plain https URLs', () => {
    expect(safeUrl('https://images.example.com/post-1.jpg')).toBe(
      'https://images.example.com/post-1.jpg',
    );
  });

  it('accepts plain http URLs', () => {
    expect(safeUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('rejects empty / nullish input', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });

  it('passes the credential check on bare URLs (positive control)', () => {
    // Pin behaviour against a future refactor that accidentally inverts
    // the credential-rejection boolean.
    const u = new URL('https://example.com/');
    expect(u.username).toBe('');
    expect(u.password).toBe('');
    expect(safeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('rejects or sanitises CRLF injection attempts', () => {
    // WHATWG URL strips control chars rather than throwing — pin behaviour:
    // either the URL must be rejected outright, or the canonicalised form
    // must not contain CR/LF.
    const out = safeUrl('https://example.com/\r\nLocation: evil');
    expect(out === null || !/[\r\n]/.test(out)).toBe(true);
  });

  it('rejects javascript: with embedded control chars (WHATWG strip)', () => {
    expect(safeUrl('java\tscript:alert(1)')).toBeNull();
    expect(safeUrl('java\nscript:alert(1)')).toBeNull();
  });

  it('rejects non-http(s) special schemes', () => {
    expect(safeUrl('ftp://example.com/x')).toBeNull();
    expect(safeUrl('ws://example.com/x')).toBeNull();
    expect(safeUrl('blob:https://example.com/abc')).toBeNull();
  });

  it('canonicalises backslash-as-slash in special schemes (WHATWG)', () => {
    // Known parser footgun: `\` is converted to `/` in special schemes.
    // Credential guard still applies; pin the canonicalised output.
    expect(safeUrl('https:\\\\example.com\\a')).toBe('https://example.com/a');
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(safeUrl('   https://example.com/x   ')).toBe('https://example.com/x');
    expect(safeUrl('   ')).toBeNull();
  });

  it('rejects javascript: scheme', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: scheme', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects file: scheme', () => {
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects vbscript: scheme', () => {
    expect(safeUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects URLs with embedded credentials', () => {
    expect(safeUrl('https://user:pass@example.com/path')).toBeNull();
    expect(safeUrl('https://user@example.com/path')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl('http://')).toBeNull();
  });

  it('canonicalises the URL', () => {
    // Trailing dots, mixed-case host, etc. WHATWG URL normalises these.
    expect(safeUrl('HTTPS://Example.COM/')).toBe('https://example.com/');
  });
});
