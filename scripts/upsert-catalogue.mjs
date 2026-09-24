// Usage: node scripts/upsert-catalogue.mjs /absolute/path/to/verified-candidates.json
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const file=process.argv[2];assert(file,'Pass verified candidate JSON');
const input=JSON.parse(fs.readFileSync(file,'utf8'));assert(Array.isArray(input));
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const departments=JSON.parse(fs.readFileSync('data/departments.json','utf8'));
const now=new Date().toISOString().slice(0,10), map=new Map(products.map(p=>[p.id,p]));
for(const p of input){
 for(const k of ['id','name','brand','department','category','image','sourceUrl','description','sourcePriceCheckedAt'])assert(p[k],`Missing ${k}`);
 assert(departments[p.department],'Unknown department');assert(p.manufacturerVerified===true,'Official verification required');
 assert(new URL(p.sourceUrl).protocol==='https:','Source must be HTTPS');
 assert(p.image.startsWith('/images/products/')||new URL(p.image).protocol==='https:','Exact product image required');
 assert(['coming_soon','released'].includes(p.releaseStatus),'Release status required');
 if(p.releaseStatus==='released'&&p.releaseDate)assert(p.releaseDate<=now,'Future product cannot be released');
 if(p.priceGHS!=null)assert(p.priceGHS>0&&p.priceSource&&p.priceCheckedAt&&p.retailerVariantId,'Local exact variant evidence required');
 const previous=map.get(p.id);map.set(p.id,{...previous,...p,priceCAD:p.priceCAD??0,regularPriceCAD:p.regularPriceCAD??0});
}
fs.writeFileSync('data/products.json',JSON.stringify([...map.values()]));
const registry=JSON.parse(fs.readFileSync('data/brand-watch.json','utf8'));
for(const p of input){let item=registry.find(x=>x.brand===p.brand);if(!item){item={brand:p.brand,manufacturerSources:[],discoveryQuery:p.brand+' official new product announcement',coverage:'Manufacturer sources and official search'};registry.push(item)}if(!item.manufacturerSources.includes(p.sourceUrl))item.manufacturerSources.push(p.sourceUrl);item.lastChecked=now;}
fs.writeFileSync('data/brand-watch.json',JSON.stringify(registry,null,2));
execFileSync(process.execPath,['scripts/export-catalogue.mjs']);
console.log(`Upserted ${input.length} verified candidates; catalogue now ${map.size} records.`);
