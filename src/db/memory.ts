import { query, queryOne } from './connection.js';

// Types of memories to store
export type MemoryType = 'objective' | 'preference' | 'personal' | 'task' | 'general';

export interface Memory {
    id: number;
    user_id: number;
    content: string;
    memory_type: MemoryType;
    importance: number; // 1-10
    keywords: string[];
    created_at: Date;
    last_accessed: Date;
}

// Save a new memory
export async function saveMemory(
    userId: number,
    content: string,
    type: MemoryType = 'general',
    importance: number = 5,
    keywords: string[] = []
): Promise<number> {
    // Check for duplicates or very similar memories
    const existing = await queryOne<{ id: number }>(
        `SELECT id FROM memories 
     WHERE user_id = $1 
       AND content ILIKE $2 
       AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId, `%${content.substring(0, 50)}%`]
    );

    if (existing) {
        // Update importance if duplicate
        await query(
            'UPDATE memories SET importance = LEAST(importance + 1, 10), last_accessed = NOW() WHERE id = $1',
            [existing.id]
        );
        return existing.id;
    }

    // Extract keywords if not provided
    if (keywords.length === 0) {
        keywords = extractKeywords(content);
    }

    const result = await queryOne<{ id: number }>(
        `INSERT INTO memories (user_id, content, memory_type, importance, keywords)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
        [userId, content, type, importance, keywords]
    );

    return result?.id || 0;
}

// Get relevant memories based on query
export async function getRelevantMemories(
    userId: number,
    searchQuery: string,
    limit: number = 10
): Promise<Memory[]> {
    // Extract keywords from search query
    const searchKeywords = extractKeywords(searchQuery);

    // Search by keyword match and recency
    const result = await query<Memory>(
        `SELECT id, user_id, content, memory_type, importance, keywords, created_at, last_accessed
     FROM memories
     WHERE user_id = $1
       AND (
         content ILIKE ANY($2::text[])
         OR keywords && $3::text[]
       )
     ORDER BY 
       importance DESC,
       last_accessed DESC,
       created_at DESC
     LIMIT $4`,
        [
            userId,
            searchKeywords.map(k => `%${k}%`),
            searchKeywords,
            limit,
        ]
    );

    // Update last_accessed for returned memories
    if (result.rows.length > 0) {
        const ids = result.rows.map(r => r.id);
        await query(
            'UPDATE memories SET last_accessed = NOW() WHERE id = ANY($1)',
            [ids]
        );
    }

    return result.rows;
}

// Get all memories for a user
export async function getAllMemories(
    userId: number,
    type?: MemoryType
): Promise<Memory[]> {
    let sql = `
    SELECT id, user_id, content, memory_type, importance, keywords, created_at, last_accessed
    FROM memories
    WHERE user_id = $1
  `;
    const params: any[] = [userId];

    if (type) {
        sql += ' AND memory_type = $2';
        params.push(type);
    }

    sql += ' ORDER BY importance DESC, created_at DESC';

    const result = await query<Memory>(sql, params);
    return result.rows;
}

// Delete old/low-importance memories (cleanup)
export async function cleanupOldMemories(userId: number): Promise<number> {
    // Keep high-importance memories, delete old low-importance ones
    const result = await query(
        `DELETE FROM memories 
     WHERE user_id = $1 
       AND importance < 5 
       AND last_accessed < NOW() - INTERVAL '30 days'
     RETURNING id`,
        [userId]
    );

    return result.rowCount || 0;
}

// Extract keywords from text
function extractKeywords(text: string): string[] {
    // Common Portuguese stop words to ignore
    const stopWords = new Set([
        'a', 'o', 'e', 'é', 'de', 'da', 'do', 'em', 'um', 'uma', 'para', 'com',
        'não', 'que', 'se', 'na', 'no', 'por', 'mais', 'as', 'os', 'como',
        'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou',
        'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também',
        'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois',
        'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse',
        'eles', 'estão', 'você', 'tinha', 'foram', 'essa', 'num', 'nem',
        'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos', 'elas', 'havia',
        'seja', 'qual', 'será', 'nós', 'tenho', 'lhe', 'deles', 'essas',
        'esses', 'pelas', 'este', 'fosse', 'dele', 'tu', 'te', 'vocês', 'vos',
        'lhes', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas', 'nosso',
        'nossa', 'nossos', 'nossas', 'dela', 'delas', 'esta', 'estes', 'estas',
        'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'aquilo', 'estou',
        'está', 'estamos', 'estão', 'estive', 'esteve', 'estivemos', 'estiveram',
        'ok', 'tá', 'beleza', 'oi', 'olá', 'bom', 'dia', 'boa', 'noite', 'tarde'
    ]);

    // Normalize and split
    const words = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents for matching
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

    // Return unique keywords
    return [...new Set(words)].slice(0, 10);
}

// Update memory importance based on usage
export async function boostMemoryImportance(memoryId: number): Promise<void> {
    await query(
        'UPDATE memories SET importance = LEAST(importance + 1, 10), last_accessed = NOW() WHERE id = $1',
        [memoryId]
    );
}
