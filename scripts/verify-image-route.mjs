import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const images=JSON.parse(fs.readFileSync('data/product-image-bytes.json','utf8'));
globalThis.__koraImages=images;
const source=fs.readFileSync('app/api/product-image/route.ts','utf8').replace("import images from '../../../data/product-image-bytes.json';",'const images=globalThis.__koraImages;');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const id of Object.keys(images)){const r=await GET(new Request('https://kora.example/api/product-image?id='+id));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/webp');const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.toString('base64'),images[id]);}
assert.equal((await GET(new Request('https://kora.example/api/product-image?id=__proto__'))).status,404);
console.log('Five original product images pass byte integrity and MIME checks.');delete globalThis.__koraImages;
