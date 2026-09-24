import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const catalogue=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('drizzle/0000_redundant_wolfsbane.sql','utf8'));
const DB={prepare(sql){let values=[];return {bind(...args){values=args;return this},async run(){return sqlite.prepare(sql).run(...values)},async all(){return {results:sqlite.prepare(sql).all(...values)}}}},async batch(statements){return Promise.all(statements.map(s=>s.all()))}};
let src=fs.readFileSync('app/api/store/route.ts','utf8').replace("import { env } from 'cloudflare:workers';",'const env=globalThis.__koraTest.env;').replace("import { catalogue, ghPrice } from '@/lib/catalogue';",'const catalogue=globalThis.__koraTest.catalogue; const ghPrice=globalThis.__koraTest.ghPrice;');
const priceSource=fs.readFileSync('lib/catalogue.ts','utf8').replace("import products from '../data/products.json';",'const products=[];');
const priceModule=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(priceSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const {ghPrice}=priceModule;assert.equal(ghPrice({priceCAD:100}),null);assert.equal(ghPrice({priceGHS:100,priceSource:'Test',priceCheckedAt:'2020-01-01'}),null);
globalThis.__koraTest={env:{DB},catalogue,ghPrice};
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const route=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const origin='https://kora.example';let cookie='';
const req=(body,options={})=>new Request(origin+'/api/store',{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,...options.headers},...(body?{body:JSON.stringify(body)}:{})});
let r=await route.GET(req());assert.equal(r.status,200);
const sessionCookie=r.headers.get('set-cookie');
assert.match(sessionCookie,/^kora_session=[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12};/);
for(const attribute of ['Path=/','HttpOnly','SameSite=Lax','Max-Age=2592000','Secure'])assert(sessionCookie.split('; ').includes(attribute));
assert(!sessionCookie.includes('Domain='));assert.equal(r.headers.get('cache-control'),'no-store');
cookie=sessionCookie.split(';')[0];
r=await route.POST(req({action:'cart',product:catalogue[0].id,quantity:2}));assert.equal(r.status,200);
r=await route.POST(req({action:'cart',product:catalogue[0].id,quantity:-1}));assert.equal(r.status,400);
r=await route.POST(req({action:'cart',product:'unknown',quantity:1}));assert.equal(r.status,400);
r=await route.POST(req({action:'save',product:catalogue[0].id,value:true}));assert.equal(r.status,200);
r=await route.POST(req({action:'profile',profile:{name:'Preview QA',city:'Kumasi'}}));assert.equal(r.status,200);
r=await route.POST(req({action:'request',kind:'quote',form:{name:'Preview QA',email:'qa@example.invalid',city:'Kumasi',address:'Test address',paymentPreference:'MTN MoMo'}}));assert.equal(r.status,200);const receipt=await r.json();assert.match(receipt.id,/^KR-/);
r=await route.GET(req());const saved=await r.json();assert.equal(saved.cart[0].quantity,2);assert.equal(saved.saved[0],catalogue[0].id);assert.equal(saved.profile.city,'Kumasi');assert.equal(saved.requests[0].data.paymentStatus,'No payment collected');assert.equal(saved.requests[0].data.indicativeTotal,ghPrice(catalogue[0])*2);
const unpriced=catalogue.find(p=>ghPrice(p)===null);r=await route.POST(req({action:'cart',product:unpriced.id,quantity:3}));assert.equal(r.status,200);
r=await route.POST(req({action:'request',kind:'quote',form:{name:'Mixed basket',email:'qa@example.invalid'}}));assert.equal(r.status,200);const mixedId=(await r.json()).id;const mixed=(await (await route.GET(req())).json()).requests.find(x=>x.id===mixedId);assert.equal(mixed.data.unpricedQuantity,3);assert.equal(mixed.data.indicativeTotal,ghPrice(catalogue[0])*2);assert.equal(mixed.data.items.find(x=>x.id===unpriced.id).indicativeUnitPrice,null);
const assertEmptySession=data=>{assert.deepEqual(data.cart,[]);assert.deepEqual(data.saved,[]);assert.deepEqual(data.profile,{});assert.deepEqual(data.requests,[]);assert.equal(data.email,null)};
const otherCookie='kora_session=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
r=await route.GET(req(null,{headers:{Cookie:otherCookie}}));assertEmptySession(await r.json());

// A standalone Worker must ignore caller-supplied Sites identity headers on reads and writes.
const forgedHeaders={'oai-authenticated-user-id':'legacy-user','oai-authenticated-user-email':'forged@example.invalid'};
const legacyOwner='user:legacy-user';
sqlite.prepare('INSERT INTO basket(owner,product,quantity) VALUES(?,?,?)').run(legacyOwner,catalogue[0].id,19);
sqlite.prepare('INSERT INTO saved(owner,product) VALUES(?,?)').run(legacyOwner,catalogue[0].id);
sqlite.prepare('INSERT INTO profiles(owner,data) VALUES(?,?)').run(legacyOwner,JSON.stringify({name:'Legacy user',email:'legacy@example.invalid'}));
sqlite.prepare('INSERT INTO requests(id,owner,kind,data,status,created) VALUES(?,?,?,?,?,?)').run('KR-LEGACY',legacyOwner,'contact',JSON.stringify({name:'Legacy user',message:'Private legacy request'}),'Request received','2026-01-01T00:00:00.000Z');
const legacySnapshot=()=>['basket','saved','profiles','requests'].map(table=>sqlite.prepare(`SELECT * FROM ${table} WHERE owner=?`).all(legacyOwner));
const legacyBefore=legacySnapshot();
const guestBefore=await (await route.GET(req())).json();
r=await route.GET(req(null,{headers:forgedHeaders}));
assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),guestBefore);
for(const body of [
 {action:'cart',product:catalogue[0].id,quantity:4},
 {action:'save',product:catalogue[0].id,value:false},
 {action:'profile',profile:{name:'Guest after forged headers',city:'Tamale'}},
 {action:'request',kind:'contact',form:{name:'Guest after forged headers',email:'guest@example.invalid',message:'Guest-owned request'}}
]){r=await route.POST(req(body,{headers:forgedHeaders}));assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null)}
const guestAfter=await (await route.GET(req())).json();
assert.equal(guestAfter.cart.find(x=>x.product===catalogue[0].id).quantity,4);
assert(!guestAfter.saved.includes(catalogue[0].id));assert.equal(guestAfter.profile.city,'Tamale');
assert.equal(guestAfter.requests.length,guestBefore.requests.length+1);assert(guestAfter.requests.some(x=>x.data.message==='Guest-owned request'));assert.equal(guestAfter.email,null);
assert.deepEqual(legacySnapshot(),legacyBefore);
r=await route.GET(req(null,{headers:{...forgedHeaders,Cookie:otherCookie}}));assertEmptySession(await r.json());
r=await route.POST(req({action:'profile',profile:{name:'Other guest'}},{headers:{...forgedHeaders,Cookie:otherCookie}}));assert.equal(r.status,200);
assert.equal((await (await route.GET(req())).json()).profile.name,'Guest after forged headers');
assert.deepEqual(legacySnapshot(),legacyBefore);

const freshCookies=[];
for(let i=0;i<2;i++){
 r=await route.GET(req(null,{headers:{...forgedHeaders,Cookie:''}}));assertEmptySession(await r.json());
 freshCookies.push(r.headers.get('set-cookie').split(';')[0]);
}
assert.notEqual(freshCookies[0],freshCookies[1]);assert(!freshCookies.includes(cookie));
for(const malformed of ['not-a-uuid','a'.repeat(36),'00000000-0000-0000-0000-000000000000']){
 r=await route.GET(req(null,{headers:{Cookie:'kora_session='+malformed}}));assertEmptySession(await r.json());
 assert(r.headers.get('set-cookie'));assert(!r.headers.get('set-cookie').includes(malformed));
}
for(const separator of [';','; ',';\t']){
 r=await route.GET(req(null,{headers:{Cookie:'another=value'+separator+cookie+'; end=value'}}));
 assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(await r.json(),guestAfter);
}
r=await route.POST(req({action:'save',product:catalogue[0].id,value:true},{headers:{Origin:'https://outside.example'}}));assert.equal(r.status,403);
r=await route.POST(req({action:'request',kind:'service',form:{name:'Preview QA',email:'bad-address'}}));assert.equal(r.status,400);
// Render the real history component: older quotes may contain an unrelated service value.
const storeSource=ts.createSourceFile('app/store.tsx',fs.readFileSync('app/store.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const historyFunction=storeSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='RequestList');
assert(historyFunction,'RequestList must remain available for the history regression');
const historyJs=ts.transpileModule(historyFunction.getText(storeSource),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const StoreContext=React.createContext(null);
const RequestList=new Function('React','useContext','useState','StoreContext','money','ChevronDown','Empty',historyJs+';return RequestList;')(React,React.useContext,React.useState,StoreContext,priceModule.money,()=>null,()=>null);
const historyRecord={id:'KR-HISTORY',created:'2026-01-01T00:00:00.000Z',status:'Request received',data:{name:'History QA',city:'Accra',service:'Device setup & data transfer'}};
const renderHistory=kind=>renderToStaticMarkup(React.createElement(StoreContext.Provider,{value:{state:{requests:[{...historyRecord,kind}]},loaded:true}},React.createElement(RequestList)));
const legacyQuoteMarkup=renderHistory('quote');
assert.match(legacyQuoteMarkup,/<strong>Product quotation<\/strong>/);
assert(!legacyQuoteMarkup.includes('Device setup'));
assert.match(renderHistory('service'),/<strong>Device setup &amp; data transfer<\/strong>/);
const ids=new Set(catalogue.map(p=>p.id));assert.equal(ids.size,catalogue.length);assert(catalogue.length>=1000);for(const p of catalogue){assert(p.name&&p.image&&p.sourceUrl&&p.department&&p.category);assert(Number.isFinite(p.priceCAD)&&p.priceCAD>=0)}
console.log(JSON.stringify({passed:true,checks:['catalogue integrity','stale and missing Ghana prices stay unpriced','mixed quote totals exclude unpriced lines','secure guest identity cookie and no-store responses','cart persistence','invalid quantities and missing products','wishlist persistence','profile persistence','quote receipt and recalculated total','no-payment status','cross-session isolation across all four entities','forged identity headers cannot read or mutate legacy user data','forged identity headers preserve guest ownership and never authenticate email','new sessions remain distinct with identical forged headers','invalid cookies rotate and valid cookies survive ordinary separators','cross-origin rejection','invalid email rejection','quote history ignores stale service labels while service requests retain theirs'],products:catalogue.length,departments:new Set(catalogue.map(p=>p.department)).size,categories:new Set(catalogue.map(p=>p.department+'|'+p.category)).size},null,2));
sqlite.close();delete globalThis.__koraTest;
