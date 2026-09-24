import fs from 'node:fs';
import { createPriceIdentity } from '../lib/price-identity.mjs';

const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const selling = JSON.parse(fs.readFileSync('data/selling-prices.json', 'utf8'));
const families = JSON.parse(fs.readFileSync('data/product-families.json', 'utf8'));
const configurations = new Map(families.flatMap(family => family.variants.map(variant => [variant.productId, variant.options])));
const approved = new Set(selling.prices.filter(price => Date.parse(price.verifiedAt) <= Date.now() && Date.parse(price.validUntil) > Date.now()).map(price => price.productId));
const rows = products.map(product => ({
  productId: product.id, name: product.name,
  catalogueIdentity: createPriceIdentity(product, configurations.get(product.id) || {}),
  referenceKind: product.priceGHS ? 'Ghana retail reference' : product.priceCAD ? 'Canadian retail reference' : 'Manufacturer reference',
  referenceCurrency: product.priceGHS ? 'GHS' : product.priceCAD ? 'CAD' : product.priceOriginal?.currency || '',
  referenceAmount: product.priceGHS || product.priceCAD || product.priceOriginal?.amount || null,
  sourceUrl: product.sourceUrl,
  approvedSellingPrice: approved.has(product.id),
  requirements: approved.has(product.id) ? '' : 'Exact supplier invoice/checkout fees; merchant sourcing route; FX if needed; freight/insurance if imported; exact HS/customs assessment if imported; other cost allocations; output-tax policy; merchant approval and expiry',
}));
const summary = { products: products.length, approvedSellingPrices: approved.size,
  unpriced: products.length - approved.size,
  referencesByCurrency: Object.fromEntries([...new Set(rows.map(row => row.referenceCurrency || 'unspecified'))].map(currency => [currency, rows.filter(row => (row.referenceCurrency || 'unspecified') === currency).length])),
};
fs.mkdirSync('work/pricing', { recursive: true });
fs.writeFileSync('work/pricing/catalogue-cost-input-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), summary, rows }, null, 2) + '\n');
const columns = Object.keys(rows[0]);
const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
fs.writeFileSync('work/pricing/catalogue-cost-input-gaps.csv', columns.join(',') + '\n' + rows.map(row => columns.map(column => cell(row[column])).join(',')).join('\n') + '\n');
console.log(JSON.stringify(summary, null, 2));
