# KORA Ghana implementation

Working brand and private catalogue preview. 2,330 source products,29 departments,220 populated categories.

Reference catalogue provenance in data/provenance.json. Source CAD prices multiplied by9.5 for explicitly indicative GHS display; not current FX or a commercial offer. Product images are exact source reference images, not original KORA product photography. Confirm supplier reuse rights before commercial release.

Durable D1: guest or platform-authenticated cart, saved products, profile, quote/service/business/trade-in/return/contact requests. Guest identity uses a30-day HttpOnly SameSite cookie. Owner filters apply to every read/write. No payments or outbound messaging.

Logical DB binding in .openai/hosting.json. Database schema and migration under db/ and drizzle/. migrations are schema-only. Stock, payment, provider notification, real shipment tracking, appointment scheduling and merchant operations remain unconnected.

Verification: scripts/verify-store.mjs tests actual route handler logic with SQLite, including totals, validation, persistence and cross-session isolation. TypeScript check passes. Sampled54 source image URLs passed upstream. Browser preview infrastructure was unreachable despite a healthy supervisor status; visual/browser testing and WebMCP runtime validation unavailable.

WebMCP: search_kora_catalogue, navigation plus result shortlist; feature-detected and abort-cleaned. Source inspection only; runtime validation unavailable.

Campaign imagery uses sourced Unsplash photographs. Laptop: Kari Shea; living room: Freddy G; headphones: exact photographer unresolved. Original source URLs retained in deliverable launch guide.


## 24 September 2026 repairs
- Replaced intercepted Next links with ordinary anchors, and search with native GET submission. Deep URLs work without a client navigation transition.
- 2,362 real catalogue records, 29 populated departments, 224 categories; new collections, current-release and update-history pages.
- Added 17 manufacturer-sourced current/upcoming products, including iPhone Duo; official exact images stored locally.
- Added 15 exact Ghana retailer configurations with dated source prices and local image copies; removed CADx9.5. Stale prices expire after14days; all unmatched prices are quote-only.
- Live public retailer JSON refresh checked15/15 exact variants successfully; no price changes or source failures.
- Cart/API uses nullable Ghana prices, tracks unpriced quantities and excludes unpriced lines from reference totals. Tests verify pricing expiry, mixed baskets, persistence, identity isolation, origin rejection and catalogue integrity.
- Daily KORA Catalogue Updates automation enabled. Registry includes every known catalogue brand; most recent verified scope is17 release records plus15 local variants. Remaining brand registry entries have no false checked date.
- Browser preview unavailable after bounded attempts: cloud Page.navigate and getFrameTree timed out. Native link graph and server/API tests passed. No claim of complete browser-interaction testing.
- Payment collection, merchant stock, actual fulfilment and customer email remain unconnected. Retailer reference prices are not KORA offers.

- Published live route audit returned200 on24 paths andJavaScript on all8chunks. FiveWebPphotos hadgenericstaticMIME; serve their unchanged imagebytes through a typed imageendpoint with contenthashURLs.
