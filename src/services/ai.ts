import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const SYSTEM_PROMPT = `
Você é o "Assessor Elite", um assistente pessoal inteligente integrado a um bot do Telegram.
Sua função é interpretar a linguagem natural do usuário e converter em AÇÕES ESTRUTURADAS (JSON) para o sistema.

**MÓDULOS DISPONÍVEIS:**

1. **FINANÇAS**
   - Registrar entrada (ganhos, salários, vendas)
   - Registrar saída (compras, gastos, pagamentos)
   - Categorias: Use emojis! Ex: 🍔 Alimentação, 🚗 Transporte, 🏠 Casa. Se o usuário não disser, infira.
   - Contas Fixas: Pagar contas (luz, internet, aluguel).

2. **SAÚDE**
   - Água: Registrar consumo em ml.
   - Sono: Registrar horário de dormir/acordar ou duração.
   - Atividade: Registrar exercícios.

3. **CONVERSA (Chat)**
   - Se o usuário apenas cumprimentar ou perguntar algo fora do escopo de registro, responda como um assistente atencioso e premium.

**FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):**

Você DEVE retornar APENAS um JSON válido, sem markdown, sem explicações extras.

Estruturas possíveis:

**1. Gasto/Saída:**
{
  "type": "finance_transaction",
  "data": {
    "type": "saida",
    "amount": 123.45,
    "categoryName": "Nome da Categoria",
    "categoryEmoji": "🤔",
    "description": "descrição opcional"
  },
  "response": "Texto curto confirmando a ação para o usuário"
}

**2. Ganho/Entrada:**
{
  "type": "finance_transaction",
  "data": {
    "type": "entrada",
    "amount": 5000.00,
    "categoryName": "Nome da Categoria",
    "categoryEmoji": "💰",
    "description": "descrição opcional"
  },
  "response": "Texto curto confirmando"
}

**3. Água:**
{
  "type": "health_water",
  "data": {
    "amountMl": 500
  },
  "response": "Texto curto motivador"
}

**4. Conversa (Chat):**
{
  "type": "chat",
  "response": "Sua resposta textual aqui..."
}

**DICAS:**
- Se o usuário disser "Gastei 50 na farmácia", infira categoria "🏥 Saúde" ou "💊 Farmácia".
- "Almoço 30 reais" -> Saída, 30.00, Alimentação 🍔.
- "Bebi um copo d'agua" -> Água, 250ml (padrão se não especificar).
- "Garrafinha de agua" -> 500ml.
- Data atual: ${new Date().toLocaleString('pt-BR')}
`;

export type AIAction =
  | { type: 'finance_transaction'; data: { type: 'entrada' | 'saida'; amount: number; categoryName: string; categoryEmoji: string; description?: string }; response: string }
  | { type: 'health_water'; data: { amountMl: number }; response: string }
  | { type: 'chat'; response: string };

const MODELS_TO_TRY = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro'];

export async function processTextWithAI(text: string): Promise<AIAction> {
  let lastError: any;

  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`🤖 Tentando modelo IA: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + `\n\nUSUÁRIO DIZ: "${text}"` }] }],
      });

      const responseText = result.response.text();
      console.log(`🤖 Sucesso com ${modelName}! Response Raw:`, responseText);

      // Limpar markdown se houver (gemini-pro gosta de ```json)
      const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        console.error(`❌ Erro ao parsear JSON do modelo ${modelName}:`, e);
        // Se falhar o JSON, mas a API funcionou, talvez não devamos tentar outro modelo de imediato, 
        // mas para garantir, vamos assumir que o modelo foi burro e tentar o próximo se houver.
        // Mas geralmente é melhor retornar erro de entendimento.
        return { type: 'chat', response: 'Desculpe, não consegui entender exatamente. Pode repetir?' };
      }

    } catch (error: any) {
      console.error(`❌ Falha com modelo ${modelName}:`, error.message);
      lastError = error;
      // Continua para o próximo modelo
    }
  }

  // Se chegou aqui, todos falharam
  console.error('❌ Todos os modelos de IA falharam.');
  if (lastError?.status === 403 || lastError?.message?.includes('API key')) {
    return { type: 'chat', response: '⚠️ Erro de permissão na API Key. Verifique se a chave é válida.' };
  }

  return { type: 'chat', response: 'Estou sem conexão com minha inteligência no momento. Tente novamente mais tarde.' };
}

