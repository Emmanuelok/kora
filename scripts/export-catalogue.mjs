import fs from 'node:fs';
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const cols=['id','department','category','brand','name','model','condition','priceGHS','priceSource','priceCheckedAt','releaseStatus','releaseDate','sourceUrl','imageSource'];
const csv=cols.join(',')+'\n'+products.map(p=>cols.map(k=>'"'+String(p[k]??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
fs.writeFileSync('public/catalogue-inventory.csv','\ufeff'+csv);
console.log('Exported '+products.length+' product records.');
