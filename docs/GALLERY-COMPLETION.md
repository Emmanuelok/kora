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
- `data/gallery-coverage.json` records the five-image target and truthful `complete: false` status.
- `data/gallery-five-image-review.json` records accepted source indices and exclusions from this retailer review.
- `data/gallery-phone-source-review.json` records manufacturer source pages, source hashes, accepted images and phone holds.
- `data/gallery-image-validation.json` retains image response status, dimensions, byte hashes and pixel hashes.
- `node scripts/verify-galleries.mjs` verifies data integrity, evidence, distinct identities, coverage and the gallery API, including withheld imagery.
- `node scripts/verify-gallery-import.mjs` verifies a real two-to-five-photo upgrade, preserved ordering, idempotent import and rejection of unverified/duplicate photos without partial writes.
- `node scripts/verify-galleries.mjs --require-five` is the strict completion gate. It currently fails because 2,181 products remain incomplete.

The importer now preserves accepted gallery order while merging reviewed additions into existing two-to-four-photo galleries. After every import, run `node scripts/export-catalogue.mjs` to regenerate storefront counts, inventory and the five-image gap CSV.
