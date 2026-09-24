# Candidate collector only. Requires Python aiohttp and Pillow. Stops on denial or rate limit.
# Writes work/gallery-research; NEVER imports or publishes automatically.
import asyncio, aiohttp, json, re, time, random, hashlib, io, os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from datetime import datetime, timezone
from collections import Counter
from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'work/gallery-research'
ROOT.mkdir(parents=True,exist_ok=True)
CACHE = ROOT / 'bb-api-cache'
CACHE.mkdir(exist_ok=True)
OUTPUT = ROOT / 'bb-galleries.json'
JOURNAL = ROOT / 'bb-galleries.jsonl'
PRODUCTS = [p for p in json.loads((PROJECT / 'data/products.json').read_text()) if p['id'].startswith('bbca-')]
RESULTS = json.loads((PROJECT / 'data/gallery-source-checkpoint.json').read_text())
STOP_EVENT = None
REQUEST_INTERVAL = float(os.environ.get('BB_INTERVAL_SECONDS','2'))
if JOURNAL.exists():
    for line in JOURNAL.read_text().splitlines():
        try:
            row=json.loads(line)
            if row.get('status')=='api_error' and 'HTTP 403' in row.get('error',''):
                row['status']='blocked_pending'
            RESULTS[row['id']]=row
        except Exception:
            pass

def canonical(url):
    p = urlsplit(url)
    path = re.sub(r'/\d+x\d+/', '/SIZE/', p.path)
    return urlunsplit((p.scheme.lower(),p.netloc.lower(),path,'',''))

def save():
    rows={}
    for p in PRODUCTS:
        sku=p['id'][5:]
        row=RESULTS.get(p['id'])
        if row is None:
            row={'id':p['id'],'sku':sku,'sourceUrl':p['sourceUrl'],'apiUrl':f'https://www.bestbuy.ca/api/v2/json/product/{sku}','images':[],'gallery':[],'validatedCount':0,'status':'blocked_pending','attempted':False,'error':'Not requested after Best Buy edge denied further access.'}
        else:
            row={**row,'attempted':True}
        rows[p['id']]=row
    gaps = [{'id': r['id'], 'sku':r['sku'], 'imageCount':len(r.get('images',[])), 'validatedCount': r.get('validatedCount',0), 'status':r['status'], 'attempted':r['attempted'],'error':r.get('error')} for r in rows.values() if r['status']!='ok']
    summary = {'catalogueCount':len(PRODUCTS),'completed':sum(r['status'] in ('ok','source_limited','validation_gap') for r in rows.values()),'attemptedCount':len(RESULTS),'pending':sum(r['status'] in ('blocked_pending','api_error') for r in rows.values()),'statusCounts':dict(Counter(r['status'] for r in rows.values())),'atLeast3Images':sum(len(r.get('images',[]))>=3 for r in rows.values()),'atLeast2Validated':sum(r.get('validatedCount',0)>=2 for r in rows.values()),'totalImages':sum(len(r.get('images',[])) for r in rows.values())}
    data = {'source':'Best Buy Canada exact-SKU product API','fetchedAt':datetime.now(timezone.utc).isoformat(),'method':'GET https://www.bestbuy.ca/api/v2/json/product/{sku}; additionalMedia entries with mimeType Image only; preserve exact source URLs; canonicalize image identity by stripping size and query; cap six; download source-provided thumbnails until two distinct images are decoded and hash-verified. No invented image filenames.','summary':summary,'products':rows,'gaps':gaps}
    tmp = OUTPUT.with_suffix('.json.tmp'); tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2));tmp.replace(OUTPUT)
    return summary

async def fetch(session,url,attempts=3):
    last = None
    for attempt in range(attempts):
        try:
            if STOP_EVENT is not None and STOP_EVENT.is_set():
                raise RuntimeError('Paused after Best Buy HTTP 403; pending future permitted retry.')
            await asyncio.sleep(REQUEST_INTERVAL)
            async with session.get(url) as response:
                body=await response.read()
                if response.status==200:
                    return body, response.headers.get('Content-Type','')
                last=RuntimeError(f'HTTP {response.status}: {url}')
                if response.status in (403,429) and STOP_EVENT is not None:
                    STOP_EVENT.set()
                if response.status not in (408,425,429,500,502,503,504):
                    break
        except Exception as e:
            last=e
        if attempt+1<attempts:
            await asyncio.sleep(0.8*(2**attempt)+random.random()/2)
    raise last

async def collect(session,product):
    sku=product['id'][5:];api=f'https://www.bestbuy.ca/api/v2/json/product/{sku}'
    row={'id':product['id'],'sku':sku,'sourceUrl':product['sourceUrl'],'apiUrl':api,'images':[],'gallery':[],'validatedCount':0,'status':'api_error'}
    try:
        cached=CACHE/(sku+'.json')
        if cached.exists():
            data=json.loads(cached.read_text())
        else:
            raw,_=await fetch(session,api)
            data=json.loads(raw)
            cached.write_text(json.dumps(data,ensure_ascii=False))
        if str(data.get('sku')) != sku:
            raise ValueError('SKU mismatch: '+str(data.get('sku')))
        row['modelNumber']=data.get('modelNumber')
        row['sourceName']=data.get('name')
        media=[];seen=set()
        for entry in data.get('additionalMedia',[]):
            if str(entry.get('mimeType','')).lower()!='image' or not entry.get('url'):
                continue
            key=canonical(entry['url'])
            if key in seen:
                continue
            seen.add(key)
            media.append({'url':entry['url'],'thumbnailUrl':entry.get('thumbnailUrl'),'canonicalId':key})
        row['sourceImageCount']=len(media)
        selected=media[:6]
        # Validate selected candidates; publication still requires model/configuration
        # and visual review plus full-size URL validation.
        hashes=set(); validation=[]; valid_media=[]
        for entry in media:
            if len(hashes)>=6:
                break
            url=entry['url']
            v={'url':url,'imageUrl':entry['url'],'ok':False}
            try:
                body,ctype=await fetch(session,url,attempts=2)
                im=Image.open(io.BytesIO(body)); im.load()
                digest=hashlib.sha256(body).hexdigest()
                pixelhash=hashlib.sha256(im.convert('RGB').tobytes()).hexdigest()
                v.update({'ok':True,'contentType':ctype,'bytes':len(body),'width':im.width,'height':im.height,'format':im.format,'sha256':digest,'pixelSha256':pixelhash,'duplicate':pixelhash in hashes})
                if pixelhash not in hashes:
                    hashes.add(pixelhash);valid_media.append(entry)
                else:
                    selected=[m for m in selected if m['canonicalId']!=entry['canonicalId']]
            except Exception as e:
                v['error']=str(e)[:250]
                selected=[m for m in selected if m['canonicalId']!=entry['canonicalId']]
            validation.append(v)
        for entry in valid_media:
            if all(x['canonicalId']!=entry['canonicalId'] for x in selected):
                selected.append(entry)
        for entry in media:
            if len(selected)>=6:break
            failed=any(v['imageUrl']==entry['url'] and (not v['ok'] or v.get('duplicate')) for v in validation)
            if not failed and all(x['canonicalId']!=entry['canonicalId'] for x in selected):selected.append(entry)
        row.update({'images':selected[:6],'gallery':[m['url'] for m in selected[:6]],'validation':validation,'validatedCount':len(hashes)})
        row['status']='ok' if len(selected)>=3 and len(hashes)>=2 else ('source_limited' if len(media)<3 else 'validation_gap')
    except Exception as e:
        row['error']=str(e)[:400]
        if 'HTTP 403' in str(e):row['status']='blocked_pending'
    return row

async def main():
    global STOP_EVENT
    start=time.monotonic()
    pending=[p for p in PRODUCTS if p['id'] not in RESULTS or RESULTS[p['id']]['status'] in ('api_error','blocked_pending')]
    pending=pending[:max(1,min(50,int(os.environ.get('BB_MAX_PRODUCTS','25'))))]
    queue=asyncio.Queue()
    for p in pending:queue.put_nowait(p)
    workers=1
    connector=aiohttp.TCPConnector(limit=workers,limit_per_host=workers)
    timeout=aiohttp.ClientTimeout(total=30,connect=15)
    stop=asyncio.Event()
    STOP_EVENT=stop
    counters={'consecutiveBlocked':0,'processed':0}
    async with aiohttp.ClientSession(connector=connector,timeout=timeout,trust_env=True,headers={'User-Agent':'KORA-Catalogue-Image-Review/1.0','Accept':'application/json,image/*;q=0.9,*/*;q=0.8'}) as session:
        async def worker():
            while not queue.empty() and not stop.is_set():
                try:p=queue.get_nowait()
                except asyncio.QueueEmpty:return
                row=await collect(session,p)
                RESULTS[row['id']]=row
                counters['processed']+=1
                counters['consecutiveBlocked']=counters['consecutiveBlocked']+1 if row['status']=='blocked_pending' else 0
                with JOURNAL.open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
                queue.task_done()
                if counters['consecutiveBlocked']>=1:
                    stop.set()
                    print('Paused after first edge access denial.',flush=True)
                if counters['processed']%25==0:
                    summary=save()
                    print(json.dumps({'elapsedSeconds':round(time.monotonic()-start),**summary}),flush=True)
        await asyncio.gather(*(worker() for _ in range(workers)))
    print(json.dumps({'final':save(),'elapsedSeconds':round(time.monotonic()-start)}),flush=True)

if __name__=='__main__':
    asyncio.run(main())
