
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Carregar .env manualmente para teste
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
console.log('🔑 Testando API Key:', apiKey ? 'Encontrada (Inicio: ' + apiKey.substring(0, 8) + '...)' : 'NÃO ENCONTRADA');

if (!apiKey) {
    console.error('❌ ERRO: Adicione GEMINI_API_KEY no arquivo .env');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const MODELS = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro'];

async function test() {
    for (const modelName of MODELS) {
        console.log(`\n🤖 Testando modelo: ${modelName}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('Responda apenas com a palavra: FUNCIONOU');
            console.log(`✅ SUCESSO com ${modelName}! Resposta: ${result.response.text()}`);
            process.exit(0); // Sai no primeiro sucesso
        } catch (error: any) {
            console.error(`❌ Falha com ${modelName}:`, error.message);
        }
    }
    console.error('\n❌ TODOS OS MODELOS FALHARAM.');
}

test();
