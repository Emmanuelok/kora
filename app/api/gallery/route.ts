import {catalogue} from '@/lib/catalogue';
import galleries from '../../../data/product-galleries.json';
type Photo={url:string;thumbnail?:string;caption?:string;sourceUrl?:string;checkedAt?:string};
const products=new Map(catalogue.map(p=>[p.id,p]));
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('product')||'';
 const product=products.get(id);
 if(!product)return Response.json({error:'Product not found'},{status:404});
 const stored=(galleries as Record<string,Photo[]>)[id]||[];
 const images=stored.length?stored:[{url:product.image,caption:product.name,sourceUrl:product.sourceUrl}];
 return Response.json({product:id,images,total:images.length},{headers:{'Cache-Control':'public, max-age=3600'}});
}
