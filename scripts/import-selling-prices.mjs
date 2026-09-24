// node scripts/import-selling-prices.mjs PRIVATE_INPUT_JSON [--apply]
// Inputs and audit details remain in ignored work/pricing; only final prices are published.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateSellingPrice } from '../lib/landed-pricing.mjs';
import { createPriceIdentity } from '../lib/price-identity.mjs';

export function prepareSellingPriceImport(inputs, products, families, now = Date.now()) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('Supply at least one complete merchant-approved cost record');
  const catalogue = new Map(products.map(product => [product.id, product]));
  const options = new Map(families.flatMap(family => family.variants.map(variant => [variant.productId, variant.options])));
  const seen = new Set();
  const results = [];
  const canonicalOptions = values => JSON.stringify(Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b)));
  for (const input of inputs) {
    const product = catalogue.get(input.productId);
    if (!product || input.catalogueName !== product.name) throw new Error('Product identity must match the current exact catalogue record');
    if (seen.has(input.productId)) throw new Error('Duplicate product cost record');
    seen.add(input.productId);
    if (canonicalOptions(input.configuration) !== canonicalOptions(options.get(input.productId))) throw new Error('Cost configuration does not match the exact selected product');
    const currentIdentity = createPriceIdentity(product, options.get(input.productId) || {});
    if (input.catalogueIdentity !== currentIdentity) throw new Error('Cost approval belongs to a different catalogue identity; review the corrected SKU before importing');
    const result = calculateSellingPrice(input, now);
    // Bind the approval to the full current public SKU identity, not just its enduring URL ID.
    result.publicPrice.identity = currentIdentity;
    results.push(result);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error('Pass the private merchant cost input JSON file');
  const results = prepareSellingPriceImport(
    JSON.parse(fs.readFileSync(inputFile, 'utf8')),
    JSON.parse(fs.readFileSync('data/products.json', 'utf8')),
    JSON.parse(fs.readFileSync('data/product-families.json', 'utf8')),
  );
  fs.mkdirSync('work/pricing', { recursive: true });
  fs.writeFileSync('work/pricing/last-import-preview.json', JSON.stringify(results, null, 2) + '\n');
  if (process.argv.includes('--apply')) {
    const current = JSON.parse(fs.readFileSync('data/selling-prices.json', 'utf8'));
    const prices = new Map(current.prices.map(price => [price.productId, price]));
    for (const result of results) prices.set(result.publicPrice.productId, result.publicPrice);
    const target = 'data/selling-prices.json';
    fs.writeFileSync(target + '.tmp', JSON.stringify({ schemaVersion: 1, prices: [...prices.values()] }, null, 2) + '\n');
    fs.renameSync(target + '.tmp', target);
  }
  console.log(JSON.stringify({ applied: process.argv.includes('--apply'), approvedPrices: results.length, publicFields: Object.keys(results[0].publicPrice), privateAudit: 'work/pricing/last-import-preview.json' }, null, 2));
}
