// Cache-busting suffix for data and art fetches; index.html carries the build rev in <meta name="rev">.
const m = typeof document !== 'undefined' && document.querySelector('meta[name="rev"]');
export const REV = (m && m.content) || 'dev';
export const V = '?v=' + REV;
