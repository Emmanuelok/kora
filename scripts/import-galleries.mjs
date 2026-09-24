import fs from 'node:fs';
import assert from 'node:assert/strict';
const filename=process.argv[2];if(!filename)throw Error('Usage: node scripts/import-galleries.mjs verified-gallery-batch.json');
const batch=JSON.parse(fs.readFileSync(filename,'utf8'));
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const ids=new Set(products.map(p=>p.id));
const galleries=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8'));
const validation=JSON.parse(fs.readFileSync('data/gallery-image-validation.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('data/gallery-evidence.json','utf8'));
for(const v of [...validation,...(batch.validation||[])])if(!v.pixelSha256&&v.normalizedPixelHash)v.pixelSha256=v.normalizedPixelHash;
const checks=new Map(validation.map(v=>[v.url,v]));
for(const v of batch.validation||[]){assert.equal(v.httpStatus||v.status,200);assert(v.width>=100&&v.height>=100&&v.sha256);checks.set(v.url,v)}
const canonical=url=>{const u=new URL(url);return u.origin+u.pathname.replace(/\/\d+x\d+\//g,'/SIZE/')};
let added=0,photosAdded=0,preserved=0;
for(const [id,photos] of Object.entries(batch.galleries||{})){
 assert(ids.has(id),'Unknown catalogue ID: '+id);assert(Array.isArray(photos)&&photos.length&&photos.length<=12);
 const urls=new Set(),pixels=new Set();
 for(const p of photos){assert(p.url.startsWith('https://')&&p.sourceUrl.startsWith('https://')&&p.caption&&/^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt));const proof=checks.get(p.url);assert(proof,'Missing image-byte validation: '+p.url);assert.equal(proof.httpStatus||proof.status,200);const u=canonical(p.url),hash=proof.pixelSha256||proof.sha256;assert(!urls.has(u)&&!pixels.has(hash),'Duplicate view: '+id);urls.add(u);pixels.add(hash)}
 // Existing multi-image galleries are retained; approved new batches fill coverage gaps.
 if((galleries[id]?.length||0)>=2){preserved++;continue}
 if(photos.length<2&&galleries[id]?.length)continue;
 photosAdded+=photos.length-(galleries[id]?.length||0);galleries[id]=photos;added++;
 evidence.products[id]={...evidence.products[id],...(batch.evidence?.[id]||{}),status:photos.length>1?'verified_multiple':'source_limited',attempted:true,checkedAt:photos[0].checkedAt,sourceUrls:[...new Set(photos.map(p=>p.sourceUrl))],galleryImageCount:photos.length,failure:null};
}
const coverage=JSON.parse(fs.readFileSync('data/gallery-coverage.json','utf8'));
Object.assign(coverage,{checkedAt:batch.checkedAt,totalProducts:products.length,productsWithMultipleImages:Object.values(galleries).filter(p=>p.length>1).length,productsWithThreeOrMoreImages:Object.values(galleries).filter(p=>p.length>=3).length,reviewedProducts:Object.keys(galleries).length,galleryPhotos:Object.values(galleries).reduce((n,p)=>n+p.length,0),singleImageProducts:products.filter(p=>p.imageVerificationStatus!=='under_review'&&(galleries[p.id]?.length||1)===1).length,productsWithNoVerifiedImage:products.filter(p=>p.imageVerificationStatus==='under_review').length,productsAwaitingMultipleImages:products.filter(p=>(galleries[p.id]?.length||0)<2).length,pendingSourceAccess:products.filter(p=>(galleries[p.id]?.length||0)<2&&['blocked_pending','pending','api_error'].includes(evidence.products[p.id]?.status)).length,complete:products.every(p=>(galleries[p.id]?.length||0)>1),fullImageValidation:'passed'});
const write=(path,data)=>fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
write('data/product-galleries.json',galleries);write('data/gallery-image-validation.json',[...checks.values()]);write('data/gallery-evidence.json',evidence);write('data/gallery-coverage.json',coverage);
console.log(JSON.stringify({addedOrUpgradedProducts:added,additionalGalleryPhotos:photosAdded,existingMultipleGalleriesPreserved:preserved,...coverage},null,2));
