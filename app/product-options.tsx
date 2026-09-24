'use client';

import { ghPrice, money } from '../lib/catalogue';
import { getProductFamily, getProductOptionSnapshot, getVariantOptions, productHref } from '../lib/product-variants';
import './product-options.css';

export default function ProductOptions({ productId }: { productId: string }) {
  const family = getProductFamily(productId);
  const variants = getVariantOptions(productId);
  if (!family || variants.length < 2) return null;
  const selected = getProductOptionSnapshot(productId);
  const labelId = `configuration-${productId}`;
  const noteId = `${labelId}-note`;

  return <section className="product-options" aria-labelledby={labelId}>
    <div className="product-options-heading">
      <h2 id={labelId}>Choose your configuration</h2>
      <span>{variants.length} options</span>
    </div>
    <p className="product-options-selection">{family.axes.map(axis => `${axis}: ${selected?.[axis]}`).join(' · ')}</p>
    {variants.length > 8 ? <label className="product-options-select">
      <span>Available configurations</span>
      <select value={productId} aria-describedby={noteId} onChange={event => {
        const next = variants.find(variant => variant.productId === event.target.value);
        if (next && next.productId !== productId) window.location.assign(productHref(next.productId));
      }}>
        {variants.map(variant => <option key={variant.productId} value={variant.productId}>
          {variant.label} — {money(ghPrice(variant.product))}{variant.product.sourceAvailability?.includes('lists unavailable') ? ' · retailer unavailable' : ''}
        </option>)}
      </select>
    </label> : <ul className="product-options-grid" aria-describedby={noteId}>
      {variants.map(variant => <li key={variant.productId}>
        <a href={variant.href} aria-current={variant.productId === productId ? 'page' : undefined}>
          <span>{variant.label}</span>
          <small>{money(ghPrice(variant.product))}</small>
          {variant.product.sourceAvailability?.includes('lists unavailable') && <small>Retailer currently unavailable</small>}
        </a>
      </li>)}
    </ul>}
    <p className="product-options-note" id={noteId}>Your selected configuration has its own price and bag item. Ghana price and availability are confirmed in your quotation.</p>
  </section>;
}
