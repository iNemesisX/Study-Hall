// Writes docs/FAQ.md from src/js/faq.js (the same text the app shows in Help → FAQ).
// Run: npm run docs
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/js/faq.js', import.meta.url), 'utf8');
const { faqMarkdown } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/FAQ.md', import.meta.url), faqMarkdown() + '\n');
console.log('wrote docs/FAQ.md');
