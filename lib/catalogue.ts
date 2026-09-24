import products from '../data/products.json';
export type Product={id:string;name:string;brand:string;department:string;category:string;priceCAD:number;regularPriceCAD:number;image:string;sourceUrl:string;description:string;model?:string;condition?:string;priceGHS?:number;priceSource?:string;priceCheckedAt?:string;releaseStatus?:string;releaseDate?:string;announcementDate?:string;manufacturerVerified?:boolean;imageSource?:string;priceOriginal?:{amount:number|null;currency:string;market:string};sourcePriceCheckedAt?:string};
export const catalogue=products as unknown as Product[];
// A local retail reference is never synthesized from foreign currency. Expire stale quotes.
export const ghPrice=(p?:Product):number|null=>p&&Number.isFinite(p.priceGHS)&&p.priceGHS!>0&&p.priceSource&&p.priceCheckedAt&&Date.now()-Date.parse(p.priceCheckedAt)<14*86400000?p.priceGHS!:null;
export const money=(v:number|null|undefined)=>v==null?'Price on request':new Intl.NumberFormat('en-GH',{style:'currency',currency:'GHS',maximumFractionDigits:0}).format(v);
export const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
