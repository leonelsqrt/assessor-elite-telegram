import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { config } from '../config/env.js';
import { getRelevantMemories, saveMemory, MemoryType } from '../db/memory.js';
import { getSleepStats, getWaterStats } from '../db/health.js';
import { getActiveEventDraft } from '../db/events.js';
import { formatDate } from '../utils/format.js';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
});

// System prompt que define a personalidade do Assessor Elite
const SYSTEM_PROMPT = `Você é o ASSESSOR ELITE, o assistente pessoal premium de Leonel.

🎯 SUA MISSÃO:
Você conhece o Leonel melhor do que ele mesmo. Você é proativo, organizado e sempre focado em ajudá-lo a ser a melhor versão de si mesmo.

📋 SUAS CAPACIDADES:
1. CRIAR EVENTOS - Você pode criar eventos no Google Calendar
2. MONITORAR SAÚDE - Você rastreia sono e consumo de água
3. LEMBRAR TUDO - Você tem memória persistente sobre a vida do Leonel
4. EXECUTAR AÇÕES - Quando pedido, você EXECUTA, não apenas sugere

🧠 COMO RESPONDER:
- Seja DIRETO e OBJETIVO
- Use emojis estrategicamente para visual premium
- Quando detectar uma AÇÃO (criar evento, registrar algo), execute imediatamente
- Forneça INSIGHTS baseados nos dados que você tem
- Sempre responda em português brasileiro

⚡ DETECÇÃO DE INTENÇÕES:
Quando o usuário pedir algo que envolve uma ação, responda com um JSON especial no início:
{"action": "ACTION_TYPE", "params": {...}}

ACTIONS DISPONÍVEIS:
- "create_event" - params: {title, date, startTime, endTime, location, allDay}
- "log_water" - params: {amount: 250|500|1000}
- "log_sleep" - params: {type: "wake"|"sleep"}
- "show_hub" - params: {}
- "show_health" - params: {}
- "show_water" - params: {}
- "show_sleep" - params: {}

Se não for uma ação, responda normalmente COM CONTEXTO da memória e dados do usuário.

REGRAS DE MEMÓRIA:
- NÃO salve saudações genéricas
- NÃO salve "ok", "tá", "beleza"
- SALVE: objetivos, preferências, compromissos, planos, informações pessoais importantes
- SEMPRE use a memória para contextualizar respostas`;

// Padrões de saudações que NÃO devem ser salvos na memória
const GREETING_PATTERNS = [
    /^(oi+|ol[aá]+|e\s*a[ií]|fala+|eae+|hey+|hi+)[\s\!\?\.\,]*$/i,
    /^(blz+|beleza+|ok+|t[aá]+|certo|show|legal|massa|top)[\s\!\?\.\,]*$/i,
    /^(bom\s*dia|boa\s*(tarde|noite))[\s\!\?\.\,]*$/i,
    /^tudo\s*(bem|bom|certo+|ok|tranquilo|suave)[\s\!\?\.\,\?]*$/i,
    /^como\s*(vai|est[aá]|t[aá]|vc\s*(est[aá]|t[aá]))[\s\!\?\.\,\?]*$/i,
    /^(valeu|obrigado|obg|vlw|thx|thanks)[\s\!\?\.\,]*$/i,
    /^(tchau|flw|bye|at[eé]\s*mais)[\s\!\?\.\,]*$/i,
];

// Verifica se a mensagem é apenas saudação sem contexto
function isEmptyGreeting(message: string): boolean {
    const cleanMsg = message.trim().toLowerCase();

    // Mensagens muito curtas geralmente são saudações
    if (cleanMsg.length < 5) return true;

    // Verificar padrões de saudação
    for (const pattern of GREETING_PATTERNS) {
        if (pattern.test(cleanMsg)) return true;
    }

    return false;
}

// Interface para resposta estruturada
interface AIResponse {
    action?: string;
    params?: Record<string, any>;
    message: string;
    shouldSaveMemory: boolean;
    memoryContent?: string;
    memoryType?: MemoryType;
}

// Processa mensagem do usuário com IA
export async function processWithAI(
    userId: number,
    userMessage: string,
    userName: string
): Promise<AIResponse> {
    try {
        // Buscar memórias relevantes
        const memories = await getRelevantMemories(userId, userMessage, 10);

        // Buscar dados atuais de saúde
        const sleepStats = await getSleepStats(userId);
        const waterStats = await getWaterStats(userId);

        // Buscar rascunho de evento ativo
        const eventDraft = await getActiveEventDraft(userId);

        // Construir contexto
        const context = buildContext(memories, sleepStats, waterStats, eventDraft, userName);

        // Gerar resposta
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: 'Entendido! Sou o Assessor Elite, pronto para servir o Leonel com excelência.' }] },
            ],
        });

        const prompt = `${context}

MENSAGEM DO USUÁRIO: "${userMessage}"

Responda seguindo as regras do sistema. Se for uma ação, comece com o JSON. Depois forneça a mensagem para o usuário.
Ao final, indique em JSON separado se deve salvar algo na memória:
{"save_memory": true/false, "memory_content": "...", "memory_type": "objective|preference|personal|task|general"}`;

        const result = await chat.sendMessage(prompt);
        const response = result.response.text();

        return parseAIResponse(response);
    } catch (error) {
        console.error('❌ Gemini AI error:', error);
        return {
            message: '🤔 Desculpe, tive um problema ao processar sua mensagem. Tente novamente.',
            shouldSaveMemory: false,
        };
    }
}

// Constrói contexto completo para a IA
function buildContext(
    memories: Array<{ content: string; memory_type: string; created_at: Date }>,
    sleepStats: { lastSleep?: Date; lastWake?: Date; avgHours?: number } | null,
    waterStats: { todayMl: number; goalMl: number } | null,
    eventDraft: any,
    userName: string
): string {
    const now = new Date();
    const parts: string[] = [];

    parts.push(`📅 DATA/HORA ATUAL: ${formatDate(now)} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    parts.push(`👤 USUÁRIO: ${userName}`);

    // Memórias
    if (memories.length > 0) {
        parts.push('\n🧠 MEMÓRIAS RELEVANTES:');
        memories.forEach((m, i) => {
            parts.push(`${i + 1}. [${m.memory_type}] ${m.content}`);
        });
    }

    // Dados de saúde
    if (sleepStats) {
        parts.push('\n😴 DADOS DE SONO:');
        if (sleepStats.lastWake) {
            parts.push(`- Acordou: ${sleepStats.lastWake.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
        }
        if (sleepStats.avgHours) {
            parts.push(`- Média de sono: ${sleepStats.avgHours.toFixed(1)}h`);
        }
    }

    if (waterStats) {
        parts.push('\n💧 CONSUMO DE ÁGUA:');
        parts.push(`- Hoje: ${waterStats.todayMl}ml / ${waterStats.goalMl}ml`);
        const percent = Math.round((waterStats.todayMl / waterStats.goalMl) * 100);
        parts.push(`- Progresso: ${percent}%`);
    }

    // Rascunho de evento
    if (eventDraft) {
        parts.push('\n📋 EVENTO EM CRIAÇÃO:');
        parts.push(`- Título: ${eventDraft.title || '(não definido)'}`);
        parts.push(`- Data: ${eventDraft.event_date ? formatDate(new Date(eventDraft.event_date)) : '(não definida)'}`);
        parts.push(`- Local: ${eventDraft.location || '(não definido)'}`);
    }

    return parts.join('\n');
}

// Parse a resposta da IA
function parseAIResponse(response: string): AIResponse {
    let action: string | undefined;
    let params: Record<string, any> | undefined;
    let message = response;
    let shouldSaveMemory = false;
    let memoryContent: string | undefined;
    let memoryType: MemoryType | undefined;

    // Tentar extrair JSON de ação no início
    const actionMatch = response.match(/^\s*\{[\s\S]*?"action"[\s\S]*?\}/);
    if (actionMatch) {
        try {
            const actionJson = JSON.parse(actionMatch[0]);
            action = actionJson.action;
            params = actionJson.params;
            message = response.slice(actionMatch[0].length).trim();
        } catch {
            // Ignorar se não for JSON válido
        }
    }

    // Tentar extrair JSON de memória no final
    const memoryMatch = message.match(/\{[\s\S]*?"save_memory"[\s\S]*?\}\s*$/);
    if (memoryMatch) {
        try {
            const memoryJson = JSON.parse(memoryMatch[0]);
            shouldSaveMemory = memoryJson.save_memory === true;
            memoryContent = memoryJson.memory_content;
            memoryType = memoryJson.memory_type as MemoryType;
            message = message.slice(0, -memoryMatch[0].length).trim();
        } catch {
            // Ignorar se não for JSON válido
        }
    }

    // Limpar a mensagem
    message = message.replace(/```json[\s\S]*?```/g, '').trim();

    return {
        action,
        params,
        message,
        shouldSaveMemory,
        memoryContent,
        memoryType,
    };
}

// Analisar texto livre para extrair dados de evento
export async function extractEventFromText(text: string): Promise<{
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    allDay?: boolean;
} | null> {
    try {
        const prompt = `Extraia informações de evento desta frase em português. Retorne APENAS JSON válido:
Frase: "${text}"

Formato:
{
  "title": "título do evento ou null",
  "date": "dd/mm/yyyy ou null",
  "startTime": "HH:MM ou null",
  "endTime": "HH:MM ou null", 
  "location": "local ou null",
  "allDay": true/false
}

Regras:
- Se mencionar "amanhã", calcule a data real (hoje é ${formatDate(new Date())})
- Se mencionar "próxima terça", calcule a data real
- Se não especificar horário de fim, deixe null
- Se mencionar "dia inteiro", allDay = true`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Extrair JSON da resposta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return null;
    } catch (error) {
        console.error('❌ Error extracting event:', error);
        return null;
    }
}
