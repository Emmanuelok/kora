import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const catalogue=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const galleries=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8'));
const coverage=JSON.parse(fs.readFileSync('data/gallery-coverage.json','utf8'));
const previews=JSON.parse(fs.readFileSync('data/gallery-previews.json','utf8'));
const checks=new Map(JSON.parse(fs.readFileSync('data/gallery-image-validation.json','utf8')).map(v=>[v.url,v]));
const ids=new Set(catalogue.map(p=>p.id));
const canonical=url=>{const u=new URL(url);return u.origin+u.pathname.replace(/\/\d+x\d+\//g,'/SIZE/')};
for(const [id,photos] of Object.entries(galleries)){
 assert(ids.has(id),'Gallery must preserve a real catalogue ID');assert(photos.length>0&&photos.length<=12);
 const seen=new Set(),pixels=new Set();
 for(const p of photos){assert(p.url.startsWith('https://'));assert(p.sourceUrl.startsWith('https://'));assert(p.caption&&/^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt));const proof=checks.get(p.url);assert(proof,'Missing image validation: '+p.url);assert.equal(proof.httpStatus||proof.status,200);assert(proof.sha256&&proof.width>=100&&proof.height>=100);const fingerprint=proof.pixelSha256||proof.sha256;assert(!pixels.has(fingerprint),'Identical photo bytes: '+id);pixels.add(fingerprint);const key=canonical(p.url);assert(!seen.has(key),'Duplicate view: '+id);seen.add(key)}
}
assert.equal(coverage.totalProducts,catalogue.length);
assert.equal(coverage.productsWithMultipleImages,Object.values(galleries).filter(p=>p.length>1).length);
assert.equal(coverage.galleryPhotos,Object.values(galleries).reduce((n,p)=>n+p.length,0));
assert.equal(Object.keys(previews).length,coverage.productsWithMultipleImages);
for(const [id,preview] of Object.entries(previews)){assert.equal(preview.count,galleries[id].length);assert.equal(preview.alternate,galleries[id][1].url)}
globalThis.__galleryTest={catalogue,galleries};
let source=fs.readFileSync('app/api/gallery/route.ts','utf8').replace("import {catalogue} from '@/lib/catalogue';",'const {catalogue}=globalThis.__galleryTest;').replace("import galleries from '../../../data/product-galleries.json';",'const {galleries}=globalThis.__galleryTest;');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const req=id=>new Request('https://kora.test/api/gallery?product='+encodeURIComponent(id));
assert.equal((await GET(req('unknown'))).status,404);
const multi=Object.keys(galleries).find(id=>galleries[id].length>=3);
let r=await GET(req(multi));assert.equal(r.status,200);let data=await r.json();assert.equal(data.total,galleries[multi].length);assert.deepEqual(data.images,galleries[multi]);
const fallback=catalogue.find(p=>!galleries[p.id]);r=await GET(req(fallback.id));data=await r.json();assert.equal(data.total,1);assert.equal(data.images[0].url,fallback.image);
for(const p of catalogue.filter(p=>p.imageVerificationStatus==='under_review')){r=await GET(req(p.id));data=await r.json();assert.equal(data.total,0);assert.deepEqual(data.images,[])}
assert(!fs.readFileSync('app/store.tsx','utf8').includes("from '../data/product-galleries"),'Gallery metadata remains server-only');
console.log(JSON.stringify({passed:true,checks:['stable product IDs','distinct source image identities','source URLs and dates','truthful coverage counts','multi-photo API','single-photo fallback','unknown product 404'],...coverage},null,2));
delete globalThis.__galleryTest;
