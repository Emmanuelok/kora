import products from '../data/products.json';
export type Product={id:string;name:string;brand:string;department:string;category:string;priceCAD:number;regularPriceCAD:number;image:string;sourceUrl:string;description:string;model?:string;condition?:string};
export const catalogue=products as unknown as Product[];
export const ghPrice=(p:Product)=>Math.round(p.priceCAD*9.5);
export const money=(v:number)=>new Intl.NumberFormat('en-GH',{style:'currency',currency:'GHS',maximumFractionDigits:0}).format(v);
export const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
