import express from 'express';
import { config } from './config/env.js';
import { pool } from './db/connection.js';
import { setupWebhookRoute } from './routes/webhook.js';
import { setupHealthRoute } from './routes/health.js';
import { setupOAuthRoutes } from './routes/oauth.js';
import { initBot } from './bot/telegram.js';

const app = express();

// Middleware
app.use(express.json());

// Routes
setupHealthRoute(app);
setupWebhookRoute(app);
setupOAuthRoutes(app);

// Initialize bot
initBot();

// Start server
const server = app.listen(config.port, () => {
    console.log(`
🧩 ═══════════════════════════════════════════════════════════
   ACESSOR ELITE BOT
   ───────────────────────────────────────────────────────────
   🚀 Server running on port ${config.port}
   🌍 Environment: ${config.nodeEnv}
   🕐 Timezone: ${config.timezone}
   ───────────────────────────────────────────────────────────
   📡 Webhook: /telegram/webhook
   ❤️  Health:  /health
   🔐 OAuth:   /oauth/google/callback
═══════════════════════════════════════════════════════════ 🧩
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down...');
    server.close();
    await pool.end();
    process.exit(0);
});
