/**
 * HTTP Cache-Control header middleware for static/read-heavy storefront responses
 * Enables edge caching on Vercel/Cloudflare and browser caching with background SWR.
 */
export function cacheControl(maxAgeSeconds = 120, staleWhileRevalidate = 300) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidate}`
      );
    }
    next();
  };
}
