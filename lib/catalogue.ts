import products from '../data/products.json';
import sellingPrices from '../data/selling-prices.json';
import productFamilyData from '../data/product-families.json';
import { createPriceIdentity } from './price-identity.mjs';

export type SellingPrice = {
  productId: string; currency: 'GHS'; amountMinor: number;
  policy: 'kora-selling-price-v1'; revision: string;
  identity: string;
  verifiedAt: string; validUntil: string;
};

export type Product = {
  id: string;
  name: string;
  brand: string;
  department: string;
  category: string;
  priceCAD: number;
  regularPriceCAD: number;
  image: string;
  imageVerificationStatus?: string;
  imageVerificationNote?: string;
  sourceUrl: string;
  description: string;
  model?: string;
  condition?: string;
  priceGHS?: number;
  priceSource?: string;
  priceCheckedAt?: string;
  priceType?: string;
  priceMetadataUrl?: string;
  retailerVariantId?: string;
  retailerSku?: string | null;
  retailerProductTitle?: string;
  retailerVariantTitle?: string;
  sourceAvailability?: string;
  releaseStatus?: string;
  releaseDate?: string;
  announcementDate?: string;
  manufacturerVerified?: boolean;
  imageSource?: string;
  priceOriginal?: { amount: number | null; currency: string; market: string };
  sourcePriceCheckedAt?: string;
  sellingPrice?: SellingPrice;
};

const approvedPrices = new Map((sellingPrices.prices as SellingPrice[]).map(price => [price.productId, price]));
const priceConfigurations = new Map(productFamilyData.flatMap(family => family.variants.map(variant => [variant.productId, variant.options] as const)));
export const catalogue: Product[] = (products as unknown as Product[]).map(product => ({ ...product, sellingPrice: approvedPrices.get(product.id) }));
export const sellingPriceIdentity = (product: Product): string => createPriceIdentity(product, priceConfigurations.get(product.id) || {});
export const GHANA_PRICE_VALIDITY_MS = 14 * 86400000;

/** Convert verified amounts to integer pesewas before arithmetic or storage. */
export function ghanaPesewas(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const minorUnits = Math.round(amount * 100);
  if (!Number.isSafeInteger(minorUnits) || Math.abs(amount * 100 - minorUnits) > 0.000001) return null;
  return minorUnits;
}

// A local retail reference is never synthesized from foreign currency. Expire stale quotes.
export function retailReferenceGhPrice(product?: Product, now = Date.now()): number | null {
  if (!product || typeof product.priceGHS !== 'number' || !product.priceSource?.trim() || !product.priceCheckedAt) return null;
  const checkedAt = product.priceCheckedAt;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(checkedAt)) return null;
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked) || new Date(checked).toISOString().slice(0, 10) !== checkedAt.slice(0, 10)) return null;
  const age = now - checked;
  if (!Number.isFinite(age) || age < 0 || age >= GHANA_PRICE_VALIDITY_MS) return null;
  const minorUnits = ghanaPesewas(product.priceGHS);
  return minorUnits !== null && minorUnits > 0 ? minorUnits / 100 : null;
}

// Customer prices contain complete reviewed costs and the requested markup. Retail references are never a fallback.
export function ghPrice(product?: Product, now = Date.now()): number | null {
  const price = product?.sellingPrice;
  if (!price || price.productId !== product?.id || price.currency !== 'GHS' || price.policy !== 'kora-selling-price-v1') return null;
  if (!product || price.identity !== sellingPriceIdentity(product)) return null;
  if (!Number.isSafeInteger(price.amountMinor) || price.amountMinor <= 0 || !/^[a-f0-9]{24}$/.test(price.revision)) return null;
  const verifiedAt = Date.parse(price.verifiedAt), validUntil = Date.parse(price.validUntil);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(validUntil) || verifiedAt > now || validUntil <= now || validUntil <= verifiedAt) return null;
  return price.amountMinor / 100;
}

const ghsFormatter = new Intl.NumberFormat('en-GH', {
  style: 'currency', currency: 'GHS', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? 'Price on request' : ghsFormatter.format(value);
export const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
