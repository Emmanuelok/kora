# KORA Ghana implementation

Working brand and private catalogue preview. 2,330 source products,29 departments,220 populated categories.

Reference catalogue provenance in data/provenance.json. Source CAD prices multiplied by9.5 for explicitly indicative GHS display; not current FX or a commercial offer. Product images are exact source reference images, not original KORA product photography. Confirm supplier reuse rights before commercial release.

Durable D1: guest or platform-authenticated cart, saved products, profile, quote/service/business/trade-in/return/contact requests. Guest identity uses a30-day HttpOnly SameSite cookie. Owner filters apply to every read/write. No payments or outbound messaging.

Logical DB binding in .openai/hosting.json. Database schema and migration under db/ and drizzle/. migrations are schema-only. Stock, payment, provider notification, real shipment tracking, appointment scheduling and merchant operations remain unconnected.

Verification: scripts/verify-store.mjs tests actual route handler logic with SQLite, including totals, validation, persistence and cross-session isolation. TypeScript check passes. Sampled54 source image URLs passed upstream. Browser preview infrastructure was unreachable despite a healthy supervisor status; visual/browser testing and WebMCP runtime validation unavailable.

WebMCP: search_kora_catalogue, navigation plus result shortlist; feature-detected and abort-cleaned. Source inspection only; runtime validation unavailable.

Campaign imagery uses sourced Unsplash photographs. Laptop: Kari Shea; living room: Freddy G; headphones: exact photographer unresolved. Original source URLs retained in deliverable launch guide.
