import { Router } from 'express';
import { processTextWithAI } from '../services/ai.js';
import { createTransaction, createCategory, getCategories, getMonthSummary } from '../db/finances.js';
import { logWater, getDailyWater } from '../db/health.js';
import { config } from '../config/env.js';

export const router = Router();

// Middleware de autenticação simples (MVP)
// Pode ser expandido para JWT no futuro
const DEFAULT_USER_ID = config.telegramAllowlist[0];

router.get('/dashboard', async (req, res) => {
    try {
        const userId = DEFAULT_USER_ID;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // Paralelizar chamadas
        const [financeSummary, waterLog] = await Promise.all([
            getMonthSummary(userId, month, year),
            getDailyWater(userId, now)
        ]);

        res.json({
            finance: {
                balance: financeSummary.saldo,
                income: financeSummary.totalEntradas,
                expense: financeSummary.totalSaidas
            },
            health: {
                water: waterLog?.amount || 0,
                waterGoal: config.waterGoalMl
            },
            user: {
                name: 'Leonel', // Pode vir do DB no futuro
                id: userId
            }
        });
    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/chat', async (req, res) => {
    try {
        const { text } = req.body;
        const userId = DEFAULT_USER_ID;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const action = await processTextWithAI(text);
        let resultMessage = action.response;
        let success = true;

        if (action.type === 'finance_transaction') {
            try {
                // Ensure category exists
                const existingCats = await getCategories(userId, action.data.type);
                let catId = existingCats.find(c => c.name.toLowerCase() === action.data.categoryName.toLowerCase())?.id;

                if (!catId) {
                    // Create new category
                    catId = await createCategory(userId, action.data.categoryName, action.data.categoryEmoji, action.data.type);
                }

                await createTransaction(userId, action.data.type, action.data.amount, catId, action.data.description);
                resultMessage = `✅ ${action.response}`;
            } catch (e) {
                console.error('Transaction Error:', e);
                success = false;
                resultMessage = 'Erro ao processar transação.';
            }
        } else if (action.type === 'health_water') {
            try {
                await logWater(userId, action.data.amountMl);
                resultMessage = `💧 ${action.response}`;
            } catch (e) {
                console.error('Water Log Error:', e);
                success = false;
                resultMessage = 'Erro ao registrar água.';
            }
        }

        res.json({
            success,
            message: resultMessage,
            action: action.type,
            data: 'data' in action ? action.data : null
        });

    } catch (error: any) {
        console.error('API Chat Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
