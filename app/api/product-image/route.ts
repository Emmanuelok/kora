import images from '../../../data/product-image-bytes.json';
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id')||'';
 const data=(images as Record<string,string>)[id];
 if(!data||!Object.hasOwn(images,id))return new Response('Image not found',{status:404});
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 return new Response(bytes,{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
}
