'use client';
import {useState} from 'react';
import {ArrowUpRight,ArrowRight} from 'lucide-react';
type Highlight={id:string;name:string;image:string;label:string};
const stories=[
 {label:'Listen',eyebrow:'YOUR WORLD. TURNED UP.',title:['Less noise.','More you.'],text:'Find your focus. Feel every beat.',image:'/images/headphones.jpg',alt:'Black over-ear headphones photographed in a dark studio',href:'/shop?department=audio',cta:'Explore audio',theme:'listen'},
 {label:'Create',eyebrow:'MAKE ROOM FOR YOUR NEXT BIG IDEA.',title:['Big ideas.','Start here.'],text:'Discover the tools for whatever comes next.',image:'/images/laptop.jpg',alt:'Laptop on a thoughtfully arranged desk',href:'/shop?department=computers-tablets',cta:'Explore computing',theme:'create'},
 {label:'Unwind',eyebrow:'BRING EVERY MOMENT HOME.',title:['Your space.','Upgraded.'],text:'Big-screen moments. Clever everyday essentials.',image:'/images/living-room.jpg',alt:'Modern living room with a large television',href:'/shop?department=tv-home-theatre',cta:'Explore TV & home',theme:'unwind'},
];
export default function StorefrontHero({highlights}:{highlights:Highlight[]}){
 const [active,setActive]=useState(0);const story=stories[active];
 return <section className="flagship-hero" aria-label="Explore KORA collections"><div className={'flagship-main '+story.theme}>
 <img key={story.image} className="flagship-photo" src={story.image} alt={story.alt} fetchPriority="high"/>
 <div className="flagship-copy" key={story.label}><p className="eyebrow">{story.eyebrow}</p><h1>{story.title[0]}<br/><em>{story.title[1]}</em></h1><p className="flagship-description">{story.text}</p><a className="btn lime" href={story.href}>{story.cta}<ArrowUpRight size={21}/></a><a className="flagship-all" href="/shop">Discover everything <ArrowRight size={17}/></a></div>
 <div className="story-controls" aria-label="Featured collections">{stories.map((s,i)=><button type="button" key={s.label} className={i===active?'active':''} aria-pressed={i===active} onClick={()=>setActive(i)}><span>{String(i+1).padStart(2,'0')}</span>{s.label}<i aria-hidden="true"/></button>)}</div>
 <span className="flagship-edition">KORA / EVERYDAY POSSIBILITIES</span></div>
 <div className="flagship-highlights">{highlights.map((p,i)=><a key={p.id} href={'/product/'+p.id} className={'highlight highlight-'+i}><div><span className="eyebrow">{p.label}</span><h2>{p.name}</h2><span className="highlight-action">Take a closer look <ArrowUpRight size={18}/></span></div><img src={p.image} alt={p.id==='official-nintendo-switch-2'?'Nintendo Switch 2 console, dock and controllers':'Apple iPhone Duo'}/><span className="highlight-number" aria-hidden="true">0{i+1}</span></a>)}</div></section>
}
