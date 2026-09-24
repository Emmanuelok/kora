'use client';
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination -- Native navigation is required by this Vinext deployment. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Check, Heart, Mail, ShieldCheck, ShoppingBag } from 'lucide-react';
import './auth-panel.css';

type Capabilities = { configured: boolean; google: boolean; magicLink: boolean };
export default function AuthPanel({ signup = false }: { signup?: boolean }) {
  const params = useSearchParams();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState(() => params.has('error') ? 'That sign-in link has expired or could not be verified. Please request a new link or continue with Google.' : '');
  const [busy, setBusy] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/config', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again shortly.');
      const data = await response.json() as Capabilities;
      if (active) setCapabilities(data);
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  async function submit(method: 'google' | 'email', email = '', name = '') {
    setBusy(method); setError('');
    try {
      const response = await fetch('/api/auth/sign-in/' + (method === 'google' ? 'social' : 'magic-link'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'google'
          ? { provider: 'google', callbackURL: '/account', errorCallbackURL: '/sign-in' }
          : { email, name, callbackURL: '/account', newUserCallbackURL: '/account', errorCallbackURL: '/sign-in' }),
      });
      const data = await response.json() as {message?: string; url?: string};
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many attempts. Please wait ten minutes before trying again.' : data.message || 'We could not sign you in. Please try again.');
      if (method === 'google') {
        if (!data.url) throw new Error('Google sign-in could not be started. Please try again.');
        const destination = new URL(data.url);
        if (destination.origin !== 'https://accounts.google.com') throw new Error('Google sign-in could not be started. Please try again.');
        window.location.assign(destination.href);
      } else setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in is temporarily unavailable.'); }
    finally { setBusy(''); }
  }

  return <section className="kora-auth" aria-labelledby="auth-heading">
    <div className="kora-auth-story"><p className="eyebrow">GOOD FINDS. ALL YOURS.</p><h1 id="auth-heading">Your next<br/>favourite.<br/><em>Kept close.</em></h1><p>A little space for everything you love. Save your discoveries, keep your bag and pick up where you left off.</p><div className="kora-auth-benefits"><span><Heart size={20}/> A wishlist that travels with you</span><span><ShoppingBag size={20}/> Your bag, across your devices</span><span><ShieldCheck size={20}/> Your requests, in one place</span></div><span className="kora-auth-star" aria-hidden="true">✳</span></div>
    <div className="kora-auth-card">
      <a className="kora-auth-back" href="/shop">Explore the catalogue <ArrowUpRight size={16}/></a>
      <span className="kora-auth-kicker">MY KORA</span><h2>{sent ? 'Check your inbox.' : signup ? 'Make yourself at home.' : 'Good to see you.'}</h2>
      <p>{sent ? 'Your secure sign-in link is on its way. Open it within 10 minutes to continue.' : signup ? 'Create an account with Google or a link sent to your email.' : 'Sign in with Google or a secure email link. No password to remember.'}</p>
      {error && <p className="kora-auth-error" role="alert">{error}</p>}
      {!capabilities && !error && <p role="status">Getting your sign-in options ready…</p>}
      {capabilities && !capabilities.google && !capabilities.magicLink && <div className="kora-auth-notice" role="status"><ShieldCheck size={22}/><div><strong>Customer sign-in is being connected.</strong><p>You can explore, save products and request a quote as a guest. Your shopping session stays in this browser.</p></div></div>}
      {sent ? <div className="kora-auth-sent"><span><Check size={28}/></span><p>Check your spam folder too. For security, each link works once. Opening it on this device also lets you keep your guest shopping session.</p><button className="kora-auth-secondary" onClick={() => setSent(false)}>Use another email or request a new link</button></div> : <>
        {capabilities?.google && <button className="kora-auth-google" disabled={Boolean(busy)} onClick={() => submit('google')}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.09-1.93 3.27-4.76 3.27-7.95Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.57-2.76c-.99.66-2.26 1.06-3.71 1.06-2.87 0-5.3-1.94-6.17-4.55H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.83 13.95a6.61 6.61 0 0 1 0-3.9V7.21H2.15a11 11 0 0 0 0 9.58l3.68-2.84Z"/><path fill="#EA4335" d="M12 5.5c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.55 10.55 0 0 0 12 1a11 11 0 0 0-9.85 6.21l3.68 2.84C6.7 7.44 9.13 5.5 12 5.5Z"/></svg>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button>}
        {capabilities?.google && capabilities.magicLink && <div className="kora-auth-divider"><span>or use your email</span></div>}
        {capabilities?.magicLink && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); submit('email', String(form.get('email') || ''), String(form.get('name') || '')); }}>
          {signup && <label>Your name<input name="name" autoComplete="name" maxLength={120} required placeholder="What should we call you?"/></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></label>
          <button className="btn dark" disabled={Boolean(busy)} type="submit"><Mail size={18}/>{busy === 'email' ? 'Sending your link…' : 'Email me a sign-in link'}<ArrowRight size={18}/></button>
          <small>New here? Verifying your email creates your Kora account.</small>
        </form>}
      </>}
      <p className="kora-auth-switch">{signup ? 'Already feel at home?' : 'New to Kora?'} <a href={signup ? '/sign-in' : '/sign-up'}>{signup ? 'Sign in' : 'Create an account'}</a></p>
      <p className="kora-auth-privacy">Your catalogue is always open to explore. <a href="/help/privacy">How we use your information</a></p>
    </div>
  </section>;
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <><button className="btn outline" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!response.ok) throw new Error(); window.location.assign('/'); }
    catch { setError('Could not sign out. Please try again.'); setBusy(false); }
  }}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert">{error}</p>}</>;
}
