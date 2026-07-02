// Smoke-test the configured Qwen endpoint (DashScope or any OpenAI-compatible).
// Usage: node tools/test-qwen.mjs   — reads QWEN_* from the root .env.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const base = process.env.QWEN_BASE_URL;
const model = process.env.QWEN_MODEL;
const key = process.env.QWEN_API_KEY || '';
console.log(`endpoint: ${base}`);
console.log(`model:    ${model}`);
console.log(`key:      ${key.slice(0, 8)}… (${key.length} chars)`);

const t0 = Date.now();
try {
    const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Reply with exactly: POLIS-OK' }],
            max_tokens: 16,
        }),
    });
    const ms = Date.now() - t0;
    const body = await res.text();
    if (!res.ok) {
        console.error(`FAIL ${res.status} in ${ms}ms`);
        console.error(body.slice(0, 500));
        process.exit(1);
    }
    const j = JSON.parse(body);
    const text = j.choices?.[0]?.message?.content ?? '(no content)';
    console.log(`OK ${res.status} in ${ms}ms → "${text.trim()}"`);
} catch (e) {
    console.error(`FAIL (network) after ${Date.now() - t0}ms:`, e.message);
    process.exit(1);
}
