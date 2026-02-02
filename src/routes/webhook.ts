import { Express, Request, Response } from 'express';
import { handleUpdate } from '../bot/telegram.js';

export function setupWebhookRoute(app: Express): void {
    app.post('/telegram/webhook', async (req: Request, res: Response) => {
        // Always respond immediately to Telegram
        res.sendStatus(200);

        // Process update asynchronously
        try {
            await handleUpdate(req.body);
        } catch (error) {
            console.error('❌ Error processing update:', error);
        }
    });
}
