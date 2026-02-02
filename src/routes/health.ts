import { Express } from 'express';

export function setupHealthRoute(app: Express): void {
    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'acessor-elite-bot',
        });
    });
}
