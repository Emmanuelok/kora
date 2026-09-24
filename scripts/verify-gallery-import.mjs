import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Exercise the real import command in a disposable catalogue: upgrading an
// existing gallery, replaying a reviewed batch and failing without partial writes.
const root=process.cwd();
const allProducts=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const allGalleries=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8'));
const allChecks=JSON.parse(fs.readFileSync('data/gallery-image-validation.json','utf8'));
const id=Object.keys(allGalleries).find(key=>allGalleries[key].length>=5);
const photos=allGalleries[id].slice(0,5);
const checks=allChecks.filter(check=>photos.some(photo=>photo.url===check.url));
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'kora-gallery-import-'));
const write=(name,value)=>fs.writeFileSync(path.join(sandbox,name),JSON.stringify(value,null,2)+'\n');
const read=name=>JSON.parse(fs.readFileSync(path.join(sandbox,name),'utf8'));
const files=['product-galleries','gallery-image-validation','gallery-evidence','gallery-coverage'];
const snapshots=()=>files.map(file=>fs.readFileSync(path.join(sandbox,'data',file+'.json'),'utf8'));
const run=batch=>{
 write('batch.json',batch);
 return spawnSync(process.execPath,[path.join(root,'scripts/import-galleries.mjs'),path.join(sandbox,'batch.json')],{cwd:sandbox,encoding:'utf8'});
};
try{
 fs.mkdirSync(path.join(sandbox,'data'));
 write('data/products.json',[allProducts.find(p=>p.id===id)]);
 write('data/product-galleries.json',{[id]:photos.slice(0,2)});
 write('data/gallery-image-validation.json',checks.filter(check=>photos.slice(0,2).some(photo=>photo.url===check.url)));
 write('data/gallery-evidence.json',{products:{[id]:{status:'verified_multiple'}}});
 write('data/gallery-coverage.json',{});
 const batch={checkedAt:'2026-09-24',galleries:{[id]:photos},validation:checks};
 let result=run(batch);assert.equal(result.status,0,result.stderr);
 const gallery=read('data/product-galleries.json')[id];
 assert.deepEqual(gallery,photos,'Existing accepted views must survive a two-to-five-photo upgrade');
 const coverage=read('data/gallery-coverage.json');
 assert.equal(coverage.productsWithFiveOrMoreImages,1);assert.equal(coverage.productsAwaitingFiveImages,0);assert.equal(coverage.complete,true);
 assert.equal(coverage.minimumAdditionalImagesRequired,0);
 const good=snapshots();result=run(batch);assert.equal(result.status,0,result.stderr);assert.deepEqual(snapshots(),good,'Replaying a reviewed batch must not duplicate images');
 const rejects=[
  {...batch,galleries:{[id]:[photos[0],photos[0]]}},
  {...batch,galleries:{'missing-catalogue-id':[photos[0]]}},
  {...batch,galleries:{[id]:[{...photos[0],url:'https://example.invalid/unverified.jpg'}]},validation:[]},
  {...batch,galleries:{[id]:[{...photos[0],url:'https://example.invalid/same-pixels.jpg'},photos[0]]},validation:[...checks,{...checks.find(v=>v.url===photos[0].url),url:'https://example.invalid/same-pixels.jpg'}]},
 ];
 for(const invalid of rejects){result=run(invalid);assert.notEqual(result.status,0,'Invalid gallery import must fail');assert.deepEqual(snapshots(),good,'Rejected import must leave catalogue files intact')}
 console.log(JSON.stringify({passed:true,checks:['existing-gallery upgrade to five photos','existing order preserved','idempotent reimport','duplicates rejected','unknown product rejected','missing byte evidence rejected','identical pixels rejected','no partial writes on failure']}));
}finally{fs.rmSync(sandbox,{recursive:true,force:true})}
