'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Expand,ZoomIn,ZoomOut,ImageOff,RotateCcw} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';

type Photo={url:string;thumbnail?:string;caption?:string;sourceUrl?:string};
type Props={productId:string;name:string;cover:string;compact?:boolean;withheld?:boolean};
export default function ProductGallery({productId,name,cover,compact=false,withheld=false}:Props){
 const [photos,setPhotos]=useState<Photo[]>(withheld?[]:[{url:cover}]);
 const [active,setActive]=useState(0),[expanded,setExpanded]=useState(false),[zoom,setZoom]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(false),[failed,setFailed]=useState<string[]>([]),[attempt,setAttempt]=useState(0);
 const start=useRef<{x:number;y:number}|null>(null);
 useEffect(()=>{const controller=new AbortController();setPhotos(withheld?[]:[{url:cover}]);setActive(0);setFailed([]);setLoading(true);setError(false);if(withheld){setLoading(false);return()=>controller.abort()}fetch('/api/gallery?product='+encodeURIComponent(productId),{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Gallery unavailable');return r.json() as Promise<{images:Photo[]}>}).then(data=>{if(Array.isArray(data.images))setPhotos(data.images);setLoading(false)}).catch(e=>{if(e.name!=='AbortError'){setError(true);setLoading(false)}});return()=>controller.abort()},[productId,cover,attempt,withheld]);
 const visible=photos.filter(p=>!failed.includes(p.url));
 const index=Math.min(active,Math.max(0,visible.length-1));
 const current=visible[index];
 function select(i:number){setActive((i+visible.length)%Math.max(1,visible.length));setZoom(false)}
 function swipeEnd(e:React.TouchEvent){if(!start.current||zoom)return;const dx=e.changedTouches[0].clientX-start.current.x,dy=e.changedTouches[0].clientY-start.current.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))select(index+(dx<0?1:-1));start.current=null}
 function keyboard(e:React.KeyboardEvent){if(e.key==='ArrowRight'){e.preventDefault();select(index+1)}if(e.key==='ArrowLeft'){e.preventDefault();select(index-1)}if(e.key==='Home'){e.preventDefault();select(0)}if(e.key==='End'){e.preventDefault();select(visible.length-1)}}
 function imageFailure(url:string){setFailed(old=>old.includes(url)?old:[...old,url])}
 const nav=(fullscreen=false)=><>{visible.length>1&&<><button type="button" className="gallery-arrow previous" aria-label={fullscreen?'Previous enlarged image':'Previous product image'} onClick={()=>select(index-1)}><ChevronLeft size={22}/></button><button type="button" className="gallery-arrow next" aria-label={fullscreen?'Next enlarged image':'Next product image'} onClick={()=>select(index+1)}><ChevronRight size={22}/></button></>}</>;
 const thumbnails=(fullscreen=false)=><div className="gallery-thumbnails" aria-label={fullscreen?'Enlarged image thumbnails':'Product image thumbnails'}>{visible.map((p,i)=><button type="button" key={p.url} onClick={()=>select(i)} className={i===index?'is-active':''} aria-pressed={i===index} aria-label={`Show ${fullscreen?'enlarged ':''}image ${i+1} of ${visible.length}`}><img src={p.thumbnail||p.url} alt={p.caption||`${name}, view ${i+1}`} loading="lazy" onError={e=>{if(p.thumbnail&&e.currentTarget.getAttribute('src')!==p.url)e.currentTarget.src=p.url}}/></button>)}</div>;
 return <section className={'product-gallery '+(compact?'gallery-compact':'')} aria-label={'Photo gallery for '+name}>
  <div className="gallery-stage" onTouchStart={e=>{start.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchEnd={swipeEnd} onKeyDown={keyboard}>
   {current?<button type="button" className="gallery-image-button" aria-label={'Enlarge image '+(index+1)+' of '+name} onClick={()=>setExpanded(true)}><img key={current.url} src={current.url} alt={current.caption||`${name}, view ${index+1}`} onError={()=>imageFailure(current.url)}/></button>:<div className="gallery-unavailable"><ImageOff size={36}/><p>{withheld?'Exact product photos are under review.':'Photos are temporarily unavailable.'}</p>{!withheld&&<button type="button" onClick={()=>{setFailed([]);setAttempt(a=>a+1)}}><RotateCcw size={16}/> Retry photos</button>}</div>}
   {nav()}{current&&<button type="button" className="gallery-expand" aria-label="Open full-screen gallery" onClick={()=>setExpanded(true)}><Expand size={18}/><span>Enlarge</span></button>}
   <span className="gallery-count" role="status" aria-live="polite">{loading?'Loading gallery…':`${current?index+1:0} / ${visible.length}`}</span>
  </div>
  {thumbnails()}
  {error&&<button type="button" className="gallery-retry" onClick={()=>setAttempt(a=>a+1)}><RotateCcw size={15}/> Load additional photos</button>}
  {!loading&&!error&&visible.length===1&&<p className="gallery-source-note">Only one product photo is currently available.</p>}
  <Dialog open={expanded} onOpenChange={v=>{setExpanded(v);setZoom(false)}}><DialogContent className="gallery-lightbox" onKeyDown={keyboard}><DialogTitle>{name}</DialogTitle><DialogDescription>Use the arrows or swipe to explore. Select the image to zoom.</DialogDescription><div className={'gallery-lightbox-stage '+(zoom?'is-zoomed':'')} onTouchStart={e=>{start.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchEnd={swipeEnd}>{current&&<button type="button" className="gallery-zoom-image" aria-label={zoom?'Zoom out':'Zoom in'} onClick={()=>setZoom(!zoom)}><img src={current.url} alt={current.caption||`${name}, view ${index+1}`} onError={()=>imageFailure(current.url)}/></button>}{!zoom&&nav(true)}<button type="button" className="gallery-zoom-toggle" aria-label={zoom?'Reset image zoom':'Magnify image'} onClick={()=>setZoom(!zoom)}>{zoom?<ZoomOut size={20}/>:<ZoomIn size={20}/>}</button></div><div className="gallery-lightbox-bottom"><span aria-live="polite">Image {current?index+1:0} of {visible.length}</span><span>{current?.caption||'Product reference photograph'}</span></div>{thumbnails(true)}</DialogContent></Dialog>
 </section>
}
