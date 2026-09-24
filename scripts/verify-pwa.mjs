import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');
const origin = 'https://kora.eo-kingsford.workers.dev';
const workerSource = await read('public/sw.js');
const manifest = JSON.parse(await read('public/manifest.webmanifest'));
let checks = 0;
function pass(name) { checks++; console.log(`PASS ${name}`); }

assert.equal(manifest.id, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.start_url, '/?source=pwa');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#23192b');
assert.equal(manifest.prefer_related_applications, false);
assert.deepEqual(manifest.shortcuts.map(({ url }) => url), ['/shop', '/saved', '/track']);
assert(manifest.icons.some(({ sizes, purpose }) => sizes === '192x192' && purpose === 'any'));
assert(manifest.icons.some(({ sizes, purpose }) => sizes === '512x512' && purpose === 'any'));
assert(manifest.icons.some(({ sizes, purpose }) => sizes === '512x512' && purpose === 'maskable'));
for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(({ icons }) => icons)]) {
  assert(icon.src.startsWith('/icons/'));
  await access(path.join(root, 'public', icon.src));
  const png = await readFile(path.join(root, 'public', icon.src));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
}
pass('Manifest identity, launch scope, real shortcuts and dimension-verified PNG icons');

function harness({ failPath, privateAsset = false, redirectedAsset = false, wrongMime = false } = {}) {
  const listeners = new Map();
  const storage = new Map();
  const networkRequests = [];
  let offline = false;
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const cacheStorage = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async put(request, response) { entries.set(key(request), response.clone()); },
        async match(request) { return entries.get(key(request))?.clone(); },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  const network = async (request) => {
    networkRequests.push(request);
    const url = new URL(request.url);
    if (offline || url.pathname === failPath) throw new TypeError('Network unavailable');
    const type = wrongMime ? 'text/html' : url.pathname === '/offline' || url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.png') ? 'image/png' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : url.pathname.endsWith('.ttf') ? 'font/ttf' : 'text/html';
    const response = new Response(url.pathname === '/offline' || url.pathname === '/offline.html' ? '<html>KORA offline shell</html>' : `NETWORK ${url.pathname}`, {
      headers: { 'Content-Type': type, ...(privateAsset ? { 'Cache-Control': 'private, no-store' } : {}) },
    });
    // Cloudflare serves public/offline.html at /offline; the raw filename redirects.
    if (redirectedAsset || url.pathname === '/offline.html') Object.defineProperty(response, 'redirected', { value: true });
    return response;
  };
  const scope = {
    location: { origin },
    addEventListener(type, listener) { listeners.set(type, listener); },
    clients: { async claim() { claimCalls++; } },
    async skipWaiting() { skipWaitingCalls++; },
  };
  vm.runInNewContext(workerSource, { self: scope, caches: cacheStorage, fetch: network, Request, Response, Headers, URL, console });
  async function dispatch(type, payload = {}) {
    const pending = [];
    let responsePromise;
    listeners.get(type)({ ...payload, waitUntil(promise) { pending.push(promise); }, respondWith(promise) { assert.equal(responsePromise, undefined); responsePromise = promise; } });
    await Promise.all(pending);
    return responsePromise ? await responsePromise : undefined;
  }
  function request(url, { mode = 'cors', method = 'GET', headers = {} } = {}) {
    return { url: new URL(url, origin).href, method, mode, headers: new Headers(headers) };
  }
  return { dispatch, request, storage, networkRequests, fetchAsset: network, setOffline(value) { offline = value; }, get skipWaitingCalls() { return skipWaitingCalls; }, get claimCalls() { return claimCalls; } };
}

const h = harness();
await h.dispatch('install');
assert.equal(h.skipWaitingCalls, 0);
assert.equal(h.storage.size, 1);
const [cacheName, entries] = [...h.storage.entries()][0];
assert(cacheName.startsWith('kora-public-'));
const cachedPaths = [...entries.keys()].map((url) => new URL(url).pathname);
assert.deepEqual(cachedPaths.sort(), ['/offline', '/favicon.svg', '/icons/kora-192.png', '/icons/kora-512.png', '/icons/kora-maskable-512.png', '/icons/apple-touch-icon.png', '/fonts/manrope-0.ttf', '/fonts/manrope-4.ttf'].sort());
for (const request of h.networkRequests) {
  assert.equal(request.credentials, 'omit');
  assert.equal(request.cache, 'reload');
  const pathname = new URL(request.url).pathname;
  await access(path.join(root, 'public', pathname === '/offline' ? '/offline.html' : pathname));
}
pass('Install caches exactly eight credential-free public assets and never activates an update automatically');

const cleanUrlFixture = harness();
const rawHtml = await cleanUrlFixture.fetchAsset(new Request(`${origin}/offline.html`));
assert.equal(rawHtml.redirected, true, 'Fixture reproduces Cloudflare’s raw HTML filename redirect');
const cleanHtml = await cleanUrlFixture.fetchAsset(new Request(`${origin}/offline`));
assert.equal(cleanHtml.redirected, false);
assert.equal(cleanHtml.headers.get('Content-Type'), 'text/html');
assert(h.networkRequests.some(({ url }) => new URL(url).pathname === '/offline'));
assert(!h.networkRequests.some(({ url }) => new URL(url).pathname === '/offline.html'));
assert(entries.has(`${origin}/offline`));
pass('Canonical /offline precaching succeeds when Cloudflare redirects the raw /offline.html URL');

h.storage.set('kora-public-obsolete', new Map());
h.storage.set('another-app-cache', new Map());
await h.dispatch('activate');
assert.equal(h.claimCalls, 1);
assert(h.storage.has(cacheName));
assert(!h.storage.has('kora-public-obsolete'));
assert(h.storage.has('another-app-cache'));
pass('Activation removes only obsolete Kora caches and preserves unrelated caches');

for (const test of [
  { failPath: '/icons/kora-192.png' },
  { privateAsset: true },
  { redirectedAsset: true },
  { wrongMime: true },
]) {
  const failed = harness(test);
  await assert.rejects(failed.dispatch('install'));
  assert.equal([...failed.storage.values()].reduce((count, value) => count + value.size, 0), 0);
  assert.equal(failed.skipWaitingCalls, 0);
}
pass('Failed, private, redirected or incorrect-type downloads reject installation without a partial cache');

for (const url of ['/', '/shop', '/cart', '/account', '/saved', '/track', '/checkout']) {
  const response = await h.dispatch('fetch', { request: h.request(url, { mode: 'navigate' }) });
  assert.equal(await response.text(), `NETWORK ${url}`);
  assert(!entries.has(new URL(url, origin).href));
}
assert.equal(entries.size, 8);
pass('All page navigations, including every personal page, use network responses and never enter the cache');

const privateRequests = [
  h.request('/api/store'),
  h.request('/api/store', { method: 'POST' }),
  h.request('/api/gallery?product=example'),
  h.request('/account', { headers: { RSC: '1' } }),
  h.request('/shop?_rsc=example'),
  h.request('/saved', { headers: { Accept: 'text/x-component' } }),
  h.request('/shop', { headers: { 'Next-Router-State-Tree': '[]' } }),
  h.request('/shop', { headers: { 'Next-Router-Prefetch': '1' } }),
  h.request('/icons/kora-192.png', { headers: { Authorization: 'Bearer test-only' } }),
  h.request('/account', { mode: 'navigate', headers: { Authorization: 'Bearer test-only' } }),
  h.request('/checkout', { method: 'POST' }),
  h.request('/assets/app-oldhash.js'),
  h.request('/assets/app-currenthash.js'),
  h.request('/icons/kora-192.png?personal=not-cached'),
  h.request('https://other.example/icons/kora-192.png'),
];
const previousNetworkRequests = h.networkRequests.length;
for (const request of privateRequests) assert.equal(await h.dispatch('fetch', { request }), undefined);
assert.equal(h.networkRequests.length, previousNetworkRequests);
assert.equal(entries.size, 8);
pass('API, authenticated, mutation, RSC, JS chunks, query-bearing and cross-origin requests bypass the service worker');

h.setOffline(true);
for (const url of ['/', '/account', '/checkout']) {
  const response = await h.dispatch('fetch', { request: h.request(url, { mode: 'navigate' }) });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(await response.text(), '<html>KORA offline shell</html>');
}
for (const request of privateRequests) assert.equal(await h.dispatch('fetch', { request }), undefined);
assert.equal(entries.size, 8);
pass('Offline navigation returns a transparent 503 shell, never saved HTML or success responses for API/mutations');

const icon = await h.dispatch('fetch', { request: h.request('/icons/kora-192.png') });
assert.equal(icon.status, 200);
assert.equal(await icon.text(), 'NETWORK /icons/kora-192.png');
entries.delete(new URL('/offline', origin).href);
const noCache = await h.dispatch('fetch', { request: h.request('/cart', { mode: 'navigate' }) });
assert.equal(noCache.status, 503);
assert.equal(noCache.headers.get('Content-Type'), 'text/plain; charset=utf-8');
assert.match(await noCache.text(), /No request has been sent/);
pass('Precached icon works offline; missing offline shell still produces a truthful failure');

for (const event of [
  { data: { type: 'IGNORE' }, source: { type: 'window', url: origin } },
  { data: { type: 'KORA_APPLY_UPDATE' }, source: { type: 'window', url: 'https://other.example' } },
  { data: { type: 'KORA_APPLY_UPDATE' }, source: { type: 'worker', url: origin } },
  { data: { type: 'KORA_APPLY_UPDATE' } },
]) await h.dispatch('message', event);
assert.equal(h.skipWaitingCalls, 0);
await h.dispatch('message', { data: { type: 'KORA_APPLY_UPDATE' }, source: { type: 'window', url: `${origin}/shop` } });
assert.equal(h.skipWaitingCalls, 1);
pass('Only an explicit update message from a same-origin window calls skipWaiting');

const offlinePage = await read('public/offline.html');
assert.match(offlinePage, /role="status"/);
assert.match(offlinePage, /Requests are never queued/);
assert(!/<(?:script|link)[^>]+(?:src|href)="https?:/.test(offlinePage));
assert(!/fetch\(|localStorage|indexedDB/.test(offlinePage));
const client = await read('app/pwa.tsx');
assert.match(client, /beforeinstallprompt/);
assert.match(client, /updateViaCache: "none"/);
assert.match(client, /if \(requestedUpdate.current\)/);
assert.match(client, /process.env.NODE_ENV !== "production"/);
assert(!/setInterval|Notification\.requestPermission|pushManager|backgroundSync/.test(client));
pass('Offline page is self-contained and private; client registration avoids auto-refresh, push prompts and development caching');

// Exercise the real client lifecycle with a tiny hook/DOM harness: it catches races
// across tabs without relying on browser-specific installation UI in CI.
const compiledClient = ts.transpileModule(client, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
async function clientHarness() {
  const state = [];
  const refs = [];
  const effects = [];
  const serviceWorkerEvents = new Map();
  const windowEvents = new Map();
  let collectEffects = true;
  let stateCursor = 0;
  let refCursor = 0;
  let reloads = 0;
  const messages = [];
  const waiting = { state: 'installed', postMessage(message) { messages.push(message); } };
  const registration = { waiting, installing: null, addEventListener() {}, removeEventListener() {} };
  const navigator = {
    onLine: true,
    serviceWorker: {
      controller: { state: 'activated' },
      addEventListener(name, callback) { serviceWorkerEvents.set(name, callback); },
      removeEventListener(name) { serviceWorkerEvents.delete(name); },
      async register() { return registration; },
    },
  };
  const react = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = refCursor++;
      return refs[index] || (refs[index] = { current: initial });
    },
    useEffect(callback) { if (collectEffects) effects.push(callback); },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(compiledClient, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/link') return { default: 'Link' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_target, name) => String(name) });
      throw new Error(`Unexpected client dependency: ${name}`);
    },
    navigator,
    process: { env: { NODE_ENV: 'production' } },
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      addEventListener(name, callback) { windowEvents.set(name, callback); },
      removeEventListener(name) { windowEvents.delete(name); },
      location: { reload() { reloads++; } },
    },
  });
  function render() { stateCursor = 0; refCursor = 0; return exports.default(); }
  render();
  effects.forEach((effect) => effect());
  collectEffects = false;
  await Promise.resolve();
  function findButton(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && node.props.children === 'Update & reload') return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = findButton(child);
      if (found) return found;
    }
    return null;
  }
  return { waiting, state, messages, render, get reloads() { return reloads; }, updateButton() { return findButton(render()); }, changeController() { serviceWorkerEvents.get('controllerchange')(); } };
}

const otherTab = await clientHarness();
assert(otherTab.updateButton(), 'Waiting worker should offer the update action');
otherTab.waiting.state = 'activated';
otherTab.changeController();
assert.equal(otherTab.reloads, 0, 'An update in another tab must not discard this tab’s forms');
assert.equal(otherTab.state[0], null, 'The other tab’s waiting worker must be cleared');
assert.equal(otherTab.state[1], false);
assert.equal(otherTab.render(), null);
pass('An update activated in another tab clears the stale banner without refreshing or losing forms');

for (const terminalState of ['activated', 'redundant']) {
  const race = await clientHarness();
  const button = race.updateButton();
  race.waiting.state = terminalState;
  button.props.onClick();
  assert.equal(race.reloads, 1, 'An already-finished worker must refresh immediately after an explicit click');
  assert.equal(race.messages.length, 0, 'Do not send a no-op message to a worker that cannot change controller again');
  assert.equal(race.state[1], false);
}
const normalUpdate = await clientHarness();
normalUpdate.updateButton().props.onClick();
assert.equal(normalUpdate.reloads, 0);
assert.equal(normalUpdate.messages.length, 1);
assert.equal(normalUpdate.messages[0].type, 'KORA_APPLY_UPDATE');
assert.equal(normalUpdate.state[1], true);
normalUpdate.changeController();
assert.equal(normalUpdate.reloads, 1);
pass('Explicit update handles already-active/redundant workers and waits for activation only when necessary');

console.log(`\n${checks} PWA checks passed.`);
