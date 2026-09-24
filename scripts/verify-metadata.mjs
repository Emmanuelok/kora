import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { mergeMetadataEntries, postProcessMetadata, renderMetadataToHtml } from 'vinext/shims/metadata';

const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const departments = JSON.parse(fs.readFileSync('data/departments.json', 'utf8'));
globalThis.__koraMetadataTest = { products, departments };
const source = fs.readFileSync('lib/site-metadata.ts', 'utf8')
  .replace("import { catalogue, type Product } from './catalogue';", 'const catalogue = globalThis.__koraMetadataTest.products;')
  .replace("import departmentNames from '../data/departments.json';", 'const departmentNames = globalThis.__koraMetadataTest.departments;');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { metadataForRoute, rootMetadata, resolveSiteOrigin, SITE_ORIGIN, SITE_TITLE, socialImage } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
delete globalThis.__koraMetadataTest;

const origin = 'https://kora.eo-kingsford.workers.dev';
const render = (segments, query = {}) => {
  const metadata = metadataForRoute(segments, query);
  const resolved = postProcessMetadata(mergeMetadataEntries([{ metadata: rootMetadata }, { metadata, isPage: true }]));
  return { metadata, html: renderMetadataToHtml(resolved, '/' + segments.join('/')) };
};

// The canonical cannot inherit an arbitrary request host or an unsafe deployment override.
assert.equal(resolveSiteOrigin(), origin);
assert.equal(resolveSiteOrigin('https://shop.kora.example/'), 'https://shop.kora.example');
for (const invalid of ['http://kora.example', 'https://user:pass@kora.example', 'https://kora.example/path', 'https://kora.example?x=1', 'https://kora.example/#hash', 'https://localhost', 'https://127.0.0.1', 'https://kora.localhost', 'https://kora.example:8443', '//kora.example', 'javascript:alert(1)']) {
  assert.equal(resolveSiteOrigin(invalid), origin, invalid);
}

const home = render([]);
assert(home.html.includes(`<title>${SITE_TITLE}</title>`));
assert(home.html.includes(`rel="canonical" href="${SITE_ORIGIN}"`) || home.html.includes(`rel="canonical" href="${SITE_ORIGIN}/"`));
for (const [name, value] of [
  ['og:type', 'website'], ['og:locale', 'en_GH'], ['og:image', socialImage.url],
  ['og:image:width', '1200'], ['og:image:height', '630'],
]) assert(home.html.includes(`property="${name}" content="${value}"`));
assert(home.html.includes('name="twitter:card" content="summary_large_image"'));
assert(home.html.includes('name="apple-mobile-web-app-capable" content="yes"'));
assert(home.html.includes('name="mobile-web-app-capable" content="yes"'));
assert(home.html.includes('rel="manifest" href="/manifest.webmanifest"'));
assert(home.html.includes('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"'));
assert(home.html.includes('rel="mask-icon" href="/icons/pinned-tab.svg" type="image/svg+xml" color="#23192b"'));
for (const size of [16, 32]) assert(home.html.includes(`href="/icons/favicon-${size}.png" type="image/png" sizes="${size}x${size}"`));
assert(!home.html.includes('codex-preview'));

const publicRoutes = ['shop', 'departments', 'new-releases', 'collections', 'brands', 'services', 'trade-in', 'business', 'advisor', 'updates', 'help', 'help/catalogue', 'help/privacy', 'help/delivery', 'install'];
const titles = new Set();
for (const route of publicRoutes) {
  const { metadata, html } = render(route.split('/'));
  assert.equal(metadata.robots.index, true, route);
  assert.equal(metadata.alternates.canonical, `${SITE_ORIGIN}/${route}`);
  assert(html.includes(`property="og:url" content="${SITE_ORIGIN}/${route}"`));
  titles.add(metadata.title);
}
assert.equal(titles.size, publicRoutes.length, 'Public routes have distinct, useful titles');
assert.equal(render(['install']).metadata.openGraph.images[0].url, `${SITE_ORIGIN}/social/kora-install.png`);

const search = render(['shop'], { q: 'private customer <email@example.com>', utm_source: 'test', sort: 'price' });
assert.equal(search.metadata.robots.index, false);
assert.equal(search.metadata.robots.follow, true);
assert.equal(search.metadata.alternates.canonical, `${SITE_ORIGIN}/shop`);
assert(!search.html.includes('email@example.com'));
assert.equal(render([], { q: 'private' }).metadata.robots.index, false);
const category = products[0];
const filtered = render(['shop'], { department: category.department, category: category.category });
assert.equal(filtered.metadata.title, category.category);
assert.equal(filtered.metadata.robots.index, false);
assert.equal(filtered.metadata.alternates.canonical, `${SITE_ORIGIN}/shop`);
assert.equal(render(['shop'], { department: '<script>injected</script>' }).metadata.title, render(['shop']).metadata.title);

for (const route of ['account', 'cart', 'checkout', 'saved', 'track', 'compare', 'sign-in', 'sign-up']) {
  const { metadata, html } = render([route], { name: 'Private Person', email: 'private@example.com' });
  assert.equal(metadata.robots.index, false, route);
  assert.equal(metadata.robots.follow, false, route);
  assert(html.includes('name="robots" content="noindex, nofollow"'));
  assert(!html.includes('Private Person') && !html.includes('private@example.com'));
  assert.equal(render([route, 'private-request-id']).metadata.alternates.canonical, `${SITE_ORIGIN}/${route}`);
}
for (const segments of [['not-a-page'], ['product', 'does-not-exist'], ['product', category.id, 'extra'], ['help', 'unknown'], ['https:', '', 'attacker.example']]) {
  const { metadata } = render(segments);
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.robots.follow, false);
  assert.equal(metadata.alternates.canonical, `${SITE_ORIGIN}/`);
}

// Every real product gets its own stable canonical and image without invented price/stock claims.
for (const product of products) {
  const metadata = metadataForRoute(['product', product.id]);
  assert.equal(metadata.robots.index, true);
  assert.equal(metadata.alternates.canonical, `${SITE_ORIGIN}/product/${encodeURIComponent(product.id)}`);
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  assert.equal(new URL(metadata.openGraph.images[0].url).protocol, 'https:');
  assert(!/\.svg$/i.test(new URL(metadata.openGraph.images[0].url).pathname));
  assert(metadata.openGraph.images[0].alt);
  assert(!Object.keys(metadata.other || {}).some(key => key.includes('price') || key.includes('availability')));
  if (product.imageVerificationStatus === 'under_review') assert.equal(metadata.openGraph.images[0].url, socialImage.url);
}
const localProduct = products.find(product => product.image.startsWith('/') && product.imageVerificationStatus !== 'under_review');
assert(localProduct);
assert.equal(render(['product', localProduct.id]).metadata.openGraph.images[0].url, new URL(localProduct.image, SITE_ORIGIN).href);
const productHead = render(['product', category.id]);
assert(productHead.html.includes(' | KORA Ghana</title>'));
assert(!productHead.html.includes(' | KORA Ghana | KORA Ghana'));

console.log(JSON.stringify({ passed: true, publicRoutes: publicRoutes.length + 1, productRoutes: products.length, privateRoutes: 8, unknownRoutes: 5, renderer: 'Installed Vinext metadata renderer', verified: ['canonical origin validation', 'Open Graph and Twitter cards', 'Apple/PWA metadata', 'route titles', 'query privacy', 'guest session noindex', 'product images and fallback'] }, null, 2));
