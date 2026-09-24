import fs from 'node:fs';
import assert from 'node:assert/strict';
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const source=fs.readFileSync('app/store.tsx','utf8');
const pages=new Set(['/sign-in','/sign-up','/install','/','/shop','/departments','/saved','/compare','/cart','/checkout','/account','/track','/services','/trade-in','/business','/advisor','/brands','/collections','/new-releases','/updates']);
const staticLinks=[...source.matchAll(/href="(\/[^"{}]*)"/g)].map(m=>m[1]);
const downloads=new Set(['/catalogue-inventory.csv','/catalogue-gallery-gaps.csv']);
for(const link of staticLinks){const path=link.split('?')[0];assert(pages.has(path)||(path.startsWith('/product/')&&products.some(p=>path==='/product/'+p.id))||path.startsWith('/help/')||path==='/help'||(downloads.has(path)&&fs.existsSync('public'+path)),`Unimplemented link ${link}`)}
const departments=JSON.parse(fs.readFileSync('data/departments.json','utf8'));
for(const d of Object.keys(departments))assert(products.some(p=>p.department===d),`Empty department ${d}`);
const categories=new Set(products.map(p=>p.department+'|'+p.category));
for(const p of products){assert(pages.has('/shop'));assert(p.id&&!p.id.includes('/'));assert(p.name&&p.image&&p.sourceUrl);if(p.image.startsWith('/api/product-image?'))assert(JSON.parse(fs.readFileSync('data/product-image-bytes.json'))[new URL(p.image,'https://kora.example').searchParams.get('id')]);else if(p.image.startsWith('/'))assert(fs.existsSync('public'+p.image),`Missing image ${p.id}`);assert(new URL(p.sourceUrl).protocol==='https:');}
assert(!source.includes("import Link from 'next/link'"),'Use ordinary links for reliable navigation');
assert(source.includes('action="/shop" method="get"'),'Search must support native submission');
assert(!source.includes('priceCAD*9.5'));
console.log(JSON.stringify({passed:true,staticLinkOccurrences:staticLinks.length,productRoutes:products.length,departmentRoutes:Object.keys(departments).length,categoryRoutes:categories.size,brands:new Set(products.map(p=>p.brand).filter(Boolean)).size,localProductImages:products.filter(p=>p.image.startsWith('/')).length},null,2));
