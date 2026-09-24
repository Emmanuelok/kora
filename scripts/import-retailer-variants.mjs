// Read-only by default. Usage: node scripts/import-retailer-variants.mjs SOURCE_DIRECTORY [--apply]
// manifest.json: {fetchedAt, sources:[{productId,url,currency:'GHS',file:'PRODUCT_ID.json'}]}
// Currency must be verified from the retailer storefront; product JSON alone does not declare it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const trustedHosts = new Set(['telefonika.com', 'compughana.com', 'www.compughana.com']);
const rejectedOffer = /deposit|pre.?order fee|reservation fee|down.?payment|instalment/i;

export function importRetailerVariants(products, existingFamilies, sources, checkedAt, now = Date.now()) {
  const checked = Date.parse(checkedAt);
  assert(Number.isFinite(checked) && checked <= now && now - checked < 14 * 86400000, 'Fresh, non-future source timestamp required');
  const byId = new Map(products.map(product => [product.id, product]));
  const families = new Map(existingFamilies.map(family => [family.id, family]));
  const seenSources = new Set();
  const changes = [];
  const imageMappings = [];
  const quarantined = [];

  for (const source of sources) {
    const base = byId.get(source.productId);
    assert(base?.priceMetadataUrl && base.retailerVariantId, 'Source must match an existing verified Ghana retailer product');
    assert(!seenSources.has(source.productId), 'Duplicate source');
    seenSources.add(source.productId);
    const url = new URL(source.url);
    assert(url.protocol === 'https:' && trustedHosts.has(url.hostname), 'Unapproved source host');
    assert(source.url === base.priceMetadataUrl, 'Source URL does not match the existing product');
    assert(source.currency === 'GHS', 'Verified retailer currency GHS is required');
    const data = source.data;
    assert(data?.title === base.retailerProductTitle, 'Retailer product identity changed; re-verify manually');
    assert(!rejectedOffer.test(data.title), 'Deposit or instalment is not a selling price');
    assert(Array.isArray(data.variants) && data.variants.length > 0, 'Missing retailer variants');
    const defaultVariant = data.variants.find(variant => String(variant.id) === String(base.retailerVariantId));
    assert(defaultVariant?.title === base.retailerVariantTitle && (defaultVariant.sku || '') === (base.retailerSku || ''), 'Existing exact variant identity changed');
    assert(defaultVariant.price / 100 >= base.priceGHS * 0.6 && defaultVariant.price / 100 <= base.priceGHS * 1.5, 'Large default price change requires manual verification');
    const optionNames = (data.options || []).map(option => typeof option === 'string' ? option : option.name);
    assert(optionNames.length > 0 && optionNames.length <= 3 && optionNames.every(name => typeof name === 'string' && name.trim()), 'Invalid retailer option names');
    assert(new Set(optionNames).size === optionNames.length, 'Duplicate option names');
    const familyId = `${url.hostname.replace(/^www\./, '').split('.')[0]}-${path.basename(url.pathname, '.js')}`;
    const familyVariants = [];
    const combinations = new Set();
    const seenVariantIds = new Set();

    for (const variant of data.variants) {
      const variantId = String(variant.id);
      assert(/^\d+$/.test(variantId) && !seenVariantIds.has(variantId), 'Invalid or duplicate variant identity');
      seenVariantIds.add(variantId);
      assert(Number.isSafeInteger(variant.price) && variant.price > 0, 'Exact positive price in pesewas required');
      assert(typeof variant.title === 'string' && !rejectedOffer.test(variant.title), 'Invalid full-price variant title');
      assert(typeof variant.available === 'boolean', 'Explicit retailer availability required');
      const capacityMemory = variant.title.match(/(\d+)GB\+(\d+)(GB|TB)/i);
      const skuMemory = (variant.sku || '').match(/\((\d+)\+(\d+)(GB|TB)\)/i);
      if (capacityMemory && skuMemory && capacityMemory.slice(1).join('|').toUpperCase() !== skuMemory.slice(1).join('|').toUpperCase()) {
        assert(variantId !== String(base.retailerVariantId), 'Existing default configuration conflicts with its SKU');
        quarantined.push({ productId: base.id, retailerVariantId: variantId, title: variant.title, sku: variant.sku, reason: 'Retailer option RAM/storage conflicts with the exact SKU. Supplier verification required.' });
        continue;
      }
      const values = variant.options || optionNames.map((_, index) => variant[`option${index + 1}`]);
      assert(Array.isArray(values) && values.length === optionNames.length && values.every(value => typeof value === 'string' && value.trim()), 'Complete source-listed combination required');
      const key = JSON.stringify(values);
      assert(!combinations.has(key), 'Ambiguous retailer configuration');
      combinations.add(key);
      const options = Object.fromEntries(optionNames.map((name, index) => [name, values[index]]));
      const isDefault = variantId === String(base.retailerVariantId);
      const productId = isDefault ? base.id : `gh-${familyId}-${variantId}`;
      const previous = byId.get(productId);
      const sourceUrl = new URL(base.sourceUrl);
      sourceUrl.searchParams.set('variant', variantId);
      let imageSource;
      const candidate = variant.featured_image?.src;
      if (typeof candidate === 'string') {
        const imageUrl = new URL(candidate.startsWith('//') ? 'https:' + candidate : candidate);
        if (imageUrl.protocol === 'https:' && imageUrl.hostname === 'cdn.shopify.com') imageSource = imageUrl.href;
      }
      const record = {
        ...(isDefault ? base : previous || {}),
        id: productId,
        name: isDefault ? base.name : `${data.title} — ${variant.title}`,
        brand: base.brand, department: base.department, category: base.category,
        priceCAD: 0, regularPriceCAD: 0, priceGHS: variant.price / 100,
        priceSource: base.priceSource, priceCheckedAt: new Date(checked).toISOString().slice(0, 10),
        priceType: 'ghana-retail-reference', priceMetadataUrl: source.url,
        retailerVariantId: variantId, retailerSku: variant.sku || null,
        retailerProductTitle: data.title, retailerVariantTitle: variant.title,
        sourceAvailability: variant.available ? 'Retailer lists available; not KORA stock' : 'Retailer lists unavailable; not KORA stock',
        model: variant.sku || (isDefault ? base.model : undefined), condition: base.condition,
        sourceUrl: sourceUrl.href,
        description: isDefault ? base.description : `${data.title}. Exact retailer configuration: ${variant.title}. Ghana retail reference from ${base.priceSource}; final KORA price and availability confirmed by quotation.`,
        image: isDefault ? base.image : previous?.image || '/images/photo-under-review.svg',
        imageSource: isDefault ? base.imageSource : previous?.imageSource,
      };
      if (!isDefault && !previous?.image) {
        record.imageVerificationStatus = 'under_review';
        record.imageVerificationNote = 'Exact configuration imagery is awaiting review. Retailer promotional graphics and mismatched model photographs are withheld.';
      }
      byId.set(productId, record);
      familyVariants.push({ productId, options });
      imageMappings.push({ productId, baseProductId: base.id, retailerVariantId: variantId, options, imageSource: imageSource || null, sourceUrl: sourceUrl.href });
      changes.push({ productId, retailerVariantId: variantId, priceGHS: record.priceGHS, title: variant.title, created: !previous });
    }
    let axes = [...optionNames];
    const combinedCapacity = familyVariants.every(variant => /^\d+GB\+\d+(GB|TB)$/i.test(variant.options.Capacity || ''));
    const storageCapacity = familyVariants.every(variant => /^\d+(GB|TB)$/i.test(variant.options.Capacity || ''));
    if (combinedCapacity || storageCapacity) {
      axes = axes.flatMap(axis => axis === 'Capacity' ? combinedCapacity ? ['RAM', 'Storage'] : ['Storage'] : [axis]);
      for (const variant of familyVariants) {
        const capacity = variant.options.Capacity;
        delete variant.options.Capacity;
        if (combinedCapacity) {
          const [ram, storage] = capacity.split('+');
          variant.options.RAM = ram;
          variant.options.Storage = storage;
        } else variant.options.Storage = capacity;
      }
    }
    for (const colour of ['Color', 'Colours']) {
      if (axes.includes(colour)) {
        axes = axes.map(axis => axis === colour ? 'Colour' : axis);
        for (const variant of familyVariants) {
          variant.options.Colour = variant.options[colour];
          delete variant.options[colour];
        }
      }
    }
    if (familyVariants.length > 1) families.set(familyId, {
      id: familyId, name: data.title, axes,
      evidence: { kind: 'exact-retailer-variant-json', checkedAt: new Date(checked).toISOString(), sourceUrl: source.url },
      variants: familyVariants,
    });
  }
  return { products: [...byId.values()], families: [...families.values()], changes, imageMappings, quarantined };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  assert(directory, 'Pass the source directory containing manifest.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert(Array.isArray(manifest.sources) && manifest.sources.length, 'A source manifest is required');
  const sources = manifest.sources.map(source => {
    assert(path.basename(source.file) === source.file, 'Source files must remain inside the evidence directory');
    return { ...source, data: JSON.parse(fs.readFileSync(path.join(directory, source.file), 'utf8')) };
  });
  const result = importRetailerVariants(
    JSON.parse(fs.readFileSync('data/products.json', 'utf8')),
    JSON.parse(fs.readFileSync('data/product-families.json', 'utf8')),
    sources, manifest.fetchedAt,
  );
  fs.writeFileSync(path.join(directory, 'variant-import-preview.json'), JSON.stringify(result, null, 2) + '\n');
  if (process.argv.includes('--apply')) {
    fs.writeFileSync('data/products.json', JSON.stringify(result.products));
    fs.writeFileSync('data/product-families.json', JSON.stringify(result.families, null, 2) + '\n');
    fs.writeFileSync('data/variant-import-result.json', JSON.stringify({ checkedAt: manifest.fetchedAt, changes: result.changes, imageMappings: result.imageMappings, quarantined: result.quarantined }, null, 2) + '\n');
    fs.writeFileSync('data/variant-source-evidence.json', JSON.stringify({
      checkedAt: manifest.fetchedAt,
      sources: sources.map(source => ({
        productId: source.productId, url: source.url, currency: source.currency,
        currencyEvidence: source.currencyEvidence, title: source.data.title, options: source.data.options,
        variants: source.data.variants.map(variant => ({
          id: String(variant.id), sku: variant.sku || null, title: variant.title,
          priceMinor: variant.price, available: variant.available,
          options: variant.options, featuredImage: variant.featured_image?.src || null,
        })),
      })),
    }, null, 2) + '\n');
  }
  console.log(JSON.stringify({ applied: process.argv.includes('--apply'), variantsChecked: result.changes.length, productsAdded: result.changes.filter(change => change.created).length, quarantined: result.quarantined.length, families: result.families.length, products: result.products.length }, null, 2));
}
