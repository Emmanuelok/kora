import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
// Load the actual route and its authentication/variant helpers. Only the
// Cloudflare D1 transport is replaced, with SQLite and real atomic batches.
globalThis.__koraStoreTestBindings={};
const rootUrl=pathToFileURL(process.cwd()+'/').href;
registerHooks({
 resolve(specifier,context,nextResolve){
  if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env=globalThis.__koraStoreTestBindings;',shortCircuit:true};
  if(specifier.startsWith('@/'))return{url:new URL(specifier.slice(2)+'.ts',rootUrl).href,shortCircuit:true};
  if(/^\.\.?\//.test(specifier)&&context.parentURL?.startsWith(rootUrl)&&!context.parentURL.includes('/node_modules/')){
   const candidate=new URL(specifier+'.ts',context.parentURL);if(fs.existsSync(candidate))return{url:candidate.href,shortCircuit:true};
  }
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  if(url.startsWith(rootUrl)&&!url.includes('/node_modules/')){
   if(url.endsWith('.json'))return{format:'module',shortCircuit:true,source:'export default '+fs.readFileSync(fileURLToPath(url),'utf8')};
   if(url.endsWith('.ts'))return{format:'module',shortCircuit:true,source:ts.transpileModule(fs.readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};
  }
  return nextLoad(url,context);
 }
});
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for(const migration of ['0000_redundant_wolfsbane.sql','0001_customer_auth.sql'])sqlite.exec(fs.readFileSync('drizzle/'+migration,'utf8'));
let failSqlContaining='';let batchQueue=Promise.resolve();
const DB={
 prepare(sql){let values=[];const execute=()=>{if(failSqlContaining&&sql.includes(failSqlContaining))throw new Error('Simulated D1 failure');return{success:true,results:sqlite.prepare(sql).all(...values),meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}}};return{
  bind(...args){values=args;return this},_execute:execute,
  async run(){if(failSqlContaining&&sql.includes(failSqlContaining))throw new Error('Simulated D1 failure');return{success:true,results:[],meta:sqlite.prepare(sql).run(...values)}},
  async all(){return execute()},
  async raw(){const statement=sqlite.prepare(sql);statement.setReturnArrays(true);return statement.all(...values)},
  async first(column){const row=sqlite.prepare(sql).get(...values);return column?row?.[column]??null:row??null}
 }},
 batch(statements){const result=batchQueue.then(()=>{sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement._execute());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}});batchQueue=result.catch(()=>{});return result}
};
Object.assign(globalThis.__koraStoreTestBindings,{DB});
const priceModule=await import('../lib/catalogue.ts');
const {catalogue,ghPrice,ghanaPesewas}=priceModule;
// Approved selling-price fixtures are test-only; production retail references stay unpriced.
const priceFixtureNow=Date.now();
for(const product of catalogue.filter(product=>product.priceGHS))product.sellingPrice={
 productId:product.id,currency:'GHS',amountMinor:Math.round(product.priceGHS*120),policy:'kora-selling-price-v1',
 identity:priceModule.sellingPriceIdentity(product),
 revision:'a'.repeat(24),verifiedAt:new Date(priceFixtureNow-1000).toISOString(),validUntil:new Date(priceFixtureNow+3600000).toISOString()
};
const {getProductOptionSnapshot,productFamilies}=await import('../lib/product-variants.ts');
const {handleCustomerAuth}=await import('../lib/auth-core.ts');
const {claimGuest}=await import('../lib/store-identity.ts');
const route=await import('../app/api/store/route.ts');
assert.equal(ghPrice({priceCAD:100}),null);assert.equal(ghPrice({priceGHS:100,priceSource:'Test',priceCheckedAt:'2020-01-01'}),null);
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

// Account tests exercise actual Better Auth-signed sessions, not forged user mocks.
Object.assign(globalThis.__koraStoreTestBindings,{
 BETTER_AUTH_SECRET:'store-test-only-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
 BETTER_AUTH_URL:origin,
});
let authIp=1;
async function signIn(email,name){
 const response=await handleCustomerAuth(new Request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':`198.51.100.${authIp++}`},body:JSON.stringify({email,name,password:'store-test-password-2026',callbackURL:'/account'})}),globalThis.__koraStoreTestBindings);
 assert.equal(response.status,200,await response.clone().text());
 assert.equal((await response.clone().json()).user.emailVerified,false);
 const authCookie=response.headers.getSetCookie().find(value=>value.startsWith('__Secure-kora.auth.session_token='))?.split(';')[0];assert(authCookie);
 const id=sqlite.prepare('SELECT id FROM auth_user WHERE email=?').get(email).id;
 return{cookie:authCookie,id,owner:'account:'+id};
}
const alice=await signIn('alice@example.com','Alice');
const bob=await signIn('bob@example.com','Bob');
const asCustomer=(customer,body,headers={})=>req(body,{headers:{Cookie:customer.cookie,...headers}});
const getState=async(customer,headers={})=>{const response=await route.GET(asCustomer(customer,null,headers));assert.equal(response.status,200);return response.json()};
const mutate=async(customer,body,headers={})=>{const response=await route.POST(asCustomer(customer,body,headers));assert.equal(response.status,200,await response.clone().text());return response};
const ownedRows=owner=>Object.fromEntries(['basket','saved','profiles','requests'].map(table=>[table,sqlite.prepare(`SELECT * FROM ${table} WHERE owner=? ORDER BY ${table==='basket'||table==='saved'?'product':table==='requests'?'id':'owner'}`).all(owner)]));
const [firstProduct,secondProduct,thirdProduct]=catalogue;
assert.equal((await getState(alice)).profile.email,'alice@example.com');
assert.equal((await getState(alice)).email,'alice@example.com');
assert.deepEqual((await getState(bob)).profile,{name:'Bob',email:'bob@example.com'});
await mutate(alice,{action:'cart',product:firstProduct.id,quantity:19});
await mutate(alice,{action:'save',product:firstProduct.id,value:true});
await mutate(alice,{action:'profile',profile:{name:'Alice saved profile',city:'Accra'}});
await mutate(alice,{action:'request',kind:'contact',form:{name:'Alice',email:'alice@example.com',message:'Alice account private request'}});
await mutate(bob,{action:'cart',product:thirdProduct.id,quantity:2});
await mutate(bob,{action:'save',product:thirdProduct.id,value:true});
await mutate(bob,{action:'request',kind:'contact',form:{name:'Bob',email:'bob@example.com',message:'Bob account private request'}});
const aliceBefore=ownedRows(alice.owner);const bobBefore=ownedRows(bob.owner);
const bobState=await getState(bob,{'oai-authenticated-user-id':alice.id,'oai-authenticated-user-email':'alice@example.com'});
assert.equal(bobState.email,'bob@example.com');assert.equal(bobState.profile.name,'Bob');
assert.deepEqual(bobState.cart,[{product:thirdProduct.id,quantity:2}]);
assert(bobState.requests.every(request=>request.data.message==='Bob account private request'));
assert.deepEqual(ownedRows(alice.owner),aliceBefore);
const rawSession=sqlite.prepare('SELECT token FROM auth_session WHERE user_id=?').get(alice.id).token;
r=await route.GET(req(null,{headers:{Cookie:'__Secure-kora.auth.session_token='+rawSession,...forgedHeaders}}));assertEmptySession(await r.json());
r=await route.POST(req({action:'claimGuest'},{headers:{Cookie:otherCookie}}));assert.equal(r.status,401);

function seedGuest(id,marker){
 const guest={owner:'guest:'+id,cookie:'kora_session='+id};
 sqlite.prepare('INSERT INTO basket(owner,product,quantity) VALUES(?,?,?)').run(guest.owner,firstProduct.id,4);
 sqlite.prepare('INSERT INTO basket(owner,product,quantity) VALUES(?,?,?)').run(guest.owner,secondProduct.id,3);
 sqlite.prepare('INSERT INTO saved(owner,product) VALUES(?,?)').run(guest.owner,secondProduct.id);
 sqlite.prepare('INSERT INTO profiles(owner,data) VALUES(?,?)').run(guest.owner,JSON.stringify({name:'Guest '+marker,city:'Kumasi'}));
 sqlite.prepare('INSERT INTO requests(id,owner,kind,data,status,created) VALUES(?,?,?,?,?,?)').run('KR-'+marker,guest.owner,'contact',JSON.stringify({name:'Guest '+marker,message:marker}),'Request received',new Date().toISOString());
 return guest;
}
const claimable=seedGuest('11111111-1111-4111-8111-111111111111','MERGE');
const aliceGuest={...alice,cookie:alice.cookie+'; '+claimable.cookie};
const guestBeforeClaim=ownedRows(claimable.owner);
assert.equal((await getState(aliceGuest)).guestPending,true);
assert.deepEqual(ownedRows(claimable.owner),guestBeforeClaim,'GET does not mutate or claim guest records');
assert.deepEqual(ownedRows(alice.owner),aliceBefore);
r=await mutate(aliceGuest,{action:'claimGuest'});
assert.match(r.headers.get('set-cookie'),/^kora_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
const merged=await getState(alice);
assert.equal(merged.guestPending,false);
assert.equal(merged.cart.find(item=>item.product===firstProduct.id).quantity,20);
assert.equal(merged.cart.find(item=>item.product===secondProduct.id).quantity,3);
assert(merged.saved.includes(firstProduct.id)&&merged.saved.includes(secondProduct.id));
assert.equal(merged.profile.name,'Alice saved profile');
assert(merged.requests.some(request=>request.data.message==='MERGE'));
for(const rows of Object.values(ownedRows(claimable.owner)))assert.equal(rows.length,0);
const afterClaim=ownedRows(alice.owner);
await mutate(aliceGuest,{action:'claimGuest'});assert.deepEqual(ownedRows(alice.owner),afterClaim,'Same-account replay cannot add quantities twice');
await mutate({...bob,cookie:bob.cookie+'; '+claimable.cookie},{action:'claimGuest'});
assert.deepEqual(ownedRows(alice.owner),afterClaim);assert.deepEqual(ownedRows(bob.owner),bobBefore,'Another account cannot replay the claim');
assert.equal(sqlite.prepare('SELECT account_owner FROM guest_claims WHERE guest_owner=?').get(claimable.owner).account_owner,alice.owner);
r=await route.GET(req(null,{headers:{Cookie:claimable.cookie}}));assert.equal(r.status,200);assertEmptySession(await r.json());
assert(r.headers.get('set-cookie'));assert(!r.headers.get('set-cookie').includes(claimable.cookie));
r=await route.POST(req({action:'cart',product:firstProduct.id,quantity:1},{headers:{Cookie:claimable.cookie}}));assert.equal(r.status,200);
assert(r.headers.get('set-cookie'));assert.equal(sqlite.prepare('SELECT * FROM basket WHERE owner=?').all(claimable.owner).length,0);
assert.deepEqual(ownedRows(alice.owner),afterClaim,'Retired guest cookies cannot mutate claimed account data');

// Racing different accounts are serialized by D1's atomic batch; one owner wins.
const racing=seedGuest('22222222-2222-4222-8222-222222222222','RACE');
const raceBefore=new Map([[alice.owner,ownedRows(alice.owner)],[bob.owner,ownedRows(bob.owner)]]);
const raceResponses=await Promise.all([
 route.POST(asCustomer(alice,{action:'claimGuest'},{Cookie:alice.cookie+'; '+racing.cookie})),
 route.POST(asCustomer(bob,{action:'claimGuest'},{Cookie:bob.cookie+'; '+racing.cookie}))
]);
for(const response of raceResponses)assert.equal(response.status,200);
const winner=sqlite.prepare('SELECT account_owner FROM guest_claims WHERE guest_owner=?').get(racing.owner).account_owner;
const loser=winner===alice.owner?bob.owner:alice.owner;
assert.equal(sqlite.prepare('SELECT owner FROM requests WHERE id=?').get('KR-RACE').owner,winner);
assert.deepEqual(ownedRows(loser),raceBefore.get(loser));
for(const rows of Object.values(ownedRows(racing.owner)))assert.equal(rows.length,0);
const raceAfter=ownedRows(winner);
await Promise.all([claimGuest(DB,racing.owner,winner),claimGuest(DB,racing.owner,winner)]);
assert.deepEqual(ownedRows(winner),raceAfter,'Concurrent retries remain idempotent');

// A failure partway through the batch rolls back the ownership guard and every move.
const rollbackGuest=seedGuest('33333333-3333-4333-8333-333333333333','ROLLBACK');
const rollbackGuestBefore=ownedRows(rollbackGuest.owner);const rollbackAccountBefore=ownedRows(bob.owner);
failSqlContaining='UPDATE requests SET owner=';
r=await route.POST(asCustomer(bob,{action:'claimGuest'},{Cookie:bob.cookie+'; '+rollbackGuest.cookie}));assert.equal(r.status,503);
failSqlContaining='';
assert.equal(r.headers.get('set-cookie'),null,'A failed merge preserves the guest cookie for retry');
assert.equal(sqlite.prepare('SELECT * FROM guest_claims WHERE guest_owner=?').get(rollbackGuest.owner),undefined);
assert.deepEqual(ownedRows(rollbackGuest.owner),rollbackGuestBefore);assert.deepEqual(ownedRows(bob.owner),rollbackAccountBefore);
await mutate({...bob,cookie:bob.cookie+'; '+rollbackGuest.cookie},{action:'claimGuest'});
assert.equal((await getState(bob)).profile.name,rollbackAccountBefore.profiles.length?JSON.parse(rollbackAccountBefore.profiles[0].data).name:'Guest ROLLBACK','Guest profile is copied only when the account has no saved profile');

// Configuration/database outages must not downgrade an authenticated write into a guest write.
const preservedAccount=ownedRows(alice.owner);const preservedGuest=ownedRows('guest:'+cookie.split('=')[1]);
const configuredSecret=globalThis.__koraStoreTestBindings.BETTER_AUTH_SECRET;
delete globalThis.__koraStoreTestBindings.BETTER_AUTH_SECRET;
for(const body of [null,{action:'cart',product:firstProduct.id,quantity:1},{action:'claimGuest'}]){
 r=body?await route.POST(asCustomer(alice,body,{Cookie:alice.cookie+'; '+cookie})):await route.GET(asCustomer(alice,null,{Cookie:alice.cookie+'; '+cookie}));
 assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null);
}
assert.deepEqual(ownedRows(alice.owner),preservedAccount);assert.deepEqual(ownedRows('guest:'+cookie.split('=')[1]),preservedGuest);
r=await route.GET(req());assert.equal(r.status,200,'Anonymous browsing remains available without auth configuration');
r=await route.GET(req(null,{headers:{Cookie:claimable.cookie}}));assert.equal(r.status,200);assertEmptySession(await r.json());
assert(r.headers.get('set-cookie'));assert(!r.headers.get('set-cookie').includes(claimable.cookie),'Retired guest cookies still rotate when auth credentials are absent');
r=await route.POST(req({action:'cart',product:firstProduct.id,quantity:1},{headers:{Cookie:claimable.cookie}}));assert.equal(r.status,200);
assert(r.headers.get('set-cookie'));assert.equal(sqlite.prepare('SELECT * FROM basket WHERE owner=?').all(claimable.owner).length,0,'An auth outage cannot recreate data under a permanently claimed guest ID');
assert.deepEqual(ownedRows(alice.owner),preservedAccount);
globalThis.__koraStoreTestBindings.BETTER_AUTH_SECRET=configuredSecret;
const workingDB=globalThis.__koraStoreTestBindings.DB;
globalThis.__koraStoreTestBindings.DB={prepare(){throw new Error('Simulated DB outage')},batch(){throw new Error('Simulated DB outage')}};
r=await route.GET(asCustomer(alice));assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null);
globalThis.__koraStoreTestBindings.DB=workingDB;
assert.deepEqual(ownedRows(alice.owner),preservedAccount);

// Store quote snapshots capture the exact listed product configuration and use integer pesewas.
const pricedPhoneFamily=productFamilies.find(family=>family.name==='Samsung Galaxy S26 Ultra');assert(pricedPhoneFamily);
const firstVariant=pricedPhoneFamily.variants.find(variant=>variant.options.Storage==='256GB'&&variant.options.Colour==='Light Violet');
const secondVariant=pricedPhoneFamily.variants.find(variant=>variant.options.Storage==='512GB'&&variant.options.Colour==='Light Violet');
assert(firstVariant&&secondVariant);
const pricedVariants=[firstVariant,secondVariant].map((variant,index)=>({variant,product:catalogue.find(product=>product.id===variant.productId),quantity:index+2}));
for(const item of pricedVariants){assert.equal(item.product.department,'phones');assert(ghPrice(item.product)>0)}
assert.notEqual(ghPrice(pricedVariants[0].product),ghPrice(pricedVariants[1].product),'Storage configurations have distinct evidenced GHS prices');
const variantBuyer=await signIn('variants@example.com','Variant buyer');
for(const item of pricedVariants)await mutate(variantBuyer,{action:'cart',product:item.product.id,quantity:item.quantity});
assert.equal((await getState(variantBuyer)).cart.length,2,'Different storage SKUs remain separate bag lines');
r=await mutate(variantBuyer,{action:'request',kind:'quote',form:{name:'Variant buyer',email:'variants@example.com',indicativeUnitPrice:0,options:{Storage:'attacker-supplied'}}});
const variantQuoteId=(await r.json()).id;
const variantQuote=(await getState(variantBuyer)).requests.find(request=>request.id===variantQuoteId).data;
assert.equal(variantQuote.items.length,2);
for(const item of pricedVariants){
 const variantLine=variantQuote.items.find(line=>line.id===item.product.id);assert(variantLine);
 assert.deepEqual(variantLine.options,getProductOptionSnapshot(item.product.id));
 assert.equal(variantLine.indicativeUnitPrice,ghPrice(item.product));assert.equal(variantLine.quantity,item.quantity);
}
assert.equal(variantQuote.indicativeTotal,pricedVariants.reduce((sum,item)=>sum+item.quantity*ghanaPesewas(ghPrice(item.product)),0)/100);
assert.equal(variantQuote.unpricedQuantity,0);
assert.equal(variantQuote.currency,'GHS');
assert.equal(variantQuote.priceType,'Approved KORA GHS selling prices; unpriced items require quotation');
for(const Origin of ['', 'null']){r=await route.POST(asCustomer(alice,{action:'claimGuest'},{Origin}));assert.equal(r.status,403);}
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
console.log(JSON.stringify({passed:true,checks:['catalogue integrity','stale and missing Ghana prices stay unpriced','mixed quote totals exclude unpriced lines','secure guest identity cookie and no-store responses','cart persistence','invalid quantities and missing products','wishlist persistence','profile persistence','quote receipt and recalculated total','no-payment status','cross-session isolation across all four entities','forged identity headers cannot read or mutate legacy user data','forged identity headers preserve guest ownership and never authenticate email','new sessions remain distinct with identical forged headers','invalid cookies rotate and valid cookies survive ordinary separators','cross-origin rejection','invalid email rejection','quote history ignores stale service labels while service requests retain theirs','actual signed accounts remain isolated despite forged identity headers','guest claim requires authentication and GET never performs the merge','atomic guest merge preserves requests, combines bags with quantity cap and preserves an existing profile','same-account and cross-account claim replays cannot duplicate or steal records','retired guest cookies rotate and cannot read or mutate account data','concurrent different-account claims have exactly one owner; retries are idempotent','failed D1 merge rolls back the claim guard and every record then permits retry','auth configuration and database outages fail closed while anonymous browsing remains available','quotes snapshot exact server-selected variants and calculate GHS totals in integer pesewas','missing and null origins cannot mutate account state'],products:catalogue.length,departments:new Set(catalogue.map(p=>p.department)).size,categories:new Set(catalogue.map(p=>p.department+'|'+p.category)).size,transport:'Actual Better Auth session verification, actual store route/helpers, SQLite with serialized transactional D1 batches'},null,2));
sqlite.close();delete globalThis.__koraStoreTestBindings;
