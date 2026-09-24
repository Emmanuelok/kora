// Internal readiness report. Retailer references never count as approved selling prices.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPriceIdentity } from '../lib/price-identity.mjs';

const requirements = 'Exact supplier invoice/checkout fees; merchant sourcing route; FX if needed; allocated freight/insurance if imported; exact HS/customs assessment if imported; other cost allocations; output-tax policy; merchant approval and expiry';
const publicFields = new Set(['productId', 'identity', 'currency', 'amountMinor', 'policy', 'revision', 'verifiedAt', 'validUntil']);

function priceStatus(records, product, configuration, now) {
  if (!records.length) return 'missing';
  if (records.length !== 1) return 'duplicate-price-records';
  const price = records[0];
  if (Object.keys(price).some(key => !publicFields.has(key))) return 'unexpected-public-fields';
  if (price.currency !== 'GHS' || price.policy !== 'kora-selling-price-v1') return 'invalid-currency-or-policy';
  if (!Number.isSafeInteger(price.amountMinor) || price.amountMinor <= 0 || !/^[a-f0-9]{24}$/.test(price.revision)) return 'invalid-amount-or-revision';
  if (price.identity !== createPriceIdentity(product, configuration)) return 'identity-mismatch';
  const checked = Date.parse(price.verifiedAt), expiry = Date.parse(price.validUntil);
  if (!Number.isFinite(checked) || !Number.isFinite(expiry) || expiry <= checked) return 'invalid-dates';
  if (checked > now) return 'future-verification';
  if (expiry <= now) return 'expired';
  return 'approved';
}

export function buildSellingPriceAudit(products, selling, families, now = Date.now()) {
  if (selling.schemaVersion !== 1 || !Array.isArray(selling.prices)) throw new Error('Unsupported selling-price file');
  const familyByProduct = new Map(families.flatMap(family => family.variants.map(variant => [variant.productId, { family, configuration: variant.options }])));
  const recordsByProduct = new Map();
  for (const price of selling.prices) {
    const records = recordsByProduct.get(price.productId) || [];
    records.push(price); recordsByProduct.set(price.productId, records);
  }
  const rows = products.map(product => {
    const entry = familyByProduct.get(product.id);
    const configuration = entry?.configuration || {};
    const status = priceStatus(recordsByProduct.get(product.id) || [], product, configuration, now);
    return {
      productId: product.id, name: product.name,
      familyId: entry?.family.id || '', configuration,
      catalogueIdentity: createPriceIdentity(product, configuration),
      referenceKind: product.priceGHS ? 'Ghana retail reference' : product.priceCAD ? 'Canadian retail reference' : 'Manufacturer reference',
      referenceCurrency: product.priceGHS ? 'GHS' : product.priceCAD ? 'CAD' : product.priceOriginal?.currency || '',
      referenceAmount: product.priceGHS || product.priceCAD || product.priceOriginal?.amount || null,
      sourceUrl: product.sourceUrl, sourceAvailability: product.sourceAvailability || 'unverified',
      approvedSellingPrice: status === 'approved', priceStatus: status,
      requirements: status === 'approved' ? '' : requirements,
    };
  });
  const approved = new Set(rows.filter(row => row.approvedSellingPrice).map(row => row.productId));
  const productIds = new Set(products.map(product => product.id));
  const familyCoverage = families.map(family => ({
    id: family.id, name: family.name, options: family.variants.length,
    approvedOptions: family.variants.filter(variant => approved.has(variant.productId)).length,
    unpricedProductIds: family.variants.filter(variant => !approved.has(variant.productId)).map(variant => variant.productId),
  }));
  const summary = {
    products: products.length, approvedSellingPrices: approved.size, unpriced: products.length - approved.size,
    storedPriceRecords: selling.prices.length,
    rejectedPriceRecords: selling.prices.filter(price => !approved.has(price.productId)).length,
    orphanPriceRecords: selling.prices.filter(price => !productIds.has(price.productId)).length,
    referencesByCurrency: Object.fromEntries([...new Set(rows.map(row => row.referenceCurrency || 'unspecified'))].map(currency => [currency, rows.filter(row => (row.referenceCurrency || 'unspecified') === currency).length])),
    productFamilies: families.length, familyOptionRecords: familyByProduct.size,
    approvedFamilyOptions: [...familyByProduct.keys()].filter(id => approved.has(id)).length,
    fullyPricedFamilies: familyCoverage.filter(family => family.options > 0 && !family.unpricedProductIds.length).length,
    productsWithoutExplicitFamily: products.filter(product => !familyByProduct.has(product.id)).length,
  };
  return { checkedAt: new Date(now).toISOString(), summary, familyCoverage, rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args[0] !== '--require-priced' || args.length < 2 || args.slice(1).some(arg => arg.startsWith('--')))) {
    throw new Error('Usage: node scripts/audit-selling-price-inputs.mjs [--require-priced PRODUCT_ID ...]');
  }
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const report = buildSellingPriceAudit(read('data/products.json'), read('data/selling-prices.json'), read('data/product-families.json'));
  fs.mkdirSync('work/pricing', { recursive: true });
  fs.writeFileSync('work/pricing/catalogue-cost-input-audit.json', JSON.stringify(report, null, 2) + '\n');
  const columns = Object.keys(report.rows[0] || {});
  const cell = value => '"' + (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')).replaceAll('"', '""') + '"';
  fs.writeFileSync('work/pricing/catalogue-cost-input-gaps.csv', columns.join(',') + '\n' + report.rows.map(row => columns.map(column => cell(row[column])).join(',')).join('\n') + '\n');
  console.log(JSON.stringify(report.summary, null, 2));
  if (args[0] === '--require-priced') {
    const status = args.slice(1).map(productId => ({ productId, status: report.rows.find(row => row.productId === productId)?.priceStatus || 'unknown-product' }));
    console.log(JSON.stringify({ selectedPriceReadiness: status }, null, 2));
    if (status.some(row => row.status !== 'approved')) process.exitCode = 1;
  }
}
