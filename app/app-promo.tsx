import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import './app-promo.css';

export default function AppPromo() {
  return (
    <section className="kora-app-promo" aria-labelledby="kora-app-promo-title">
      <div className="kora-app-promo-copy">
        <p className="kora-app-promo-eyebrow">KORA, A LITTLE CLOSER</p>
        <h2 id="kora-app-promo-title">Your next favourite.<br /><em>One tap away.</em></h2>
        <p>Add a little Kora to your home screen. A beautiful, simpler way back to everything you love.</p>
        <div className="kora-app-promo-action"><Link href="/install">Get the Kora app<ArrowUpRight size={20} aria-hidden="true" /></Link><span>Free to add. Made for your everyday.</span></div>
      </div>
      <div className="kora-app-promo-art" aria-hidden="true">
        <div className="kora-app-promo-orbit" />
        <svg className="kora-app-promo-star" viewBox="0 0 240 240"><g transform="translate(120 120)" fill="currentColor">{[0,45,90,135].map(angle=><rect key={angle} x="-14" y="-108" width="28" height="216" rx="13" transform={`rotate(${angle})`} />)}</g></svg>
        <div className="kora-app-promo-icon"><Image src="/icons/kora-512.png" width={220} height={220} alt="" unoptimized /></div>
        <span className="kora-app-promo-caption">A LITTLE ICON. A WHOLE WORLD.</span>
      </div>
    </section>
  );
}
