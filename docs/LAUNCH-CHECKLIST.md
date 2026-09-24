# Quotation-first launch checklist

KORA will accept quotation requests first. Online payments come later. The work below is implemented in this source tree; this checklist does **not** confirm that the new operations release, migrations or credentials are deployed.

## Implemented

- Public browsing, exact configured product selections, guest bags, saved items and quotation/enquiry submission.
- Required customer details, delivery address for product quotations, server-selected product/price snapshots, duplicate-submission protection and request limits.
- A private `/admin` workspace with request search, statuses, customer-visible updates and one complete GHS quotation with an expiry. Access requires a configured allowlist of authenticated user IDs.
- Customer request history and downloadable text receipts. No payment is collected and no email, SMS or WhatsApp notification is sent automatically.
- Authentication, account isolation, guest-session transfer, gallery, metadata/PWA and operations regression checks. Local checks do not replace live activation tests.

## Owner inputs before inviting real enquiries

- [ ] **Business identity and contact:** provide the legal/trading name and business contact details to display, responsible operator, monitored customer contact channel, support hours and an achievable response expectation. Approve the actual privacy/customer terms and enquiry wording; no business identity or policy is assumed here.
- [ ] **Domain and access:** confirm the production HTTPS origin. If changing domains, coordinate `KORA_SITE_URL`, `BETTER_AUTH_URL`, Google callback URLs and DNS. Keep customer browsing public; preview protection is separate. See [hosting](HOSTING.md).
- [ ] **Accounts:** enter a new `BETTER_AUTH_SECRET` directly into Cloudflare. Configure business-owned Google OAuth credentials and the exact callback if Google sign-in is offered. Test each enabled method, sign-out and recovery limitations. Email verification, password reset and magic links are unavailable. See [authentication setup](CLOUDFLARE-AUTH.md).
- [ ] **Operator access:** create the intended team account, verify its ownership and obtain its immutable `auth_user.id` from D1. Configure `KORA_ADMIN_USER_IDS` with the approved IDs. Email text, profile names and request headers never grant administrator access. See [operator setup](QUOTE-OPERATIONS.md).
- [ ] **Catalogue scope:** approve the exact products/configurations to offer for sourcing, suppliers, Ghana compatibility and condition. Resolve ambiguous variants before listing them as choices. See [configuration handoff](CATALOGUE-CONFIGURATIONS.md).
- [ ] **Photos and permission:** provide the outstanding exact-product views and permission to use the selected imagery. The full five-photo requirement remains incomplete. An explicitly approved smaller launch range is possible, but a scoped check does not hide other catalogue products. See [photo handoff](GALLERY-COMPLETION.md) and [asset readiness](ASSET-LAUNCH-READINESS.md).
- [ ] **Costs and fulfilment:** approve actual sourcing costs, required charges, the 20% markup basis, applicable selling-tax treatment, service/delivery charges, availability confirmation, delivery/pickup arrangements, timing, cancellation and warranty/return handling. Unpriced products may accept enquiries; each final quotation still requires review. See [pricing handoff](PRICING-LAUNCH-HANDOFF.md).
- [ ] **Manual response process:** assign someone to check `/admin` regularly, contact customers through the approved channel and keep customer-visible updates current. Saving an update alone does not notify the customer.

## Release and acceptance

- [ ] Back up/inspect the target D1 database and follow its migration history. Existing installations need additive `0002_launch_operations.sql`; confirm `0001_customer_auth.sql` is present. Do not rerun the original `0000` schema over an existing database. See [hosting](HOSTING.md).
- [ ] Run the [repository checks](../README.md#checks), including `verify:launch-operations`, then build and review the deployment. Check the five-photo gate for the agreed launch scope; do not treat a report-only audit as a completion gate.
- [ ] After deployment, use an anonymous browser to browse, choose a configuration, submit one clearly labelled test quotation and find its receipt after reload. Verify another guest cannot see it.
- [ ] With an authorised operator, open that test request, add a customer update and a complete GHS quote with expiry. Confirm the customer sees both after refreshing, an unauthorised account cannot read requests, and expired quotes are labelled correctly.
- [ ] Test enabled authentication and guest-to-account transfer in the deployed runtime. Verify public sharing, crawler files, install/offline/update behavior and the actual domain as described in [asset readiness](ASSET-LAUNCH-READINESS.md).
- [ ] Confirm the test request is not fulfilled or contacted, then have the owner approve public invitation. Payment-provider activation remains a separate later release.
