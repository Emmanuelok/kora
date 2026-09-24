# Product photography completion

Checked 24 September 2026. **The requirement of five genuine images for every item is not complete.** No duplicate crops, invented angles, unrelated variants or generated product photographs were added to fill the gaps.

| Coverage | Products |
| --- | ---: |
| Total catalogue | 2,393 |
| At least five verified visible photos | 212 |
| Still below five photos | 2,181 |
| Multiple verified visible photos | 577 |
| Photography withheld pending exact-model verification | 22 |
| Minimum additional suitable images needed | 8,051 |

This batch added 143 reviewed images across 42 products. Forty retailer galleries were inspected against stored exact-SKU source arrays; 28 had 71 acceptable new views. Fourteen phone configurations received 72 official manufacturer views. Twelve Samsung S26/S26 Ultra configurations now meet the five-image requirement; new iPhone 17 Mist Blue and Lavender configurations each have two distinct suitable Apple UK images. Repeated close-ups were excluded.

Twenty-one iPhone 17 Pro/Pro Max configurations, including both existing base records, have their images withheld. Telefonika associates the same image URLs with both device sizes. The exact-size photographs could not be independently verified: current Apple Pro marketing/purchase pages redirect to generic iPhone pages, and an exact retailer follow-up returned HTTP 403. The twenty-second hold is the previously recorded mismatched binder-clip configuration. These records remain selectable for quotation without displaying a potentially wrong product photograph.

The outstanding work needs additional exact-model manufacturer/supplier photography and permitted access to source galleries. Some sources provide fewer than five distinct views. Adding duplicate crops, changing colours, generating appearances, or hiding the missing products would not satisfy this requirement.

## Evidence and repeatable checks

- `public/catalogue-gallery-gaps.csv` contains all 2,181 incomplete products, current/required/missing counts and known reasons.
- The gap export also includes exact configuration, category, source-page links, current photo URLs and an explicit reminder that identity checks do not grant image reuse rights.
- `data/gallery-coverage.json` records the five-image target and truthful `complete: false` status.
- `data/gallery-five-image-review.json` records accepted source indices and exclusions from this retailer review.
- `data/gallery-phone-source-review.json` records manufacturer source pages, source hashes, accepted images and phone holds.
- `data/gallery-image-validation.json` retains image response status, dimensions, byte hashes and pixel hashes.
- `node scripts/verify-galleries.mjs` verifies data integrity, evidence, distinct identities, coverage and the gallery API, including withheld imagery.
- `node scripts/verify-gallery-import.mjs` verifies a real two-to-five-photo upgrade, preserved ordering, idempotent import and rejection of unverified/duplicate photos without partial writes.
- `node scripts/verify-galleries.mjs --require-five` is the strict completion gate. It currently fails because 2,181 products remain incomplete.
- A deliberately selected launch subset can be checked with `node scripts/verify-galleries.mjs --require-five --scope /path/to/approved-product-ids.json`. The scope file must be a nonempty JSON array of existing, unique product IDs. This does not hide other products or assert photography completion for the whole catalogue; the deployed catalogue must separately be limited to the approved scope.

The importer now preserves accepted gallery order while merging reviewed additions into existing two-to-four-photo galleries. After every import, run `node scripts/export-catalogue.mjs` to regenerate storefront counts, inventory and the five-image gap CSV.

## Owner inputs for a quotation-first launch

Payment collection is outside this launch. Product identity, permission to display photographs and clear quotation/availability wording still need review.

1. Confirm whether launch covers the entire catalogue or supply an explicit list of approved product IDs. The existing five-photo request remains unfinished outside any selected subset.
2. For each selected item, confirm the supplier, exact model and condition, storage/RAM/colour or other configuration, and that the item can be quoted for Ghana. A shared image is acceptable only where the visible product is identical; a Pro photo cannot stand in for a Pro Max photo.
3. Supply enough distinct, genuine photographs to bring every selected item to at least five. Include the exact product ID, original image URL or original file, manufacturer/supplier source page, and a short description of the view. Existing accepted images can remain; do not resend crops or resized copies as new views.
4. Supply written permission, an applicable asset licence, or confirmation that the business owns each selected photograph. Record the rights holder, permitted commercial website/social use, attribution requirements and any expiry. Keep these approval documents outside `public/`; they must not be uploaded into the public CSV.
5. Resolve the 21 iPhone 17 Pro/Pro Max holds with photographs that distinguish the exact size and colour. Supply correct 19 mm / 24-piece binder-clip photographs for the remaining hold.

Source URLs and successful downloads establish provenance and technical readability, not permission to reuse an image. No complete rights-approval register is currently present in this repository. The 1,767 cover-only product records also lack a direct cover-URL entry in the gallery byte-validation table; their existing covers must not be described as freshly download-verified by this audit.

Use a copy of the gap CSV for supplier coordination; regeneration overwrites the exported file. The import process needs identity review and image validation evidence before new views are published. After import, rerun both gallery checks and the strict gate for the agreed launch scope.
