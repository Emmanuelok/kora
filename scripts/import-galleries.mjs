import fs from 'node:fs';
import assert from 'node:assert/strict';
const filename=process.argv[2];if(!filename)throw Error('Usage: node scripts/import-galleries.mjs verified-gallery-batch.json');
const batch=JSON.parse(fs.readFileSync(filename,'utf8'));
assert(/^\d{4}-\d{2}-\d{2}$/.test(batch.checkedAt),'A checkedAt date is required');
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const ids=new Set(products.map(p=>p.id));
const galleries=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8'));
const validation=JSON.parse(fs.readFileSync('data/gallery-image-validation.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('data/gallery-evidence.json','utf8'));
for(const v of [...validation,...(batch.validation||[])])if(!v.pixelSha256&&v.normalizedPixelHash)v.pixelSha256=v.normalizedPixelHash;
const checks=new Map(validation.map(v=>[v.url,v]));
for(const v of batch.validation||[]){assert.equal(v.httpStatus||v.status,200);assert(v.width>=100&&v.height>=100&&v.sha256);checks.set(v.url,v)}
const canonical=url=>{const u=new URL(url);return u.origin+u.pathname.replace(/\/\d+x\d+\//g,'/SIZE/')};
let added=0,photosAdded=0,preserved=0,existingDuplicatesSkipped=0;
for(const [id,photos] of Object.entries(batch.galleries||{})){
 assert(ids.has(id),'Unknown catalogue ID: '+id);assert(Array.isArray(photos)&&photos.length&&photos.length<=12);
 const urls=new Set(),pixels=new Set();
 for(const p of photos){assert(p.url.startsWith('https://')&&p.sourceUrl.startsWith('https://')&&p.caption&&/^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt));const proof=checks.get(p.url);assert(proof,'Missing image-byte validation: '+p.url);assert.equal(proof.httpStatus||proof.status,200);const u=canonical(p.url),hash=proof.pixelSha256||proof.sha256;assert(!urls.has(u)&&!pixels.has(hash),'Duplicate view: '+id);urls.add(u);pixels.add(hash)}
 // Preserve the existing order and accepted photographs, then add reviewed,
 // distinct views. A two-photo gallery is not a reason to reject an upgrade.
 const previous=galleries[id]||[];
 const previousUrls=new Set(previous.map(p=>canonical(p.url)));
 const previousPixels=new Set(previous.map(p=>{const v=checks.get(p.url);assert(v,'Existing photo is missing validation');return v.pixelSha256||v.sha256}));
 const additions=photos.filter(p=>{const v=checks.get(p.url);if(previousUrls.has(canonical(p.url))||previousPixels.has(v.pixelSha256||v.sha256)){existingDuplicatesSkipped++;return false}return true});
 if(!additions.length){preserved++;continue}
 const merged=[...previous,...additions];assert(merged.length<=12,'Merged gallery exceeds twelve reviewed photographs: '+id);
 photosAdded+=additions.length;galleries[id]=merged;added++;
 evidence.products[id]={...evidence.products[id],...(batch.evidence?.[id]||{}),status:merged.length>=5?'verified_five_or_more':merged.length>1?'verified_multiple':'source_limited',attempted:true,checkedAt:batch.checkedAt,sourceUrls:[...new Set(merged.map(p=>p.sourceUrl))],galleryImageCount:merged.length,failure:null};
}
const coverage=JSON.parse(fs.readFileSync('data/gallery-coverage.json','utf8'));
const count=p=>p.imageVerificationStatus==='under_review'?0:(galleries[p.id]?.length||1);
const counts=products.map(count);
Object.assign(coverage,{checkedAt:batch.checkedAt,totalProducts:products.length,requiredImagesPerProduct:5,productsWithMultipleImages:counts.filter(n=>n>1).length,productsWithThreeOrMoreImages:counts.filter(n=>n>=3).length,productsWithFiveOrMoreImages:counts.filter(n=>n>=5).length,productsAwaitingFiveImages:counts.filter(n=>n<5).length,minimumAdditionalImagesRequired:counts.reduce((sum,n)=>sum+Math.max(0,5-n),0),imageCountDistribution:counts.reduce((result,n)=>(result[n]=(result[n]||0)+1,result),{}),reviewedProducts:Object.keys(galleries).length,galleryPhotos:Object.values(galleries).reduce((n,p)=>n+p.length,0),singleImageProducts:counts.filter(n=>n===1).length,productsWithNoVerifiedImage:counts.filter(n=>n===0).length,productsAwaitingMultipleImages:counts.filter(n=>n<2).length,pendingSourceAccess:products.filter(p=>count(p)<5&&['blocked_pending','pending','api_error'].includes(evidence.products[p.id]?.status)).length,complete:counts.every(n=>n>=5),fullImageValidation:'passed'});
const write=(path,data)=>fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
write('data/product-galleries.json',galleries);write('data/gallery-image-validation.json',[...checks.values()]);write('data/gallery-evidence.json',evidence);write('data/gallery-coverage.json',coverage);
console.log(JSON.stringify({addedOrUpgradedProducts:added,additionalGalleryPhotos:photosAdded,unchangedGalleriesPreserved:preserved,existingDuplicatesSkipped,...coverage},null,2));
