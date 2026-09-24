// Generate an intentionally incomplete private draft: no assumed supplier costs or tax/FX defaults.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPriceIdentity } from '../lib/price-identity.mjs';

const evidence = () => ({ reference: '', checkedAt: '', validUntil: '' });
const money = currency => ({ amountMinor: null, currency, evidence: evidence() });

export function createSellingPriceTemplates({ products, families, productIds = [], familyId, sourcing }) {
  if (!['import', 'ghana-local'].includes(sourcing)) throw new Error('Explicitly choose the actual acquisition route: import or ghana-local');
  if (familyId && productIds.length) throw new Error('Choose product IDs or one family, not both');
  if (familyId) {
    const family = families.find(family => family.id === familyId);
    if (!family) throw new Error('Unknown product family');
    productIds = family.variants.map(variant => variant.productId);
  }
  if (!productIds.length || new Set(productIds).size !== productIds.length) throw new Error('Choose at least one unique exact product ID');
  const options = new Map(families.flatMap(family => family.variants.map(variant => [variant.productId, variant.options])));
  return productIds.map(productId => {
    const product = products.find(product => product.id === productId);
    if (!product) throw new Error(`Unknown product ID: ${productId}`);
    const configuration = { ...(options.get(productId) || {}) };
    return {
      schemaVersion: 1, productId, catalogueName: product.name,
      catalogueIdentity: createPriceIdentity(product, configuration), configuration, sourcing,
      approval: { approvedBy: '', evidence: evidence() },
      retailPrice: money(sourcing === 'ghana-local' ? 'GHS' : null),
      originalRetailFees: { treatment: null, charges: [], completenessEvidence: evidence() },
      fxRates: [],
      ...(sourcing === 'import' ? { shipment: {
        countryOfOrigin: null, hsCode: null,
        freight: money(null), insurance: money(null),
        customsAssessment: { customsValueGhsMinor: null, charges: [], allDutiesTaxesAndLeviesIncluded: null, evidence: evidence() },
      } } : {}),
      additionalCosts: { charges: [], completenessEvidence: evidence() },
      sellingTax: { treatment: null, evidence: evidence() },
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), productIds = [];
  let sourcing, familyId;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Every flag needs a value');
    if (flag === '--product') productIds.push(value);
    else if (flag === '--family' && !familyId) familyId = value;
    else if (flag === '--sourcing' && !sourcing) sourcing = value;
    else throw new Error(`Unknown or repeated flag: ${flag}`);
  }
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const draft = createSellingPriceTemplates({ products: read('data/products.json'), families: read('data/product-families.json'), productIds, familyId, sourcing });
  fs.mkdirSync('work/pricing', { recursive: true });
  const output = 'work/pricing/merchant-costs.template.json';
  // Never erase cost entries a merchant has already started completing.
  fs.writeFileSync(output, JSON.stringify(draft, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, exactSkuDrafts: draft.length, status: 'INCOMPLETE: fill verified per-unit costs, evidence, output-tax policy and approval before previewing. No public prices changed.', instructions: 'docs/PRICING-LAUNCH-HANDOFF.md' }, null, 2));
}
