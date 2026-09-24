# Running quotation requests

The `/admin` workspace is implemented for a quotation-first service. It does not take payment, reserve supplier stock, arrange delivery or send notifications. These instructions describe the current source implementation, not a deployed or activated workspace.

## Activate the team workspace

1. Complete the [authentication setup](CLOUDFLARE-AUTH.md), including the Worker signing secret and a tested account method. Google also needs its own configured OAuth credentials. Never paste secrets or passwords into chat or commit them.
2. Confirm D1 has the customer-auth migration and apply additive `drizzle/0002_launch_operations.sql` through the reviewed migration process. It adds request retry keys, request limits, update history and concurrency versions.
3. Create the operator's ordinary KORA account and independently confirm who controls it. Obtain that exact account's immutable `auth_user.id` from D1; an email/password account's email is not verified automatically.
4. Set the Worker variable `KORA_ADMIN_USER_IDS` to the approved ID, or comma-separated IDs for multiple operators. Deploy the reviewed configuration and sign in with one of those accounts before opening `/admin`.
5. Test denial using another account. Removing an ID removes that account's API authority; close/sign out of shared devices as well.

With no allowlist, the API returns **503 — workspace not activated**. With an allowlist, a signed-out visitor receives 401 and an unlisted account receives 403. The page's noindex metadata and crawler exclusions do not replace this server authorization. Customer and administration responses are not publicly cached.

## Handle a request

1. Open `/admin`. Search by request ID, customer name or email; filter by request type/status and use pagination to review additional results.
2. Open a request and check the customer contact details, delivery address, exact product IDs, options and quantities. The submitted basket is a snapshot: later catalogue or bag changes do not rewrite the saved request.
3. Confirm supplier availability, condition, Ghana compatibility, fulfilment details and reviewed costs. A source listing or product subtotal is not a confirmed complete quotation. Use the [pricing handoff](PRICING-LAUNCH-HANDOFF.md) for cost preparation.
4. Choose the appropriate status and write the update the customer should see. Every saved message is customer-visible, up to 2,000 characters. Do not put passwords, supplier invoices, private margin calculations or internal-only notes here.
5. Save, then contact the customer manually through the business's approved channel. The email link opens the operator's email client; KORA does not send the message. Tell the customer to revisit their request history for the saved update.

| Status | Suggested use |
| --- | --- |
| Request received | New enquiry awaiting review |
| In review | An operator is checking the request |
| Awaiting details | Ask the customer for specific missing information |
| Quotation ready | Publish a reviewed complete GHS amount and future expiry |
| Completed | The enquiry has been handled; this does not mark a payment or delivery as completed |
| Closed | No further action is expected; explain why to the customer |

These are operator choices, not an enforced sequence or an automated fulfilment process. A status change does not erase the latest saved quotation. Explain any correction or closure clearly and contact the customer; do not rely on the label alone to communicate changed terms.

## Issue or revise a quotation

Select **Quotation ready**, enter **one complete total in GH₵**, set the expiry and write a clear customer update. The UI accepts two decimal places; the server stores integer pesewas. Totals must be positive and no greater than GH₵1,000,000. Expiry must be in the future and within 90 days. The date/time input uses the operator's browser timezone; the stored instant is displayed in each viewer's local timezone.

Include all agreed product, delivery, service and other applicable charges in that total. Confirm the reviewed cost basis, original fees, acquisition route, markup and selling-tax treatment first. The workspace records your approved amount; it does not calculate these costs for you or publish a fixed catalogue selling price. Fixed catalogue prices use the separate [selling-price pipeline](SELLING-PRICES.md).

Both the operator and customer views show the latest quotation and its validity. An expired quote is labelled expired; expiry does not automatically close the request. To issue a revised quote, review the current request, select Quotation ready again and supply the revised amount, future expiry and explanation. The update timeline retains messages/statuses; it is not a complete archive of earlier quotation amounts, so include the relevant revision detail in the customer-facing message.

If another operator saves first, your stale update is rejected with a refresh message. Keep any useful draft text, refresh the request, review the newer update and submit against the current version. Do not create a second customer request to resolve an editing conflict.

## Customer access and follow-up

- Customers find their requests at `/track` or their account history, refresh to see updates, and can download a text receipt. A receipt is not an invoice, payment confirmation or stock reservation.
- Guests use the browser's 30-day session cookie. A reference number alone is not a public lookup key. Clearing cookies, changing browser/device or expiry can remove access to that guest history; do not promise cross-device guest recovery.
- Signed-in customers use their account's history across browsers. Sign-in imports that browser's guest shopping and requests into the authenticated account once. Accounts stay isolated, and a matching email alone does not authorise recovery or a transfer.
- Email/password recovery, verification emails, magic links and automatic customer notifications are not connected. Establish the manual support channel before accepting real enquiries; see [authentication limitations](CLOUDFLARE-AUTH.md).
- Form retries reuse a reference to avoid duplicate requests. If a customer reports a save failure, check for the existing receipt before asking them to start over. Requests are rate-limited; do not work around a temporary limit by creating duplicate accounts.

Check new and Awaiting details requests on the owner's agreed schedule. Record each meaningful customer-facing outcome and handle delivery or any later payment process separately. The [launch checklist](LAUNCH-CHECKLIST.md) lists the remaining owner decisions.
