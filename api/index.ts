import app from '../src/server/app';

// Vercel Serverless Function handler
export default function handler(req: any, res: any) {
  if (req && req.url) {
    // 1. If rewritten with __path query parameter
    if (req.query?.__path) {
      const p = Array.isArray(req.query.__path) ? req.query.__path.join('/') : req.query.__path;
      req.url = `/api/${p}`;
    } else if (req.headers?.['x-matched-path'] && typeof req.headers['x-matched-path'] === 'string') {
      req.url = req.headers['x-matched-path'];
    } else if (req.headers?.['x-now-route-matches']) {
      try {
        const matches = typeof req.headers['x-now-route-matches'] === 'string'
          ? JSON.parse(req.headers['x-now-route-matches'])
          : req.headers['x-now-route-matches'];
        if (matches['1']) {
          req.url = `/api/${matches['1']}`;
        }
      } catch {}
    }
  }
  return app(req, res);
}

