import app from '../src/server/app';

// Vercel Serverless Function handler for Express
export default function handler(req: any, res: any) {
  return new Promise((resolve) => {
    try {
      // Normalize URL for Express routing
      if (req && req.url) {
        let rawUrl: string = req.url;

        // 1. If rewritten with __path parameter in query string
        if (rawUrl.includes('__path=')) {
          const match = rawUrl.match(/[?&]__path=([^&#]+)/);
          if (match && match[1]) {
            const subpath = decodeURIComponent(match[1]);
            req.url = subpath.startsWith('/') ? `/api${subpath}` : `/api/${subpath}`;
          }
        } else if (req.query?.__path) {
          const p = Array.isArray(req.query.__path) ? req.query.__path.join('/') : req.query.__path;
          req.url = p.startsWith('/') ? `/api${p}` : `/api/${p}`;
        } else if (req.query?.slug) {
          const p = Array.isArray(req.query.slug) ? req.query.slug.join('/') : req.query.slug;
          req.url = p.startsWith('/') ? `/api${p}` : `/api/${p}`;
        } else if (req.headers?.['x-matched-path'] && typeof req.headers['x-matched-path'] === 'string') {
          req.url = req.headers['x-matched-path'];
        }

        // Ensure leading slash
        if (req.url && !req.url.startsWith('/')) {
          req.url = `/${req.url}`;
        }
      }

      // Track response completion so Vercel does not terminate container early
      res.on('finish', () => resolve(true));
      res.on('close', () => resolve(true));
      res.on('error', (err: any) => {
        console.error('[Vercel Serverless Error] res stream error:', err);
        resolve(true);
      });

      // Pass request to Express
      app(req, res);
    } catch (handlerErr: any) {
      console.error('[Vercel Serverless Error] Uncaught handler error:', handlerErr);
      if (!res.headersSent) {
        res.status(500).json({
          error: handlerErr?.message || 'Serverless invocation error',
          code: 'SERVERLESS_FUNCTION_ERROR',
          details: String(handlerErr?.stack || handlerErr),
        });
      }
      resolve(true);
    }
  });
}
