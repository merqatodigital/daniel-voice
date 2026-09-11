import { loadKnowledge } from '../src/lib/knowledge';

/**
 * Seed script — loads knowledge-base.md and prints what would be inserted.
 * Run with: npx tsx scripts/seed-knowledge.ts
 */
async function seed() {
  console.log('Loading knowledge-base.md...\n');
  const items = loadKnowledge();
  console.log(`Parsed ${items.length} knowledge items:\n`);

  for (const item of items) {
    console.log(`  ${item.id}. ${item.title}`);
    console.log(`     tags: ${item.tags.join(', ')}`);
    console.log(`     ${item.content.slice(0, 80)}...\n`);
  }

  console.log('\n✅ Knowledge base ready.');
  console.log(`Total: ${items.length} items covering BAIA, Marina Terrace, San Vicente, Mergato Digital.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
