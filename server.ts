import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAllowedCorsOrigin } from './backend/cors';
import { apiRouter } from './backend/routes';
import { seedCatalog } from './backend/seed';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use('/api', (req, res, next) => {
    const allowedOrigin = resolveAllowedCorsOrigin(
      req.headers.origin,
      process.env.CORS_ORIGIN
    );
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '6mb' }));
  app.use('/api', apiRouter);

  try {
    await seedCatalog(false);
  } catch (err) {
    console.error('[Avado Server] Startup schema/seed warning:', (err as Error).message);
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      app.use(express.static(distDir, { maxAge: '7d' }));
      app.get('*', (_req, res) => {
        res.sendFile(indexHtmlPath);
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({ ok: true, service: 'avado-grocery-api' });
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Avado Grocery server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
