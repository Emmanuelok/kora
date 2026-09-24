// Public retailer product metadata, exact variant only. No FX conversion or guessed variants.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const path='data/products.json', products=JSON.parse(fs.readFileSync(path,'utf8'));
const result={checkedAt:new Date().toISOString(),checked:0,changed:0,failures:[]};
// Many exact configurations share one product feed. Fetch that source only once per run.
const sourceFeeds=new Map();
for(const p of products.filter(p=>p.priceMetadataUrl&&p.retailerVariantId)){
 try{
  const url=new URL(p.priceMetadataUrl);
  if(!['telefonika.com','compughana.com','www.compughana.com'].includes(url.hostname)||url.protocol!=='https:')throw Error('Unapproved retailer host');
  if(!sourceFeeds.has(url.href))sourceFeeds.set(url.href,(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()})());
  const data=await sourceFeeds.get(url.href);const v=data.variants?.find(v=>String(v.id)===String(p.retailerVariantId));
  if(!v||!Number.isSafeInteger(v.price)||v.price<=0)throw Error('Exact full-price variant unavailable');
  if(/deposit|pre.?order fee|reservation fee/i.test(data.title+' '+v.title))throw Error('Deposit is not a selling price');
  if((p.retailerSku||'')!==(v.sku||'')||p.retailerVariantTitle!==v.title||p.retailerProductTitle!==data.title)throw Error('Retailer identity changed; manual re-verification needed');
  const next=v.price/100;
  if(next<p.priceGHS*0.6||next>p.priceGHS*1.5)throw Error('Large price change requires source review');
  if(p.priceGHS!==next)result.changed++;
  p.priceGHS=next;p.priceCheckedAt=result.checkedAt.slice(0,10);p.sourceAvailability=v.available?'Retailer lists available; not KORA stock':'Retailer lists unavailable; not KORA stock';result.checked++;
 }catch(e){result.failures.push({id:p.id,error:e.message})}
}
fs.writeFileSync(path,JSON.stringify(products));
fs.writeFileSync('data/price-sync-result.json',JSON.stringify(result,null,2));
execFileSync(process.execPath,['scripts/export-catalogue.mjs']);
console.log(JSON.stringify(result,null,2));
