import { Express, Request, Response } from 'express';
import { handleOAuthCallback } from '../google/auth.js';

export function setupOAuthRoutes(app: Express): void {
    app.get('/oauth/google/callback', async (req: Request, res: Response) => {
        const { code, state } = req.query;

        if (!code || typeof code !== 'string') {
            res.status(400).send('Código de autorização não encontrado');
            return;
        }

        try {
            const userId = state ? parseInt(state as string, 10) : null;

            if (!userId) {
                res.status(400).send('User ID não encontrado no state');
                return;
            }

            await handleOAuthCallback(userId, code);

            res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Autorização Concluída</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: rgba(255,255,255,0.1);
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
            .emoji { font-size: 64px; margin-bottom: 20px; }
            h1 { margin: 0 0 10px 0; }
            p { opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">✅</div>
            <h1>Autorização Concluída!</h1>
            <p>Você pode fechar esta janela e voltar ao Telegram.</p>
          </div>
        </body>
        </html>
      `);
        } catch (error) {
            console.error('❌ OAuth callback error:', error);
            res.status(500).send('Erro ao processar autorização. Tente novamente.');
        }
    });
}
