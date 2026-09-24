import fs from 'node:fs';
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const galleries=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('data/gallery-evidence.json','utf8')).products;
const families=JSON.parse(fs.readFileSync('data/product-families.json','utf8'));
const configurations=new Map(families.flatMap(family=>family.variants.map(variant=>[variant.productId,Object.entries(variant.options).map(([axis,value])=>`${axis}: ${value}`).join(' | ')])));
// The storefront ships compact counts/alternate views, not the full evidence payload.
const previews=Object.fromEntries(Object.entries(galleries).filter(([,photos])=>photos.length>1).map(([id,photos])=>[id,{count:photos.length,alternate:photos[1].url}]));
fs.writeFileSync('data/gallery-previews.json',JSON.stringify(previews,null,2)+'\n');
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const cols=['id','department','category','brand','name','model','condition','priceGHS','priceSource','priceCheckedAt','releaseStatus','releaseDate','sourceUrl','imageSource','galleryImageCount','galleryImages','galleryCheckedAt'];
const rows=products.map(p=>({...p,galleryImageCount:p.imageVerificationStatus==='under_review'?0:galleries[p.id]?.length||1,galleryImages:p.imageVerificationStatus==='under_review'?'':(galleries[p.id]||[{url:p.image}]).map(x=>x.url).join(' | '),galleryCheckedAt:galleries[p.id]?evidence[p.id]?.checkedAt:undefined}));
fs.writeFileSync('public/catalogue-inventory.csv','\ufeff'+cols.join(',')+'\n'+rows.map(p=>cols.map(k=>quote(p[k])).join(',')).join('\n')+'\n');
const gapCols=['id','name','department','category','model','configuration','galleryImageCount','requiredImageCount','missingImageCount','status','reason','sourceUrl','imageSource','galleryImages','rightsStatus'];
const gaps=rows.filter(p=>p.galleryImageCount<5).map(p=>({...p,configuration:configurations.get(p.id)||'',requiredImageCount:5,missingImageCount:5-p.galleryImageCount,status:evidence[p.id]?.status||'pending',reason:p.imageVerificationNote||evidence[p.id]?.configurationNotes||evidence[p.id]?.recoveryNotes||evidence[p.id]?.failure||`${p.galleryImageCount} suitable source photograph${p.galleryImageCount===1?' has':'s have'} been verified; five distinct exact-product images are required.`,rightsStatus:'Owner permission review required; source identity checks do not grant reuse rights'}));
fs.writeFileSync('public/catalogue-gallery-gaps.csv','\ufeff'+gapCols.join(',')+'\n'+gaps.map(p=>gapCols.map(k=>quote(p[k])).join(',')).join('\n')+'\n');
console.log('Exported '+products.length+' product records and '+gaps.length+' photo-coverage gaps.');
