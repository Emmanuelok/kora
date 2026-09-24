import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { calculateSellingPrice } from '../lib/landed-pricing.mjs';
import { prepareSellingPriceImport } from './import-selling-prices.mjs';
import { createPriceIdentity } from '../lib/price-identity.mjs';

// All numbers below are synthetic unit-test costs, not Ghana tariff or exchange-rate defaults.
const now = Date.parse('2026-09-24T12:00:00Z');
const proof = reference => ({ reference, checkedAt: '2026-09-24T10:00:00Z', validUntil: '2026-09-25T10:00:00Z' });
const amount = (amountMinor, currency = 'GHS') => ({ amountMinor, currency, evidence: proof('Synthetic test invoice') });
const base = {
  schemaVersion: 1, productId: 'test-sku', catalogueName: 'Test exact product', configuration: { Storage: '256GB' },
  catalogueIdentity: createPriceIdentity({ id: 'test-sku', name: 'Test exact product' }, { Storage: '256GB' }),
  sourcing: 'ghana-local', approval: { approvedBy: 'Test fixture', evidence: proof('Test approval') },
  retailPrice: amount(10000), originalRetailFees: { treatment: 'included-in-retail-price', charges: [], completenessEvidence: proof('Test checkout') },
  additionalCosts: { charges: [], completenessEvidence: proof('No extra costs in this fixture') },
  fxRates: [], sellingTax: { treatment: 'no-additional-tax-due', evidence: proof('Synthetic tax policy') },
};
const local = calculateSellingPrice(base, now);
assert.equal(local.publicPrice.amountMinor, 12000, '20% markup is cost × 1.20, not a 20% margin');
assert.equal(local.privateAudit.landedCostGhsMinor, 10000);
assert.equal(local.privateAudit.markupGhsMinor, 2000);
assert.deepEqual(Object.keys(local.publicPrice).sort(), ['amountMinor', 'currency', 'identity', 'policy', 'productId', 'revision', 'validUntil', 'verifiedAt'].sort());
assert(!JSON.stringify(local.publicPrice).includes('Synthetic'));
assert(!JSON.stringify(local.publicPrice).includes('markup'));

const imported = {
  ...base, sourcing: 'import', retailPrice: amount(10000, 'USD'),
  originalRetailFees: { treatment: 'itemized', charges: [{ id: 'checkout-fee', label: 'Test original fee', amount: amount(500, 'USD') }], completenessEvidence: proof('Test complete fees') },
  fxRates: [{ currency: 'USD', ghsPerCurrencyUnit: { numerator: 10, denominator: 1 }, evidence: proof('Synthetic FX, not a real rate') }],
  shipment: { countryOfOrigin: 'US', hsCode: '000000', freight: amount(2000, 'USD'), insurance: amount(500, 'USD'),
    customsAssessment: { customsValueGhsMinor: 130000, charges: [{ id: 'assessed-taxes', label: 'Test assessed taxes', amount: amount(20000) }], allDutiesTaxesAndLeviesIncluded: true, evidence: proof('Test exact customs assessment') } },
  additionalCosts: { charges: [{ id: 'clearance', label: 'Test clearance allocation', amount: amount(5000) }], completenessEvidence: proof('Test complete additional costs') },
};
const importPrice = calculateSellingPrice(imported, now);
assert.equal(importPrice.privateAudit.landedCostGhsMinor, 155000);
assert.equal(importPrice.publicPrice.amountMinor, 186000);
assert.equal(importPrice.privateAudit.components.length, 6);
const outputTax = calculateSellingPrice({ ...base, sellingTax: {
  treatment: 'additional-on-marked-up-cost', rates: [{ id: 'test-a', label: 'Synthetic tax A', numerator: 1, denominator: 10 }, { id: 'test-b', label: 'Synthetic tax B', numerator: 1, denominator: 20 }], evidence: proof('Test same-base output-tax policy'),
} }, now);
assert.equal(outputTax.publicPrice.amountMinor, 13800, 'Explicit output rates share the marked-up base; no assumed compounding');
const yen = structuredClone(imported);
yen.retailPrice = amount(10000, 'JPY'); yen.originalRetailFees = base.originalRetailFees;
yen.fxRates = [{ currency: 'JPY', ghsPerCurrencyUnit: { numerator: 1, denominator: 20 }, evidence: proof('Synthetic JPY rate') }];
yen.shipment.freight = amount(0); yen.shipment.insurance = amount(0); yen.shipment.customsAssessment.charges = []; yen.additionalCosts = base.additionalCosts;
assert.equal(calculateSellingPrice(yen, now).publicPrice.amountMinor, 60000, 'JPY source amounts have zero decimal minor units');
assert.equal(calculateSellingPrice({ ...base, retailPrice: amount(3) }, now).publicPrice.amountMinor, 4, 'Pesewas round half-up after markup');

assert.throws(() => calculateSellingPrice({ ...base, sellingTax: undefined }, now));
assert.throws(() => calculateSellingPrice({ ...base, originalRetailFees: undefined }, now));
assert.throws(() => calculateSellingPrice({ ...base, shipment: imported.shipment }, now), /Unrecognized key/);
assert.throws(() => calculateSellingPrice({ ...base, retailPrice: amount(10000, 'USD') }, now), /FX missing/);
assert.throws(() => calculateSellingPrice({ ...imported, fxRates: [] }, now), /FX missing/);
assert.throws(() => calculateSellingPrice({ ...imported, shipment: { ...imported.shipment, insurance: undefined } }, now));
assert.throws(() => calculateSellingPrice({ ...base, originalRetailFees: { ...base.originalRetailFees, charges: imported.originalRetailFees.charges } }, now), /cannot be added again/);
const stale = structuredClone(base); stale.approval.evidence.validUntil = '2026-09-24T11:59:59Z';
assert.throws(() => calculateSellingPrice(stale, now), /Stale/);
const future = structuredClone(base); future.retailPrice.evidence.checkedAt = '2026-09-24T13:00:00Z';
assert.throws(() => calculateSellingPrice(future, now), /future/);
const earlierExpiry = structuredClone(base); earlierExpiry.retailPrice.evidence.validUntil = '2026-09-24T13:00:00Z';
assert.equal(calculateSellingPrice(earlierExpiry, now).publicPrice.validUntil, '2026-09-24T13:00:00.000Z');
assert.throws(() => calculateSellingPrice({ ...base, markup: 0.3 }, now), /Unrecognized key/);

const fixtureProducts = [{ id: 'test-sku', name: 'Test exact product' }];
const fixtureFamilies = [{ variants: [{ productId: 'test-sku', options: { Storage: '256GB' } }] }];
assert.equal(prepareSellingPriceImport([base], fixtureProducts, fixtureFamilies, now).length, 1);
assert.throws(() => prepareSellingPriceImport([{ ...base, catalogueName: 'Other model' }], fixtureProducts, fixtureFamilies, now), /identity/);
assert.throws(() => prepareSellingPriceImport([{ ...base, configuration: { Storage: '512GB' } }], fixtureProducts, fixtureFamilies, now), /configuration/);
assert.throws(() => prepareSellingPriceImport([base, base], fixtureProducts, fixtureFamilies, now), /Duplicate/);

const source = fs.readFileSync('lib/catalogue.ts', 'utf8')
  .replace("import products from '../data/products.json';", 'const products = [];')
  .replace("import sellingPrices from '../data/selling-prices.json';", 'const sellingPrices = { prices: [] };')
  .replace("import productFamilyData from '../data/product-families.json';", 'const productFamilyData = globalThis.__koraSellingPriceTest.families;')
  .replace("import { createPriceIdentity } from './price-identity.mjs';", 'const { createPriceIdentity } = globalThis.__koraSellingPriceTest;');
globalThis.__koraSellingPriceTest = { families: fixtureFamilies, createPriceIdentity };
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { ghPrice, retailReferenceGhPrice } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const product = { ...fixtureProducts[0], sellingPrice: local.publicPrice };
assert.equal(ghPrice(product, now), 120);
assert.equal(ghPrice(product, Date.parse(local.publicPrice.validUntil)), null);
assert.equal(ghPrice({ ...product, id: 'other-sku' }, now), null);
assert.equal(ghPrice({ ...product, name: 'Different model at the same URL' }, now), null);
assert.equal(ghPrice({ ...product, model: 'different-model' }, now), null);
assert.equal(ghPrice({ ...product, condition: 'Refurbished' }, now), null);
assert.equal(ghPrice({ ...product, retailerSku: 'changed-supplier-sku' }, now), null);
assert.equal(ghPrice({ ...product, sourceUrl: 'https://different-supplier.example/item' }, now), null);
fixtureFamilies[0].variants[0].options.Storage = '512GB';
assert.equal(ghPrice(product, now), null, 'Same-ID configuration correction invalidates its old approved price');
fixtureFamilies[0].variants[0].options.Storage = '256GB';
assert.equal(ghPrice(product, now), 120);
assert.equal(ghPrice({ ...product, sellingPrice: { ...local.publicPrice, identity: undefined } }, now), null);
assert.equal(ghPrice({ ...product, sellingPrice: { ...local.publicPrice, amountMinor: 12000.5 } }, now), null);
assert.equal(ghPrice({ ...product, sellingPrice: { ...local.publicPrice, verifiedAt: '2026-09-24T13:00:00Z' } }, now), null);
const referenceOnly = { priceGHS: 100, priceSource: 'Test retailer', priceCheckedAt: '2026-09-24' };
assert.equal(retailReferenceGhPrice(referenceOnly, now), 100);
assert.equal(ghPrice(referenceOnly, now), null, 'No retail-reference fallback for customer selling prices');
assert.equal(ghPrice({ priceCAD: 100 }, now), null);
const fullIdentityProduct = { ...fixtureProducts[0], brand: 'Test brand', model: 'Model A', condition: 'New', retailerSku: 'SUPPLIER-256', retailerVariantId: '123', sourceUrl: 'https://supplier.example/123' };
assert.throws(() => prepareSellingPriceImport([base], [fullIdentityProduct], fixtureFamilies, now), /different catalogue identity/, 'Re-importing an old cost approval cannot bless a corrected same-ID model or condition');
const reapproved = { ...base, catalogueIdentity: createPriceIdentity(fullIdentityProduct, { Storage: '256GB' }) };
const fullyBound = prepareSellingPriceImport([reapproved], [fullIdentityProduct], fixtureFamilies, now)[0];
assert.equal(ghPrice({ ...fullIdentityProduct, sellingPrice: fullyBound.publicPrice }, now), 120);
assert.equal(ghPrice({ ...fullIdentityProduct, retailerVariantId: '124', sellingPrice: fullyBound.publicPrice }, now), null);
assert.equal(createPriceIdentity(fullIdentityProduct, { Storage: '256GB', Colour: 'Black' }), createPriceIdentity(fullIdentityProduct, { Colour: 'Black', Storage: '256GB' }), 'Option key order is not identity');
delete globalThis.__koraSellingPriceTest;
console.log('PASS: exact SKU cost inputs, original-fee treatment, local/import separation, explicit FX and customs, JPY precision, 20% markup, explicit output tax, expiry, private/public separation, and no reference-price fallback.');
