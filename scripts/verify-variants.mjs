import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { importRetailerVariants } from './import-retailer-variants.mjs';
import { createPriceIdentity } from '../lib/price-identity.mjs';

const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const families = JSON.parse(fs.readFileSync('data/product-families.json', 'utf8'));
const require = createRequire(import.meta.url);
const compile = async (source, jsx = false) => {
  let js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
  } }).outputText;
  js = js.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
};

globalThis.__koraVariantTest = { products, families, createPriceIdentity };
const catalogue = await compile(fs.readFileSync('lib/catalogue.ts', 'utf8')
  .replace("import products from '../data/products.json';", 'const products = globalThis.__koraVariantTest.products;')
  .replace("import sellingPrices from '../data/selling-prices.json';", 'const sellingPrices = { prices: [] };')
  .replace("import productFamilyData from '../data/product-families.json';", 'const productFamilyData = globalThis.__koraVariantTest.families;')
  .replace("import { createPriceIdentity } from './price-identity.mjs';", 'const { createPriceIdentity } = globalThis.__koraVariantTest;'));
globalThis.__koraVariantTest.catalogue = catalogue;
const variants = await compile(fs.readFileSync('lib/product-variants.ts', 'utf8')
  .replace("import familyData from '../data/product-families.json';", 'const familyData = globalThis.__koraVariantTest.families;')
  .replace("import { catalogue, type Product } from './catalogue';", 'const { catalogue } = globalThis.__koraVariantTest.catalogue;'));
globalThis.__koraVariantTest.variants = variants;
const { default: ProductOptions } = await compile(fs.readFileSync('app/product-options.tsx', 'utf8')
  .replace("import { ghPrice, money } from '../lib/catalogue';", 'const { ghPrice, money } = globalThis.__koraVariantTest.catalogue;')
  .replace("import { getProductFamily, getProductOptionSnapshot, getVariantOptions, productHref } from '../lib/product-variants';", 'const { getProductFamily, getProductOptionSnapshot, getVariantOptions, productHref } = globalThis.__koraVariantTest.variants;')
  .replace("import './product-options.css';", ''), true);

const allIds = new Set(products.map(product => product.id));
const configuredIds = new Set();
const familyIds = new Set();
for (const family of families) {
  assert(!familyIds.has(family.id), `Duplicate family ${family.id}`);
  familyIds.add(family.id);
  assert(family.name && family.axes.length && family.variants.length > 1);
  assert.equal(new Set(family.axes).size, family.axes.length);
  const combinations = new Set();
  for (const variant of family.variants) {
    assert(allIds.has(variant.productId), `Unknown SKU ${variant.productId}`);
    assert(!configuredIds.has(variant.productId), `SKU in multiple families ${variant.productId}`);
    configuredIds.add(variant.productId);
    assert.deepEqual(Object.keys(variant.options).sort(), [...family.axes].sort());
    assert(Object.values(variant.options).every(value => typeof value === 'string' && value.trim()));
    const key = JSON.stringify(family.axes.map(axis => variant.options[axis]));
    assert(!combinations.has(key), `Ambiguous option combination in ${family.id}`);
    combinations.add(key);
    assert.equal(variants.resolveProductVariant(family.id, variant.options)?.id, variant.productId);
    assert.equal(variants.getProductFamily(variant.productId)?.id, family.id);
    assert.equal(variants.productOptionCount(variant.productId), family.variants.length);
    const snapshot = variants.getProductOptionSnapshot(variant.productId);
    assert.deepEqual(snapshot, variant.options);
    snapshot[family.axes[0]] = 'tampered';
    assert.notEqual(variants.getProductOptionSnapshot(variant.productId)[family.axes[0]], 'tampered');
    const html = renderToStaticMarkup(createElement(ProductOptions, { productId: variant.productId }));
    assert(html.includes('Choose your configuration'));
    if (family.variants.length <= 8) {
      assert(html.includes(`href="/product/${variant.productId}" aria-current="page"`));
      for (const sibling of family.variants) assert(html.includes(`href="/product/${sibling.productId}"`));
    } else {
      assert(html.includes(`<option value="${variant.productId}" selected=""`));
    }
    assert.equal(variants.resolveProductVariant(family.id, { ...variant.options, injected: 'extra' }), undefined);
    assert.equal(variants.resolveProductVariant(family.id, { ...variant.options, [family.axes[0]]: 'not-a-real-option' }), undefined);
  }
}

// These real families have sparse option matrices. A missing combination must stay missing.
assert.equal(variants.resolveProductVariant('apple-watch-series-12-black-aluminum-gps', { 'Case size': '46 mm', 'Band size': 'Small / Medium' }), undefined);
assert.equal(variants.resolveProductVariant('garmin-cirqa', { 'Band size': 'Small / Medium', Colour: 'Black' }), undefined);
assert.equal(variants.resolveProductVariant('not-a-family', {}), undefined);
assert.equal(variants.getProductFamily('not-a-product'), undefined);
assert.equal(variants.productOptionCount('not-a-product'), 0);
assert.equal(renderToStaticMarkup(createElement(ProductOptions, { productId: 'not-a-product' })), '');

// Price arithmetic preserves pesewas; freshness cannot be bypassed by future or invalid dates.
const now = Date.parse('2026-09-24T12:00:00Z');
const fresh = { priceGHS: 123.45, priceSource: 'Verified retailer', priceCheckedAt: '2026-09-24T00:00:00Z' };
assert.equal(catalogue.retailReferenceGhPrice(fresh, now), 123.45);
assert.equal(catalogue.ghPrice(fresh, now), null, 'A retailer reference is not an approved all-in selling price');
assert.equal(catalogue.ghanaPesewas(123.45), 12345);
assert.equal(catalogue.ghanaPesewas(0.29), 29);
assert.equal(catalogue.ghanaPesewas(100.005), null);
assert.equal(catalogue.ghanaPesewas(Number.MAX_SAFE_INTEGER), null);
assert.equal(catalogue.ghanaPesewas(-1), null);
assert.equal(catalogue.ghanaPesewas(Infinity), null);
assert.equal(catalogue.retailReferenceGhPrice({ ...fresh, priceCheckedAt: '2026-09-25' }, now), null);
assert.equal(catalogue.retailReferenceGhPrice({ ...fresh, priceCheckedAt: new Date(now - catalogue.GHANA_PRICE_VALIDITY_MS).toISOString() }, now), null);
assert.equal(catalogue.retailReferenceGhPrice({ ...fresh, priceCheckedAt: 'bad-date' }, now), null);
assert.equal(catalogue.retailReferenceGhPrice({ ...fresh, priceCheckedAt: '2026-09-31' }, Date.parse('2026-10-02T12:00:00Z')), null);
assert.equal(catalogue.retailReferenceGhPrice({ ...fresh, priceSource: ' ' }, now), null);
assert.equal(catalogue.retailReferenceGhPrice({ ...fresh, priceGHS: 0 }, now), null);
assert.equal(catalogue.ghPrice({ priceCAD: 12.34 }, now), null, 'Foreign price must never become a GHS offer');
assert(catalogue.money(123.45).endsWith('123.45'));
assert(catalogue.money(123).endsWith('123.00'));
assert.equal(catalogue.money(null), 'Price on request');

// A small synthetic feed tests ingestion boundaries without relying on a live retailer.
const seed = {
  id: 'test-phone', name: 'Test phone 12GB/256GB Black', brand: 'Test',
  department: 'phones', category: 'Smartphones', priceGHS: 100,
  priceSource: 'Test retailer', priceMetadataUrl: 'https://telefonika.com/products/test-phone.js',
  sourceUrl: 'https://telefonika.com/products/test-phone?variant=100',
  retailerVariantId: '100', retailerSku: 'TEST(12+256GB)BK',
  retailerProductTitle: 'Test phone', retailerVariantTitle: '12GB+256GB / Black',
  image: '/images/verified-test.png', description: 'Existing exact product.',
};
const feed = {
  productId: seed.id, url: seed.priceMetadataUrl, currency: 'GHS',
  data: {
    title: 'Test phone', options: [{ name: 'Capacity' }, { name: 'Color' }],
    variants: [
      { id: 100, title: '12GB+256GB / Black', sku: 'TEST(12+256GB)BK', price: 10000, available: true, options: ['12GB+256GB', 'Black'] },
      { id: 101, title: '12GB+512GB / Black', sku: 'TEST(12+512GB)BK', price: 15025, available: false, options: ['12GB+512GB', 'Black'], featured_image: { src: 'https://cdn.shopify.com/test-promo.jpg' } },
      { id: 102, title: '16GB+1TB / Black', sku: 'TEST(12+1TB)BK', price: 20000, available: true, options: ['16GB+1TB', 'Black'] },
    ],
  },
};
const imported = importRetailerVariants([seed], [], [feed], '2026-09-24T11:00:00Z', now);
assert.equal(imported.products.length, 2);
assert.equal(imported.quarantined.length, 1);
assert.equal(imported.quarantined[0].retailerVariantId, '102');
assert.equal(imported.products[0].id, seed.id, 'Existing bag/quote SKU remains stable');
const importedVariant = imported.products.find(product => product.id !== seed.id);
assert.equal(importedVariant.priceGHS, 150.25);
assert(importedVariant.sourceUrl.endsWith('variant=101'));
assert.equal(importedVariant.image, '/images/photo-under-review.svg', 'A promotion image is not automatically trusted');
assert.equal(importedVariant.imageVerificationStatus, 'under_review');
assert(importedVariant.sourceAvailability.includes('lists unavailable'));
assert.deepEqual(imported.families[0].axes, ['RAM', 'Storage', 'Colour']);
assert.deepEqual(imported.families[0].variants[1].options, { RAM: '12GB', Storage: '512GB', Colour: 'Black' });
const twice = importRetailerVariants(imported.products, imported.families, [feed], '2026-09-24T11:00:00Z', now);
assert.equal(twice.products.length, 2, 'Import is idempotent');
assert.equal(twice.families.length, 1);
assert.throws(() => importRetailerVariants([seed], [], [{ ...feed, currency: 'CAD' }], '2026-09-24T11:00:00Z', now), /GHS/);
assert.throws(() => importRetailerVariants([seed], [], [{ ...feed, url: 'https://evil.example/products/test-phone.js' }], '2026-09-24T11:00:00Z', now), /host/);
assert.throws(() => importRetailerVariants([seed], [], [{ ...feed, data: { ...feed.data, title: 'Different phone' } }], '2026-09-24T11:00:00Z', now), /identity/);
assert.throws(() => importRetailerVariants([seed], [], [feed], '2026-09-25T11:00:00Z', now), /timestamp/);
delete globalThis.__koraVariantTest;
console.log(`PASS: ${families.length} exact configuration families, ${configuredIds.size} selectable SKUs, invalid-combination rejection, rendered selection UI, GHS pesewa/freshness boundaries, and retailer importer identity/currency/conflict safeguards.`);
