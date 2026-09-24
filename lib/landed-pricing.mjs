// Private import-time calculator. Never import this module or its cost inputs into the storefront.
import { createHash } from 'node:crypto';
import { z } from 'zod';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = integer.refine(value => value > 0, 'Must be positive');
const timestamp = z.string().datetime({ offset: true });
const currency = z.enum(['GHS', 'CAD', 'USD', 'JPY', 'EUR', 'GBP']);
const evidence = z.object({ reference: z.string().trim().min(1).max(1000), checkedAt: timestamp, validUntil: timestamp }).strict();
const money = z.object({ amountMinor: integer, currency, evidence }).strict();
const charge = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().trim().min(1), amount: money }).strict();
const common = {
  schemaVersion: z.literal(1),
  productId: z.string().min(1), catalogueName: z.string().min(1),
  catalogueIdentity: z.string().min(1),
  configuration: z.record(z.string(), z.string()),
  approval: z.object({ approvedBy: z.string().trim().min(1), evidence }).strict(),
  retailPrice: money,
  originalRetailFees: z.object({
    treatment: z.enum(['included-in-retail-price', 'itemized', 'none']),
    charges: z.array(charge), completenessEvidence: evidence,
  }).strict(),
  additionalCosts: z.object({ charges: z.array(charge), completenessEvidence: evidence }).strict(),
  fxRates: z.array(z.object({
    currency: currency.refine(value => value !== 'GHS', 'GHS does not need FX'),
    ghsPerCurrencyUnit: z.object({ numerator: positive, denominator: positive }).strict(), evidence,
  }).strict()),
  sellingTax: z.discriminatedUnion('treatment', [
    z.object({ treatment: z.literal('included-in-marked-up-price'), evidence }).strict(),
    z.object({ treatment: z.literal('no-additional-tax-due'), evidence }).strict(),
    z.object({ treatment: z.literal('additional-on-marked-up-cost'),
      rates: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), numerator: integer, denominator: positive }).strict()).min(1),
      evidence,
    }).strict(),
  ]),
};
export const landedCostInputSchema = z.discriminatedUnion('sourcing', [
  z.object({ ...common, sourcing: z.literal('ghana-local') }).strict(),
  z.object({ ...common, sourcing: z.literal('import'),
    shipment: z.object({
      countryOfOrigin: z.string().regex(/^[A-Z]{2}$/), hsCode: z.string().regex(/^\d{6,10}$/),
      freight: money, insurance: money,
      customsAssessment: z.object({
        customsValueGhsMinor: integer, charges: z.array(charge),
        allDutiesTaxesAndLeviesIncluded: z.literal(true), evidence,
      }).strict(),
    }).strict(),
  }).strict(),
]);

const minorDigits = { GHS: 2, CAD: 2, USD: 2, JPY: 0, EUR: 2, GBP: 2 };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const roundRatio = (numerator, denominator) => (numerator * 2n + denominator) / (denominator * 2n);
const safeNumber = value => {
  assert(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Price exceeds safe integer bounds');
  return Number(value);
};

export function calculateSellingPrice(input, now = Date.now()) {
  const record = landedCostInputSchema.parse(input);
  const allEvidence = [];
  const checkEvidence = item => {
    const checked = Date.parse(item.checkedAt), expiry = Date.parse(item.validUntil);
    assert(checked <= now && checked < expiry && expiry > now, `Stale or future evidence: ${item.reference}`);
    allEvidence.push(item);
  };
  checkEvidence(record.approval.evidence);
  checkEvidence(record.originalRetailFees.completenessEvidence);
  checkEvidence(record.additionalCosts.completenessEvidence);
  checkEvidence(record.sellingTax.evidence);
  assert(record.originalRetailFees.treatment === 'itemized' || record.originalRetailFees.charges.length === 0, 'Included or waived retail fees cannot be added again');
  const fx = new Map();
  for (const rate of record.fxRates) {
    assert(!fx.has(rate.currency), 'Duplicate FX currency');
    fx.set(rate.currency, rate);
    checkEvidence(rate.evidence);
  }
  const lineIds = new Set();
  const audit = [];
  const convert = amount => {
    checkEvidence(amount.evidence);
    if (amount.currency === 'GHS') return BigInt(amount.amountMinor);
    const rate = fx.get(amount.currency);
    assert(rate, `Verified FX missing for ${amount.currency}`);
    const numerator = BigInt(amount.amountMinor) * BigInt(rate.ghsPerCurrencyUnit.numerator) * 100n;
    const denominator = BigInt(rate.ghsPerCurrencyUnit.denominator) * (10n ** BigInt(minorDigits[amount.currency]));
    return roundRatio(numerator, denominator);
  };
  const add = (id, label, amount) => {
    assert(!lineIds.has(id), `Duplicate cost component: ${id}`);
    lineIds.add(id);
    const value = convert(amount);
    audit.push({ id, label, amountGhsMinor: safeNumber(value), evidence: amount.evidence.reference });
    return value;
  };
  let landed = add('retail-price', 'Exact supplier retail price', record.retailPrice);
  for (const fee of record.originalRetailFees.charges) landed += add(`retail-${fee.id}`, fee.label, fee.amount);
  if (record.sourcing === 'ghana-local') {
    assert(record.retailPrice.currency === 'GHS' && record.fxRates.length === 0, 'A Ghana local purchase must use GHS and cannot add import FX');
    assert([...record.originalRetailFees.charges, ...record.additionalCosts.charges].every(fee => fee.amount.currency === 'GHS'), 'Local Ghana costs must use GHS');
  } else {
    landed += add('freight', 'International freight', record.shipment.freight);
    landed += add('insurance', 'Shipment insurance', record.shipment.insurance);
    const assessment = record.shipment.customsAssessment;
    checkEvidence(assessment.evidence);
    for (const tax of assessment.charges) {
      assert(tax.amount.currency === 'GHS', 'Ghana customs assessments must be in GHS');
      landed += add(`customs-${tax.id}`, tax.label, tax.amount);
    }
  }
  for (const cost of record.additionalCosts.charges) landed += add(`additional-${cost.id}`, cost.label, cost.amount);
  assert(landed > 0n, 'Verified landed cost must be positive');
  const markedUp = roundRatio(landed * 120n, 100n);
  let outputTaxes = 0n;
  if (record.sellingTax.treatment === 'additional-on-marked-up-cost') {
    const ids = new Set();
    for (const tax of record.sellingTax.rates) {
      assert(!ids.has(tax.id), 'Duplicate output tax'); ids.add(tax.id);
      const amount = roundRatio(markedUp * BigInt(tax.numerator), BigInt(tax.denominator));
      outputTaxes += amount;
      audit.push({ id: `sale-${tax.id}`, label: tax.label, amountGhsMinor: safeNumber(amount), evidence: record.sellingTax.evidence.reference });
    }
  }
  const priceMinor = safeNumber(markedUp + outputTaxes);
  const revision = createHash('sha256').update(JSON.stringify(record)).digest('hex').slice(0, 24);
  return {
    publicPrice: {
      productId: record.productId, currency: 'GHS', amountMinor: priceMinor,
      identity: record.catalogueIdentity,
      policy: 'kora-selling-price-v1', revision,
      verifiedAt: new Date(now).toISOString(),
      validUntil: new Date(Math.min(...allEvidence.map(item => Date.parse(item.validUntil)))).toISOString(),
    },
    privateAudit: {
      productId: record.productId, revision, sourcing: record.sourcing,
      landedCostGhsMinor: safeNumber(landed), markupGhsMinor: safeNumber(markedUp - landed),
      outputTaxGhsMinor: safeNumber(outputTaxes), finalPriceGhsMinor: priceMinor,
      sellingTaxTreatment: record.sellingTax.treatment, components: audit,
      ...(record.sourcing === 'import' ? { customs: {
        hsCode: record.shipment.hsCode, countryOfOrigin: record.shipment.countryOfOrigin,
        assessedCustomsValueGhsMinor: record.shipment.customsAssessment.customsValueGhsMinor,
        evidence: record.shipment.customsAssessment.evidence.reference,
      } } : {}),
    },
  };
}
