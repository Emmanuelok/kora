'use client';
/* Native links are intentional for the deployed Vinext router. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, LoaderCircle, LockKeyhole, RefreshCw, Search } from 'lucide-react';
import { requestKinds, requestKindLabels, requestStatuses } from '@/lib/request-status';
import './workspace.css';

type RequestSummary = { id: string; kind: string; status: string; created: string; name: string; city: string };
type Update = { id: string; status: string; message: string; created: string };
type Item = { id: string; name: string; quantity: number; indicativeUnitPrice: number | null; options?: Record<string,string> };
type RequestDetail = RequestSummary & { version: number; updates: Update[]; data: { name: string; email: string; phone?: string; city?: string; address?: string; digitalAddress?: string; message?: string; service?: string; paymentPreference?: string; items?: Item[]; quote?: { amountMinor: number; currency: string; validUntil: string } } };
type Resource<T> = { key: string; data: T | null; error: string; receivedAt: number };
type WorkspaceResources = {
  list: Resource<{ requests: RequestSummary[]; hasMore: boolean }> | null;
  detail: Resource<RequestDetail> | null;
  denied: { revision: number; status: number; error: string } | null;
};
const currency = (minor: number) => new Intl.NumberFormat('en-GH',{style:'currency',currency:'GHS'}).format(minor/100);
const date = (value: string) => new Date(value).toLocaleString('en-GH',{dateStyle:'medium',timeStyle:'short'});
const accessDenied = (status: number) => [401,403,503].includes(status);
async function responseBody<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch (error) {
    // A gateway may return HTML for an error. Preserve its HTTP status so
    // denied access still clears customer data even without a JSON message.
    if (!response.ok) return {} as T;
    throw error;
  }
}

function RequestEditor({ request, receivedAt, onSaved, onAccessDenied }: { request: RequestDetail; receivedAt: number; onSaved: () => void; onAccessDenied: (status: number, error: string) => void }) {
  const [status,setStatus] = useState(request.status);
  const [message,setMessage] = useState('');
  const [amount,setAmount] = useState(request.data.quote ? (request.data.quote.amountMinor/100).toFixed(2) : '');
  const [expires,setExpires] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [now,setNow] = useState(receivedAt);
  const submission = useRef<AbortController | null>(null);
  useEffect(()=>()=>submission.current?.abort(),[]);
  useEffect(()=>{
    if (!request.data.quote) return;
    const timer = setInterval(()=>setNow(Date.now()),30_000);
    return ()=>clearInterval(timer);
  },[request.data.quote]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current) return;
    const controller = new AbortController(); submission.current = controller;
    setBusy(true); setError('');
    try {
      const amountMinor = /^\d+(\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount)*100) : null;
      const response = await fetch('/api/admin/requests',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({id:request.id,version:request.version,status,message,...(status==='Quotation ready'?{amountMinor,validUntil:expires?new Date(expires).toISOString():''}:{})})});
      const data = await responseBody<{ error?: string }>(response);
      if (controller.signal.aborted) return;
      if (accessDenied(response.status)) { onAccessDenied(response.status,data.error || 'Team access is unavailable.'); return; }
      if (!response.ok) throw new Error(data.error || 'Unable to save the update.');
      onSaved();
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error?failure.message:'Please try again.'); }
    finally { if (submission.current === controller) submission.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <article className="team-detail">
    <header><p className="team-eyebrow">{requestKindLabels[request.kind] || request.kind}</p><h2>{request.id}</h2><span className="team-status">{request.status}</span><p className="team-muted">Received {date(request.created)}</p></header>
    <section><h3>Customer details</h3><dl className="team-customer"><div><dt>Name</dt><dd>{request.data.name}</dd></div><div><dt>Email</dt><dd><a href={'mailto:'+encodeURIComponent(request.data.email)}>{request.data.email}</a></dd></div>{[['Phone',request.data.phone],['City',request.data.city],['Address',request.data.address],['GhanaPost GPS',request.data.digitalAddress]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{request.data.service&&<p><strong>Service:</strong> {request.data.service}</p>}{request.data.message&&<p className="team-message">{request.data.message}</p>}</section>
    {request.data.items?.length ? <section><h3>Requested products</h3><div className="team-items">{request.data.items.map(item=><div key={item.id}><span><strong>{item.quantity} × {item.name}</strong><small>{item.id}</small>{item.options&&<small>{Object.entries(item.options).map(([key,value])=>`${key}: ${value}`).join(' · ')}</small>}</span><b>{item.indicativeUnitPrice==null?'To quote':currency(Math.round(item.indicativeUnitPrice*100)*item.quantity)}</b></div>)}</div></section> : null}
    {request.data.quote&&<section className="team-quote"><span>Latest complete quotation</span><strong>{currency(request.data.quote.amountMinor)}</strong><p>{Date.parse(request.data.quote.validUntil)<=now?'Expired':'Valid until'} {date(request.data.quote.validUntil)}</p><small>No payment has been collected.</small></section>}
    <form onSubmit={save} className="team-update"><h3>Move this request forward</h3><label>Status<select value={status} onChange={event=>setStatus(event.target.value)}>{requestStatuses.map(value=><option key={value}>{value}</option>)}</select></label>
      {status==='Quotation ready'&&<div className="team-quote-fields"><label>Complete total (GH₵)<input type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required inputMode="decimal"/></label><label>Quote expires<input type="datetime-local" value={expires} onChange={event=>setExpires(event.target.value)} required/></label><p>Confirm the exact configuration, stock, Ghana compatibility, original retail fees, import costs, 20% markup and applicable selling taxes. Include agreed delivery and service charges in this one total.</p></div>}
      <label>Update the customer will see<textarea rows={5} value={message} onChange={event=>setMessage(event.target.value)} maxLength={2000} required placeholder="Explain the next step, confirmed details or what you need from the customer."/></label><p className="team-muted">Saved updates appear in the customer’s request history. Email, SMS and WhatsApp sending are not connected; contact the customer through your approved channel.</p>{error&&<p role="alert" className="team-error">{error}</p>}<button className="team-primary" disabled={busy}>{busy?<LoaderCircle className="team-spin" size={17}/>:<CheckCircle2 size={17}/>} {busy?'Saving update…':'Save customer update'}</button>
    </form>
    <section><h3>Customer update history</h3>{request.updates.length?<ol className="team-timeline">{request.updates.map(update=><li key={update.id}><strong>{update.status}</strong><time>{date(update.created)}</time><p>{update.message}</p></li>)}</ol>:<p className="team-muted">No team updates yet.</p>}</section>
  </article>;
}

export default function RequestWorkspace() {
  const [resources,setResources] = useState<WorkspaceResources>({ list: null, detail: null, denied: null });
  const [selected,setSelected] = useState('');
  const [query,setQuery] = useState('');
  const [draftQuery,setDraftQuery] = useState('');
  const [status,setStatus] = useState('');
  const [kind,setKind] = useState('');
  const [offset,setOffset] = useState(0);
  const [revision,setRevision] = useState(0);
  const [saved,setSaved] = useState(false);
  const listUrl = '/api/admin/requests?'+new URLSearchParams({q:query,status,kind,offset:String(offset)});
  const listKey = revision+':'+listUrl;
  const detailUrl = selected ? '/api/admin/requests?id='+encodeURIComponent(selected) : '';
  const detailKey = revision+':'+detailUrl;
  const denyAccess = useCallback((status: number, error: string, deniedRevision: number)=>{
    // Discard both resources; a concurrent success from this revision must not
    // restore customer data after either endpoint has denied access.
    setResources({ list: null, detail: null, denied: { revision: deniedRevision, status, error } });
    setSelected(''); setSaved(false);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(listUrl,{signal:controller.signal,cache:'no-store'}).then(async response=>{
      const body=await responseBody<{ error?: string; requests: RequestSummary[]; hasMore: boolean }>(response);
      if(controller.signal.aborted)return;
      if(accessDenied(response.status)){denyAccess(response.status,body.error || 'Team access is unavailable.',revision);return;}
      if(!response.ok)throw new Error(body.error || 'Unable to open the workspace.');
      const result = { key:listKey, data:{ requests:body.requests,hasMore:body.hasMore }, error:'', receivedAt:Date.now() };
      setResources(current=>current.denied?.revision===revision?current:{...current,list:result});
    }).catch(failure=>{
      if(controller.signal.aborted)return;
      const result = { key:listKey,data:null,error:failure instanceof Error?failure.message:'Please try again.',receivedAt:Date.now() };
      setResources(current=>current.denied?.revision===revision?current:{...current,list:result});
    });
    return()=>controller.abort();
  },[listUrl,listKey,revision,denyAccess]);
  useEffect(()=>{
    if(!detailUrl)return;
    const controller=new AbortController();
    fetch(detailUrl,{signal:controller.signal,cache:'no-store'}).then(async response=>{
      const body=await responseBody<{ error?: string; request: RequestDetail }>(response);
      if(controller.signal.aborted)return;
      if(accessDenied(response.status)){denyAccess(response.status,body.error || 'Team access is unavailable.',revision);return;}
      if(!response.ok)throw new Error(body.error || 'Unable to load this request.');
      const result = { key:detailKey,data:body.request,error:'',receivedAt:Date.now() };
      setResources(current=>current.denied?.revision===revision?current:{...current,detail:result});
    }).catch(failure=>{
      if(controller.signal.aborted)return;
      const result = { key:detailKey,data:null,error:failure instanceof Error?failure.message:'Please try again.',receivedAt:Date.now() };
      setResources(current=>current.denied?.revision===revision?current:{...current,detail:result});
    });
    return()=>controller.abort();
  },[detailUrl,detailKey,revision,denyAccess]);
  const denied = resources.denied?.revision===revision ? resources.denied : null;
  const locked = Boolean(denied);
  const listResource = !locked && resources.list?.key===listKey ? resources.list : null;
  const detailResource = !locked && selected && resources.detail?.key===detailKey ? resources.detail : null;
  const list = listResource?.data?.requests || [];
  const hasMore = listResource?.data?.hasMore || false;
  const detail = detailResource?.data || null;
  const loading = !locked && !listResource;
  const detailLoading = !locked && Boolean(selected) && !detailResource;
  const error = denied?.error || listResource?.error || '';
  const detailError = detailResource?.error || '';
  return <main className="team-workspace">
    <header className="team-header"><a href="/" className="team-wordmark">kora<span>for the team</span></a><a href="/account">My account <ArrowRight size={15}/></a></header>
    <section className="team-intro"><div><p className="team-eyebrow">CARE BEHIND EVERY REQUEST</p><h1>A thoughtful next step.</h1><p>Your enquiries, quotations and customer updates, in one place.</p></div><button className="team-refresh" onClick={()=>setRevision(value=>value+1)} disabled={loading}><RefreshCw size={17}/> Refresh</button></section>
    {locked?<section className="team-locked"><LockKeyhole size={38}/><h2>{denied?.status===401?'Sign in to your team workspace.':'Team access is required.'}</h2><p>{error}</p><a className="team-primary" href="/sign-in">Go to sign in <ArrowRight size={17}/></a><a href="/">Return to Kora</a></section>:<>
      <form className="team-filters" onSubmit={event=>{event.preventDefault();setQuery(draftQuery);setOffset(0);}}><label className="team-search"><Search size={18}/><input aria-label="Search requests by reference, customer or email" value={draftQuery} onChange={event=>setDraftQuery(event.target.value)} placeholder="Reference, customer or email"/><button>Search</button></label><label>Status<select value={status} onChange={event=>{setStatus(event.target.value);setOffset(0);}}><option value="">All statuses</option>{requestStatuses.map(value=><option key={value}>{value}</option>)}</select></label><label>Request type<select value={kind} onChange={event=>{setKind(event.target.value);setOffset(0);}}><option value="">All types</option>{requestKinds.map(value=><option value={value} key={value}>{requestKindLabels[value]}</option>)}</select></label></form>
      {error&&<p role="alert" className="team-error">{error}</p>}{saved&&<p className="team-confirmation" role="status">Customer update saved. It is now visible in their request history.</p>}
      <div className="team-layout"><section className="team-inbox" aria-label="Incoming requests" aria-busy={loading}>{loading?<p className="team-loading"><LoaderCircle className="team-spin"/> Loading requests…</p>:list.length?<><div className="team-request-list">{list.map(request=><button key={request.id} className={selected===request.id?'is-selected':''} onClick={()=>{setSelected(request.id);setSaved(false);}} aria-pressed={selected===request.id}><span className="team-list-top"><strong>{request.name}</strong><ArrowRight size={16}/></span><span>{requestKindLabels[request.kind]} · {request.city}</span><span className="team-list-bottom"><small>{request.id}</small><small>{request.status}</small></span></button>)}</div><nav className="team-pagination" aria-label="Request pages"><button disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-40))}><ArrowLeft size={16}/> Newer</button><button disabled={!hasMore} onClick={()=>setOffset(value=>value+40)}>Older <ArrowRight size={16}/></button></nav></>:<div className="team-empty"><ClipboardList size={34}/><h2>{query||status||kind?'No matching requests.':'Ready for the first enquiry.'}</h2><p>{query||status||kind?'Try a broader search or different filters.':'Customer requests will appear here after submission.'}</p></div>}</section>
      <section className="team-detail-area" aria-label="Selected request" aria-busy={detailLoading}>{detailLoading?<p className="team-loading">Loading request details…</p>:detailError?<p role="alert" className="team-error">{detailError}</p>:detail?<RequestEditor key={detail.id+':'+detail.version} request={detail} receivedAt={detailResource!.receivedAt} onSaved={()=>{setSaved(true);setRevision(value=>value+1);}} onAccessDenied={(status,error)=>denyAccess(status,error,revision)}/>:<div className="team-empty"><ClipboardList size={38}/><h2>Make someone’s next step easier.</h2><p>Choose an enquiry to review details, prepare a quotation or share an update.</p></div>}</section></div>
    </>}
  </main>;
}
