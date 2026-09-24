import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createElement as h} from 'react';
import {ImageResponse} from 'next/og.js';

// Artwork is generated locally, not at request time. Fonts and photography are
// bundled with the catalogue, so reproduction never depends on a remote service.
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const save = (path, value) => writeFile(new URL(path, root), value);
await Promise.all(['public/icons/', 'public/social/'].map(path => mkdir(new URL(path, root), {recursive: true})));
const fonts = await Promise.all([400, 600, 700, 800].map(async weight => ({
  name: 'Manrope', weight, style: 'normal',
  data: await read(`public/fonts/manrope-${({400: 0, 600: 2, 700: 3, 800: 4})[weight]}.ttf`),
})));
const data = (value, mime = 'image/svg+xml') => `data:${mime};base64,${Buffer.from(value).toString('base64')}`;
const star = (fill = '#d9f96d') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g transform="translate(120 120)" fill="${fill}">${[0, 45, 90, 135].map(angle => `<rect x="-14" y="-108" width="28" height="216" rx="13" transform="rotate(${angle})"/>`).join('')}</g></svg>`;
const monogram = '<path d="M151 125h58v112l87-76h80L252 270l125 118h-82l-86-85v85h-58z" fill="#ddf9a1"/>';
const sparkle = `<g transform="translate(349 117)" fill="#f5f1fa">${[0,45,90,135].map(a=>`<rect x="-5" y="-35" width="10" height="70" rx="5" transform="rotate(${a})"/>`).join('')}</g>`;
function icon(maskable = false) {
  const radius = maskable ? 0 : 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="plum" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#493354"/><stop offset=".55" stop-color="#23192b"/><stop offset="1" stop-color="#17111f"/></linearGradient><clipPath id="edge"><rect width="512" height="512" rx="${radius}"/></clipPath></defs><g clip-path="url(#edge)"><rect width="512" height="512" fill="url(#plum)"/><circle cx="80" cy="68" r="240" fill="none" stroke="#dac3e4" stroke-opacity=".1" stroke-width="1.5"/><circle cx="80" cy="68" r="184" fill="none" stroke="#dac3e4" stroke-opacity=".07" stroke-width="1.5"/>${monogram}${sparkle}<rect x="1.5" y="1.5" width="509" height="509" rx="${Math.max(0,radius-1)}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="3"/></g></svg>`;
}
const standardIcon = icon();
await save('public/icons/kora-mark.svg', standardIcon);
await save('public/favicon.svg', standardIcon);
await save('public/icons/pinned-tab.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${monogram.replace('#ddf9a1', '#000')}${sparkle.replace('#f5f1fa', '#000')}</svg>`);
const box = (style, ...children) => h('div', {style: {display: 'flex', ...style}}, ...children);
const img = (src, width, height, style = {}) => h('img', {src, width, height, style});
async function png(path, element, width, height) {
  const response = new ImageResponse(element, {width, height, fonts});
  const bytes = Buffer.from(await response.arrayBuffer());
  await save(path, bytes);
  console.log(`${path}: ${width}×${height}, ${(bytes.length / 1024).toFixed(0)} KiB`);
}
for (const [name, size, mask] of [['kora-192.png',192,false],['kora-512.png',512,false],['kora-maskable-512.png',512,true],['apple-touch-icon.png',180,true],['favicon-32.png',32,false],['favicon-16.png',16,false]]) {
  await png(`public/icons/${name}`, img(data(icon(mask)), size, size), size, size);
}
const headphones = data(await read('public/images/headphones.jpg'), 'image/jpeg');
const laptop = data(await read('public/images/laptop.jpg'), 'image/jpeg');
const brandStar = data(star());
const arrow = data('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M9 30 30 9M10 9h20v20" fill="none" stroke="#23192b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
const wordmark = (color = '#f7f4f9', size = 78) => box({alignItems:'center', gap:8}, box({color,fontSize:size,fontWeight:800,letterSpacing:-6,lineHeight:1},'kora'), img(brandStar, 51, 51, {marginTop:9}));
const frame = (children) => box({position:'relative',width:'100%',height:'100%',overflow:'hidden',background:'#23192b',fontFamily:'Manrope',color:'#f7f4f9'}, ...children);

await png('public/social/kora-og.png', frame([
  box({position:'absolute',left:710,top:-150,width:730,height:900,borderRadius:370,background:'linear-gradient(145deg, #443052, #1a1422)',transform:'rotate(15deg)'}),
  box({position:'absolute',left:35,top:29,right:35,bottom:29,border:'1px solid #ffffff18',borderRadius:25}),
  box({position:'absolute',left:62,top:54},wordmark()),
  box({position:'absolute',right:62,top:64,fontSize:16,letterSpacing:3,color:'#d7c8e2'},'GHANA · EVERYDAY POSSIBILITIES'),
  box({position:'absolute',left:64,top:189,fontSize:15,fontWeight:700,letterSpacing:3.4,color:'#d9f96d'},'A LITTLE UPGRADE. A WORLD OF POSSIBILITY.'),
  box({position:'absolute',left:60,top:236,fontSize:79,fontWeight:700,letterSpacing:-4.8,lineHeight:1.03,flexDirection:'column'},box({},'Find your'),box({color:'#ddf9a1'},'next favourite.')),
  box({position:'absolute',left:64,top:430,fontSize:24,color:'#d1c4db',letterSpacing:-.5},'Technology, home & everything in between.'),
  box({position:'absolute',left:64,bottom:62,alignItems:'center',gap:19},box({background:'#d9f96d',borderRadius:50,padding:'13px 23px',alignItems:'center',gap:18,color:'#23192b',fontSize:20,fontWeight:800},'Explore Kora',img(arrow,25,25)),box({fontSize:18,color:'#c1b1cb'},'Discover. Compare. Request a quote.')),
  img(brandStar, 380, 380, {position:'absolute',left:877,top:296,transform:'rotate(11deg)',opacity:.95}),
  box({position:'absolute',left:757,top:145,width:320,height:364,borderRadius:28,overflow:'hidden',background:'#101010',border:'1px solid #675172',transform:'rotate(-8deg)',boxShadow:'0 20px 50px #08060c88'},img(headphones,320,400,{objectFit:'cover',position:'absolute',top:-12}),box({position:'absolute',left:22,top:20,fontSize:12,fontWeight:700,letterSpacing:2.2,color:'#ebe7ef'},'YOUR WORLD. TURNED UP.'),box({position:'absolute',bottom:22,left:22,fontSize:28,fontWeight:700,letterSpacing:-1},'Listen closer.')),
  box({position:'absolute',left:970,top:363,width:186,height:188,borderRadius:24,overflow:'hidden',background:'#e9e4ec',transform:'rotate(9deg)',boxShadow:'0 15px 40px #08060c66',border:'6px solid #eee8f2'},img(laptop,190,192,{objectFit:'cover'})),
]),1200,630);

await png('public/social/kora-install.png', frame([
  box({position:'absolute',left:650,top:-170,width:840,height:920,borderRadius:430,background:'linear-gradient(145deg, #443052, #19111f)'}),
  box({position:'absolute',left:35,top:29,right:35,bottom:29,border:'1px solid #ffffff18',borderRadius:25}),
  box({position:'absolute',left:62,top:54},wordmark()),
  box({position:'absolute',left:64,top:189,fontSize:15,fontWeight:700,letterSpacing:3.4,color:'#d9f96d'},'YOUR NEXT FAVOURITE, ALWAYS CLOSE.'),
  box({position:'absolute',left:60,top:237,fontSize:82,fontWeight:700,letterSpacing:-4.5,lineHeight:1.03,flexDirection:'column'},box({},'A little icon.'),box({color:'#ddf9a1'},'A whole world.')),
  box({position:'absolute',left:64,top:437,fontSize:25,color:'#d1c4db'},'Add Kora to your home screen.'),
  box({position:'absolute',left:64,bottom:66,alignItems:'center',gap:18},box({background:'#d9f96d',borderRadius:50,padding:'13px 24px',color:'#23192b',fontSize:20,fontWeight:800},'Get the Kora app'),box({fontSize:18,color:'#c1b1cb'},'Made for your everyday.')),
  img(brandStar,375,375,{position:'absolute',left:847,top:130,opacity:.95,transform:'rotate(8deg)'}),
  box({position:'absolute',left:768,top:145,padding:18,borderRadius:77,background:'#eee7f3',transform:'rotate(-10deg)',boxShadow:'0 30px 70px #07050a88'},img(data(standardIcon),266,266)),
  box({position:'absolute',left:794,top:480,fontSize:29,fontWeight:700,letterSpacing:-1},'Kora Ghana'),
  box({position:'absolute',left:798,top:524,fontSize:16,color:'#c1b1cb',letterSpacing:1},'DISCOVER · SAVE · EXPLORE'),
]),1200,630);

await png('public/social/kora-square.png', frame([
  box({position:'absolute',left:340,top:180,width:900,height:950,borderRadius:490,background:'linear-gradient(145deg, #463151, #19111f)'}),
  box({position:'absolute',left:58,top:50},wordmark('#f7f4f9',91)),
  box({position:'absolute',right:58,top:80,fontSize:18,letterSpacing:4,color:'#d1c4db'},'GHANA'),
  box({position:'absolute',left:55,top:213,fontSize:96,fontWeight:700,letterSpacing:-6,lineHeight:1.04,flexDirection:'column'},box({},'Find your'),box({color:'#ddf9a1'},'next favourite.')),
  box({position:'absolute',left:60,top:447,fontSize:25,color:'#d1c4db'},'Technology, home & everyday possibility.'),
  img(brandStar,500,500,{position:'absolute',left:572,top:552,transform:'rotate(8deg)'}),
  box({position:'absolute',left:194,top:572,width:390,height:450,borderRadius:30,overflow:'hidden',background:'#101010',border:'1px solid #6e5579',transform:'rotate(-8deg)',boxShadow:'0 20px 60px #08050b88'},img(headphones,390,470,{objectFit:'cover'})),
  box({position:'absolute',left:627,top:720,transform:'rotate(10deg)'},img(data(standardIcon),243,243)),
]),1080,1080);
