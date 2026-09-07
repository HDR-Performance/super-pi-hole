import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:20721';
const response=await fetch(base);
assert.equal(response.status,200);
const html=await response.text();
const assets=[...html.matchAll(/(?:src|href)="(\/(?:assets\/[^"?#]+|favicon\.svg))"/g)].map(m=>m[1]);
assert.ok(assets.some(p=>p.endsWith('.js')),'Built script must be present');
assert.ok(assets.some(p=>p.endsWith('.css')),'Built stylesheet must be present');
assert.ok(assets.includes('/favicon.svg'),'Brand icon must be present');
for(const path of assets){const r=await fetch(new URL(path,base));assert.equal(r.status,200,path);assert.ok((await r.arrayBuffer()).byteLength>100,path);}
console.log(`PASS: ${assets.length} actual container web assets are readable`);
