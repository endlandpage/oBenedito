'use strict';
const csp = [
  "default-src 'none'", "base-uri 'none'", "object-src 'none'",
  "frame-ancestors 'none'", "form-action 'none'",
  "script-src 'self'", "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'", "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://hzjfcsedzqjwwkvutwvm.supabase.co",
  "font-src 'self'", "media-src 'self' blob:",
  "connect-src 'self' https://hzjfcsedzqjwwkvutwvm.supabase.co",
  "frame-src https://maps.google.com https://www.google.com", "worker-src 'none'",
  "manifest-src 'self'", 'upgrade-insecure-requests',
].join('; ');
module.exports = {
  'Content-Security-Policy': csp,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
