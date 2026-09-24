'use client';
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination -- Native navigation is required by this Vinext deployment. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Eye, EyeOff, Heart, LockKeyhole, ShieldCheck, ShoppingBag } from 'lucide-react';
import './auth-panel.css';

type Capabilities = { configured: boolean; password: boolean; google: boolean };
export default function AuthPanel({ signup = false }: { signup?: boolean }) {
  const params = useSearchParams();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState(() => params.has('error') ? 'Google sign-in could not be completed. Try again, or use the sign-in method you used to create your account.' : '');
  const [busy, setBusy] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/config', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again shortly.');
      const data = await response.json() as Capabilities;
      if (active) setCapabilities(data);
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  async function submit(method: 'google' | 'password', form?: HTMLFormElement) {
    if (busy) return;
    setError('');
    const fields = form ? new FormData(form) : null;
    const password = String(fields?.get('password') || '');
    if (method === 'password' && signup && password !== String(fields?.get('confirmPassword') || '')) {
      setError('Your passwords do not match. Please check them and try again.');
      form?.querySelector<HTMLInputElement>('[name="confirmPassword"]')?.focus();
      return;
    }
    setBusy(method);
    try {
      const endpoint = method === 'google' ? '/sign-in/social' : signup ? '/sign-up/email' : '/sign-in/email';
      const response = await fetch('/api/auth' + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'google'
          ? { provider: 'google', callbackURL: '/account', errorCallbackURL: '/sign-in' }
          : { email: String(fields?.get('email') || '').trim(), password, ...(signup ? { name: String(fields?.get('name') || '').trim() } : {}), callbackURL: '/account' }),
      });
      const data = await response.json() as { message?: string; code?: string; url?: string };
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('Retry-After'));
          const minutes = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter / 60) : 10;
          throw new Error(`Too many attempts. Please wait ${minutes === 1 ? 'a minute' : `${minutes} minutes`} before trying again.`);
        }
        if (method === 'password' && response.status !== 503) {
          throw new Error(signup ? 'We could not create that account. Check your details, or sign in if you already have an account with this email.' : 'We could not sign you in. Check your email and password. If you joined with Google, use Continue with Google.');
        }
        throw new Error(data.message || 'Sign-in is temporarily unavailable. Please try again.');
      }
      if (method === 'google') {
        if (!data.url) throw new Error('Google sign-in could not be started. Please try again.');
        const destination = new URL(data.url);
        if (destination.origin !== 'https://accounts.google.com') throw new Error('Google sign-in could not be started. Please try again.');
        window.location.assign(destination.href);
      } else {
        form?.reset();
        window.location.assign('/account');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in is temporarily unavailable.'); }
    finally { setBusy(''); }
  }

  return <section className="kora-auth" aria-labelledby="auth-heading">
    <div className="kora-auth-story"><p className="eyebrow">GOOD FINDS. ALL YOURS.</p><h1 id="auth-heading">Your next<br/>favourite.<br/><em>Kept close.</em></h1><p>A little space for everything you love. Save your discoveries, keep your bag and pick up where you left off.</p><div className="kora-auth-benefits"><span><Heart size={20}/> A wishlist that travels with you</span><span><ShoppingBag size={20}/> Your bag, across your devices</span><span><ShieldCheck size={20}/> Your requests, in one place</span></div><span className="kora-auth-star" aria-hidden="true">✳</span></div>
    <div className="kora-auth-card">
      <a className="kora-auth-back" href="/shop">Explore the catalogue <ArrowUpRight size={16}/></a>
      <span className="kora-auth-kicker">MY KORA</span><h2>{signup ? 'Make yourself at home.' : 'Good to see you.'}</h2>
      <p>{signup ? 'Create an account with your email and password' : 'Your discoveries are waiting. Sign in with your email and password'}{capabilities?.google ? ', or continue with Google.' : '.'}</p>
      {error && <p className="kora-auth-error" role="alert">{error}</p>}
      {!capabilities && !error && <p role="status">Getting your sign-in options ready…</p>}
      {capabilities && !capabilities.google && !capabilities.password && <div className="kora-auth-notice" role="status"><ShieldCheck size={22}/><div><strong>Customer sign-in is being connected.</strong><p>You can explore, save products and request a quote as a guest. Your shopping session stays in this browser.</p></div></div>}
      {capabilities?.google && <button className="kora-auth-google" disabled={Boolean(busy)} onClick={() => submit('google')}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.09-1.93 3.27-4.76 3.27-7.95Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.57-2.76c-.99.66-2.26 1.06-3.71 1.06-2.87 0-5.3-1.94-6.17-4.55H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.83 13.95a6.61 6.61 0 0 1 0-3.9V7.21H2.15a11 11 0 0 0 0 9.58l3.68-2.84Z"/><path fill="#EA4335" d="M12 5.5c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.55 10.55 0 0 0 12 1a11 11 0 0 0-9.85 6.21l3.68 2.84C6.7 7.44 9.13 5.5 12 5.5Z"/></svg>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button>}
      {capabilities?.google && capabilities.password && <div className="kora-auth-divider"><span>or use your email</span></div>}
      {capabilities?.password && <form aria-label={signup ? 'Create your account' : 'Sign in to your account'} onSubmit={event => { event.preventDefault(); void submit('password', event.currentTarget); }} aria-busy={busy === 'password'}>
        {signup && <label>Your name<input name="name" autoComplete="name" maxLength={120} required placeholder="What should we call you?" disabled={Boolean(busy)}/></label>}
        <label>Email address<input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required placeholder="you@example.com" disabled={Boolean(busy)}/></label>
        <div className="kora-auth-password-field"><label htmlFor="kora-password">Password</label><div className="kora-auth-password"><input id="kora-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : undefined} maxLength={128} required aria-describedby={signup ? 'kora-password-help' : undefined} disabled={Boolean(busy)}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>{signup && <small id="kora-password-help">Use 12–128 characters. A long, unique passphrase works well.</small>}</div>
        {signup && <label>Confirm password<input name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required disabled={Boolean(busy)}/></label>}
        <button className="btn dark" disabled={Boolean(busy)} type="submit"><LockKeyhole size={18}/>{busy === 'password' ? signup ? 'Creating your account…' : 'Signing you in…' : signup ? 'Create account' : 'Sign in'}<ArrowRight size={18}/></button>
        <small className="kora-auth-recovery">{signup ? 'Save your password securely and keep using the same sign-in method. Email verification and password reset are not available yet. Google sign-in cannot recover a password account.' : 'Forgot your password? Email reset is not available yet. If you joined with Google, use Continue with Google.'}</small>
      </form>}
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
