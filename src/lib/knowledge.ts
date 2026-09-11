import { readFileSync } from 'fs';
import { join } from 'path';

export type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
};

let cache: KnowledgeItem[] | null = null;

/**
 * Load knowledge base from the markdown file.
 * Parses ## and ### sections into searchable items.
 */
export function loadKnowledge(): KnowledgeItem[] {
  if (cache) return cache;

  try {
    const filePath = join(process.cwd(), 'knowledge-base.md');
    const text = readFileSync(filePath, 'utf-8');
    const items: KnowledgeItem[] = [];
    let id = 0;

    const lines = text.split('\n');
    let currentCategory = '';
    let currentTitle = '';
    let currentContent: string[] = [];

    const flush = () => {
      if (currentTitle && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content.length > 20) {
          items.push({
            id: String(++id),
            title: currentTitle,
            content,
            tags: extractTags(currentTitle + ' ' + content),
            category: currentCategory,
          });
        }
      }
      currentContent = [];
    };

    for (const line of lines) {
      if (line.startsWith('# ')) {
        flush();
        currentCategory = line.slice(2).trim();
        currentTitle = '';
      } else if (line.startsWith('## ')) {
        flush();
        currentTitle = line.slice(3).trim();
      } else if (line.startsWith('### ')) {
        flush();
        currentTitle = line.slice(4).trim();
      } else if (line.startsWith('---')) {
        // separator, skip
      } else if (currentTitle) {
        currentContent.push(line);
      }
    }
    flush();

    cache = items;
    return items;
  } catch (err) {
    console.error('Failed to load knowledge base:', err);
    return [];
  }
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  
  const keywords = [
    'baia', 'marina', 'san vicente', 'palawan', 'puerto galera', 'mindoro',
    'mergato', 'david', 'booking', 'cancellation', 'payment', 'pickup',
    'airport', 'beach', 'diving', 'snorkeling', 'island', 'room', 'villa',
    'restaurant', 'pool', 'spa', 'wifi', 'check-in', 'check-out',
    'refund', 'transfer', 'gcash', 'maya', 'batangas', 'tala'
  ];

  for (const kw of keywords) {
    if (lower.includes(kw)) tags.push(kw);
  }

  return tags;
}

/**
 * Search knowledge base by query string.
 */
export function searchKnowledge(query: string, limit = 5): KnowledgeItem[] {
  const items = loadKnowledge();
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter(t => t.length > 2);

  const scored = items.map(item => {
    const text = (item.title + ' ' + item.content + ' ' + item.tags.join(' ')).toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (text.includes(token)) score += 1;
      if (item.title.toLowerCase().includes(token)) score += 3;
      if (item.tags.some(t => t.includes(token))) score += 2;
    }
    return { item, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

/**
 * Get knowledge context for the chat system prompt.
 */
export function getKnowledgeContext(query: string): string {
  const results = searchKnowledge(query, 3);
  if (results.length === 0) return '';

  return results
    .map(r => `**${r.title}**\n${r.content}`)
    .join('\n\n');
}
