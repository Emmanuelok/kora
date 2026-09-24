import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSellingPriceTemplates } from './create-selling-price-template.mjs';
import { buildSellingPriceAudit } from './audit-selling-price-inputs.mjs';
import { prepareSellingPriceImport } from './import-selling-prices.mjs';

// Entirely synthetic supplier costs and products; never imported into the live catalogue.
const now = Date.parse('2026-09-24T12:00:00Z');
const products = [
  { id: 'test-256', name: 'Test phone 256GB', brand: 'Fixture', priceGHS: 90, sourceUrl: 'https://supplier.example/256' },
  { id: 'test-512', name: 'Test phone 512GB', brand: 'Fixture', priceCAD: 110, sourceUrl: 'https://supplier.example/512' },
];
const families = [{ id: 'test-phone', name: 'Test phone', variants: [
  { productId: 'test-256', options: { Storage: '256GB' } },
  { productId: 'test-512', options: { Storage: '512GB' } },
] }];
const localDrafts = createSellingPriceTemplates({ products, families, familyId: 'test-phone', sourcing: 'ghana-local' });
assert.equal(localDrafts.length, 2);
assert.equal(localDrafts[0].retailPrice.amountMinor, null, 'Never seed an actual acquisition amount from a retail reference');
assert.equal(localDrafts[0].retailPrice.currency, 'GHS');
assert.deepEqual(localDrafts[1].configuration, { Storage: '512GB' });
assert.notEqual(localDrafts[0].catalogueIdentity, localDrafts[1].catalogueIdentity);
assert(!('shipment' in localDrafts[0]));
assert.throws(() => prepareSellingPriceImport(localDrafts, products, families, now));
const imports = createSellingPriceTemplates({ products, families, productIds: ['test-256'], sourcing: 'import' });
assert.equal(imports[0].shipment.customsAssessment.allDutiesTaxesAndLeviesIncluded, null);
assert.equal(imports[0].shipment.freight.amountMinor, null);
assert.equal(imports[0].retailPrice.currency, null);
assert.deepEqual(imports[0].fxRates, []);
assert.throws(() => prepareSellingPriceImport(imports, products, families, now));
assert.throws(() => createSellingPriceTemplates({ products, families, productIds: ['test-256'] }), /acquisition route/);
assert.throws(() => createSellingPriceTemplates({ products, families, productIds: ['unknown'], sourcing: 'import' }), /Unknown product/);
assert.throws(() => createSellingPriceTemplates({ products, families, familyId: 'unknown', sourcing: 'import' }), /Unknown product family/);
assert.throws(() => createSellingPriceTemplates({ products, families, productIds: ['test-256', 'test-256'], sourcing: 'import' }), /unique/);
assert.throws(() => createSellingPriceTemplates({ products, families, productIds: ['test-256'], familyId: 'test-phone', sourcing: 'import' }), /not both/);

const evidence = { reference: 'Synthetic fixture evidence', checkedAt: '2026-09-24T10:00:00Z', validUntil: '2026-09-25T10:00:00Z' };
const complete = structuredClone(localDrafts[0]);
complete.approval = { approvedBy: 'Fixture owner', evidence };
complete.retailPrice = { amountMinor: 10000, currency: 'GHS', evidence };
complete.originalRetailFees = { treatment: 'included-in-retail-price', charges: [], completenessEvidence: evidence };
complete.additionalCosts = { charges: [], completenessEvidence: evidence };
complete.sellingTax = { treatment: 'no-additional-tax-due', evidence };
const price = prepareSellingPriceImport([complete], products, families, now)[0].publicPrice;
assert.equal(price.amountMinor, 12000);
assert.equal(localDrafts[1].approval.evidence.reference, '', 'Completing one option cannot approve its siblings');
const audit = (prices, catalogue = products, groups = families, at = now) => buildSellingPriceAudit(catalogue, { schemaVersion: 1, prices }, groups, at);
const partial = audit([price]);
assert.equal(partial.summary.approvedSellingPrices, 1);
assert.equal(partial.summary.unpriced, 1);
assert.equal(partial.summary.approvedFamilyOptions, 1);
assert.equal(partial.summary.fullyPricedFamilies, 0);
assert.deepEqual(partial.familyCoverage[0].unpricedProductIds, ['test-512']);
assert.equal(audit([]).summary.approvedSellingPrices, 0, 'Local reference prices do not qualify as final offers');
assert.equal(audit([price], [{ ...products[0], name: 'Corrected model' }, products[1]]).rows[0].priceStatus, 'identity-mismatch');
const corrected = structuredClone(families); corrected[0].variants[0].options.Storage = '1TB';
assert.equal(audit([price], products, corrected).rows[0].priceStatus, 'identity-mismatch');
assert.equal(audit([{ ...price, amountMinor: null }]).rows[0].priceStatus, 'invalid-amount-or-revision');
assert.equal(audit([{ ...price, currency: 'USD' }]).rows[0].priceStatus, 'invalid-currency-or-policy');
assert.equal(audit([{ ...price, privateAudit: {} }]).rows[0].priceStatus, 'unexpected-public-fields');
assert.equal(audit([{ ...price, verifiedAt: '2026-09-24T13:00:00Z' }]).rows[0].priceStatus, 'future-verification');
assert.equal(audit([price], products, families, Date.parse(price.validUntil)).rows[0].priceStatus, 'expired');
assert.equal(audit([price, price]).rows[0].priceStatus, 'duplicate-price-records');
assert.equal(audit([{ ...price, productId: 'orphan' }]).summary.orphanPriceRecords, 1);
assert.equal(audit([{ ...price, productId: 'orphan' }]).summary.approvedSellingPrices, 0);

// Exercise real CLIs in an isolated private fixture checkout: drafts cannot clobber a merchant's work.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kora-pricing-workflow-'));
try {
  fs.mkdirSync(path.join(tmp, 'data'));
  for (const [name, value] of Object.entries({ products, 'product-families': families, 'selling-prices': { schemaVersion: 1, prices: [] } })) {
    fs.writeFileSync(path.join(tmp, `data/${name}.json`), JSON.stringify(value));
  }
  const run = (script, args) => spawnSync(process.execPath, [path.resolve(`scripts/${script}`), ...args], { cwd: tmp, encoding: 'utf8' });
  const args = ['--product', 'test-256', '--sourcing', 'ghana-local'];
  assert.equal(run('create-selling-price-template.mjs', args).status, 0);
  const output = path.join(tmp, 'work/pricing/merchant-costs.template.json');
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  fs.writeFileSync(output, 'Merchant has started editing');
  assert.notEqual(run('create-selling-price-template.mjs', args).status, 0);
  assert.equal(fs.readFileSync(output, 'utf8'), 'Merchant has started editing');
  assert.equal(run('audit-selling-price-inputs.mjs', []).status, 0, 'Quotation-first audit does not require every catalogue item to be priced');
  assert.equal(run('audit-selling-price-inputs.mjs', ['--require-priced', 'test-256']).status, 1);
  fs.writeFileSync(path.join(tmp, 'data/selling-prices.json'), JSON.stringify({ schemaVersion: 1, prices: [{ ...price, verifiedAt: new Date(Date.now() - 10000).toISOString(), validUntil: new Date(Date.now() + 60000).toISOString() }] }));
  assert.equal(run('audit-selling-price-inputs.mjs', ['--require-priced', 'test-256']).status, 0, 'A selected ready SKU need not wait for unrelated catalogue items');
  assert.equal(run('audit-selling-price-inputs.mjs', ['--require-priced', 'test-512']).status, 1);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('PASS: exact-SKU private drafts, null costs rejected, explicit acquisition route, separate option approvals, identity-aware readiness, partial-family reporting, curated price gates, and draft overwrite protection.');
