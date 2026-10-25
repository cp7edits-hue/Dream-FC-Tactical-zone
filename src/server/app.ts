import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { verifySupabaseTables, isSupabaseConfigured } from './supabase';

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

  // Mount API endpoints on both /api and root for maximum proxy compatibility
  app.use('/api', apiRouter);
  app.use(apiRouter);

  // Health check endpoint with live database schema diagnostic
  const healthHandler = async (_req: express.Request, res: express.Response) => {
    let dbStatus: any = { configured: false, ready: false };
    try {
      if (isSupabaseConfigured()) {
        const verify = await verifySupabaseTables();
        dbStatus = {
          configured: true,
          ready: verify.ok,
          message: verify.message,
          migrationFile: 'migrations/000_complete_supabase_setup.sql',
        };
      }
    } catch (e: any) {
      dbStatus = { configured: true, ready: false, error: e?.message };
    }

    res.json({
      status: 'ok',
      service: 'Dream FC Tactical Zone API',
      timestamp: new Date().toISOString(),
      platform: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
      database: dbStatus,
    });
  };
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // 404 handler for API routes
  app.all(['/api/*', '/meetings', '/meetings/*'], (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found', code: 'ENDPOINT_NOT_FOUND' });
  });

  // Global Express JSON error handler (prevents unformatted HTML 500 pages)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Express Global Error]:', err);
    res.status(err.status || 500).json({
      error: err?.message || 'Internal server error occurred',
      code: err?.code || 'INTERNAL_SERVER_ERROR',
      status: err?.status || 500,
    });
  });

  return app;
}

export const app = createApp();
export default app;
