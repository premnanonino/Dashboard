import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelnyxCoreEngine } from './server/services/telnyxCoreEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createAppServer() {
  const app = express();
  const engine = new TelnyxCoreEngine();
  engine.startLiveTelemetryLoop();

  app.use(express.json({ limit: '1mb' }));

  // System Design Layer 1: Token Bucket Rate Limiter Middleware on /api/*
  app.use('/api', (req, res, next) => {
    if (req.path === '/v1/stream' || req.path === '/health') {
      next();
      return;
    }
    const clientIp = req.ip || req.socket.remoteAddress || 'local-client';
    const decision = engine.rateLimiter.consume(clientIp, 1);

    res.setHeader('X-RateLimit-Limit', String(decision.limit));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    res.setHeader('X-RateLimit-Reset', String(decision.resetAfterSec));

    if (!decision.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded by TokenBucketRateLimiter',
        retryAfterSec: decision.resetAfterSec,
      });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/dashboard', (req, res) => {
    const bypass = req.query.fresh === '1';
    const snapshot = engine.getDashboardSnapshot(bypass);
    res.json(snapshot);
  });

  app.post('/api/v1/sync', async (_req, res) => {
    const syncResult = await engine.trySyncTelnyxLiveApi();
    const snapshot = engine.getDashboardSnapshot(true);
    res.json({ syncResult, snapshot });
  });

  app.get('/api/v1/billing/range', (req, res) => {
    const startHour = Number(req.query.startHour ?? 0);
    const endHour = Number(req.query.endHour ?? 23);
    const result = engine.queryBillingRange(startHour, endHour);
    res.json(result);
  });

  app.patch('/api/v1/billing/config', (req, res) => {
    const { monthlyBudgetCapUsd, autoRecharge } = req.body ?? {};
    const updated = engine.updateBillingConfig({
      monthlyBudgetCapUsd,
      autoRecharge,
    });
    res.json({ account: updated, snapshot: engine.getDashboardSnapshot(true) });
  });

  app.post('/api/v1/billing/topup', (req, res) => {
    const amountUsd = Number(req.body?.amountUsd ?? 500);
    const updated = engine.executeManualTopUp(amountUsd);
    res.json({ account: updated, snapshot: engine.getDashboardSnapshot(true) });
  });

  app.post('/api/v1/billing/simulate-spike', (_req, res) => {
    const outcome = engine.simulateTrafficAndSpendSpike();
    res.json({ ...outcome, snapshot: engine.getDashboardSnapshot(true) });
  });

  app.get('/api/v1/dids/search', (req, res) => {
    const prefix = String(req.query.prefix ?? '+');
    const result = engine.searchDidsByPrefix(prefix);
    res.json(result);
  });

  app.get('/api/v1/routing/lpm', (req, res) => {
    const e164 = String(req.query.e164 ?? '+14158901234');
    const result = engine.evaluateLongestPrefixMatch(e164);
    res.json(result);
  });

  app.post('/api/v1/system/pop-failover', (req, res) => {
    const popCode = String(req.body?.popCode ?? 'IAD1');
    const pops = engine.togglePopFailover(popCode);
    res.json({ pops, snapshot: engine.getDashboardSnapshot(true) });
  });

  app.post('/api/v1/system/circuit-breaker', (req, res) => {
    const action = req.body?.action === 'trip' ? 'trip' : 'reset';
    const circuit = engine.mutateCircuitBreaker(action);
    res.json({ circuit, snapshot: engine.getDashboardSnapshot(true) });
  });

  // Real-time Server-Sent Events stream powered by Pub/Sub EventBus
  app.get('/api/v1/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubTick = engine.eventBus.subscribe('telemetry_tick', (payload) => {
      res.write(`event: telemetry_tick\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const unsubBilling = engine.eventBus.subscribe('billing_updated', (payload) => {
      res.write(`event: billing_updated\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubTick();
      unsubBilling();
    });
  });

  // Mount Vite dev middleware in development or serve built dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return { app, engine };
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const port = Number(process.env.PORT ?? 3000);
  const { app } = await createAppServer();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Telnyx Carrier & Billing Monitor listening on http://0.0.0.0:${port}`);
  });
}
