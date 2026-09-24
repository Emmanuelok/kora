/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's next/link throws during navigation; native anchors preserve working browser navigation. */
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Bookmark, Check, Compass, Download, Heart, Package, Share2, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import { InstallAction } from "../pwa";
import { metadataForRoute } from "../../lib/site-metadata";

export const metadata = metadataForRoute(["install"]);

export default function InstallPage() {
  return (
    <div className="kora-install-page">
      <a className="skip-link" href="#install-main">Skip to content</a>
      <header className="kora-install-header">
        <a href="/" className="kora-install-brand" aria-label="Kora Ghana home">kora<span aria-hidden="true">✳</span></a>
        <span className="kora-install-header-note">GOOD TECH. GREAT POSSIBILITIES.</span>
        <a href="/shop">Explore the catalogue<ArrowUpRight size={17} aria-hidden="true" /></a>
      </header>

      <main id="install-main">
        <section className="kora-install-hero" aria-labelledby="install-heading">
          <div className="kora-install-copy">
            <span className="kora-install-kicker"><span /> A LITTLE CLOSER TO YOUR EVERYDAY</span>
            <h1 id="install-heading">Your everyday.<br /><em>A tap away.</em></h1>
            <p className="kora-install-lead">Big possibilities deserve a small place on your home screen. Make Kora your shortcut to technology, home and everything in between.</p>
            <InstallAction />
            <div className="kora-install-platforms"><Smartphone size={17} aria-hidden="true" /><span>For your phone, tablet and computer.</span></div>
          </div>

          <div className="kora-install-scene" aria-hidden="true">
            <div className="kora-install-orbit kora-install-orbit-one" /><div className="kora-install-orbit kora-install-orbit-two" />
            <span className="kora-install-spark">✳</span>
            <div className="kora-install-floating-label"><span /> MADE FOR YOUR EVERYDAY</div>
            <div className="kora-install-phone">
              <div className="kora-install-phone-island" />
              <div className="kora-install-phone-top"><span>kora✳</span><span>GHANA</span></div>
              <div className="kora-install-phone-art"><span className="kora-install-phone-orbit" /><Image src="/icons/kora-512.png" width={126} height={126} unoptimized alt="" /><span className="kora-install-phone-star">✳</span></div>
              <div className="kora-install-phone-copy"><span>OPEN UP THE POSSIBILITIES</span><strong>Good tech.<br />Great days.</strong><p>A little upgrade.<br />A world of possibility.</p></div>
              <div className="kora-install-phone-cta">Find your next favourite<ArrowUpRight size={17} /></div>
              <div className="kora-install-phone-tabs"><span><Compass size={19} />Explore</span><span><Heart size={19} />Saved</span><span><Package size={19} />Requests</span></div>
              <div className="kora-install-phone-home" />
            </div>
            <div className="kora-install-icon-card"><Image src="/icons/kora-192.png" width={62} height={62} unoptimized alt="" /><div><strong>KORA</strong><span>Your next favourite.</span></div><Check size={19} /></div>
            <span className="kora-install-scene-caption">ONE ICON. A WORLD OF POSSIBILITY.</span>
          </div>
        </section>

        <div className="kora-install-ribbon" aria-hidden="true"><span>LESS SEARCHING.</span><span>✳</span><span>MORE DISCOVERING.</span><span>✳</span><span>ALL KORA.</span></div>

        <section className="kora-install-benefits" aria-labelledby="benefits-heading">
          <div className="kora-install-section-heading"><p className="kora-install-eyebrow">SMALL ICON. BIG ENERGY.</p><h2 id="benefits-heading">A little more Kora.<br />A little less effort.</h2><p>The same Kora you know, with a place of its own.</p></div>
          <div className="kora-install-benefit-grid">
            <article><span className="kora-install-feature-icon"><Compass size={25} aria-hidden="true" /></span><span className="kora-install-feature-number">01</span><h3>Straight to discovery.</h3><p>Launch from your home screen or dock. Browse technology, appliances, gaming and more in one place.</p></article>
            <article><span className="kora-install-feature-icon"><Bookmark size={25} aria-hidden="true" /></span><span className="kora-install-feature-number">02</span><h3>A space of its own.</h3><p>On supported devices, Kora opens in its own window, so you can focus on finding your next favourite.</p></article>
            <article><span className="kora-install-feature-icon"><ShieldCheck size={25} aria-hidden="true" /></span><span className="kora-install-feature-number">03</span><h3>Simple by design.</h3><p>No app-store account required. Browsing is always open. You choose when to install and when to refresh for an update.</p></article>
          </div>
        </section>

        <section className="kora-install-guide" id="install-guide" aria-labelledby="guide-heading">
          <div className="kora-install-guide-intro"><span className="kora-install-guide-symbol" aria-hidden="true">✳</span><p className="kora-install-eyebrow">MAKE YOURSELF AT HOME</p><h2 id="guide-heading">A few taps.<br />Then you’re in.</h2><p>Installation options vary by browser and device. Use the install button above when it appears, or follow your browser’s steps.</p></div>
          <div className="kora-install-guide-options">
            <details open><summary><span><Smartphone size={20} aria-hidden="true" />iPhone & iPad</span><span className="kora-install-guide-plus" aria-hidden="true">+</span></summary><ol><li><span>1</span><p>Open Kora in <strong>Safari</strong>.</p></li><li><span>2</span><p>Tap the <strong>Share</strong> button <Share2 size={15} aria-hidden="true" /> in the browser.</p></li><li><span>3</span><p>Choose <strong>Add to Home Screen</strong>. If offered, keep <strong>Open as Web App</strong> enabled, then tap <strong>Add</strong>.</p></li></ol></details>
            <details><summary><span><Download size={20} aria-hidden="true" />Android</span><span className="kora-install-guide-plus" aria-hidden="true">+</span></summary><ol><li><span>1</span><p>Open Kora in <strong>Chrome</strong> or a browser that supports app installation.</p></li><li><span>2</span><p>Tap <strong>Add Kora to your device</strong> above when available, or open your browser’s menu.</p></li><li><span>3</span><p>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then follow the confirmation.</p></li></ol></details>
            <details><summary><span><ArrowUpRight size={20} aria-hidden="true" />Your computer</span><span className="kora-install-guide-plus" aria-hidden="true">+</span></summary><ol><li><span>1</span><p>Open Kora in <strong>Chrome</strong>, <strong>Edge</strong> or a supported desktop browser.</p></li><li><span>2</span><p>Look for the install icon in the address bar, or an <strong>Install</strong> option in the browser menu.</p></li><li><span>3</span><p>On recent versions of Safari for Mac, choose <strong>File → Add to Dock</strong>. If no install option is available, bookmark Kora instead.</p></li></ol></details>
          </div>
        </section>

        <section className="kora-install-good-to-know" aria-labelledby="know-heading"><div><Wifi size={25} aria-hidden="true" /><h2 id="know-heading">A quick heads-up.</h2></div><p><strong>Keep a connection handy.</strong> Browsing, product photos, saved items and sending or tracking requests need internet. If you lose signal, Kora shows a helpful offline screen; it does not send requests in the background.</p><p><strong>Your browser session matters.</strong> Installing may open a separate session on some devices. Guest saved items and requests stay in that browser. Sign in to your Kora account to access your shopping across devices when account sign-in is available. <a href="/help/privacy">How your information works<ArrowUpRight size={14} aria-hidden="true" /></a></p></section>

        <section className="kora-install-bottom"><Image src="/icons/kora-192.png" width={72} height={72} unoptimized alt="Kora app icon" /><div><p>GOOD TECH. GREAT POSSIBILITIES.</p><h2>Your next favourite is waiting.</h2></div><a href="/shop">Explore Kora<ArrowRight size={20} aria-hidden="true" /></a></section>
      </main>
      <footer className="kora-install-footer"><span>© {new Date().getFullYear()} KORA Ghana</span><a href="/help/privacy">Privacy & terms</a><span>Thoughtfully brought together for Ghana.</span></footer>
    </div>
  );
}
