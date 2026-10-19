import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Strict security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), display-capture=(self)'
    );
    next();
  });

  // Serve static assets from public/ if present
  try {
    const publicPath = path.resolve(process.cwd(), 'public');
    app.use(express.static(publicPath));
  } catch {
    // ignore in serverless
  }

  // Mount API endpoints
  app.use('/api', apiRouter);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Dream FC Tactical Zone API',
      timestamp: new Date().toISOString(),
      platform: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
    });
  });

  // 404 handler for API routes
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found', code: 'ENDPOINT_NOT_FOUND' });
  });

  return app;
}

export const app = createApp();
export default app;
