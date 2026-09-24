// Only public catalogue identity belongs here: never include costs, invoices or customer data.
export function createPriceIdentity(product, configuration = {}) {
  const options = Object.entries(configuration).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify([
    1, product.id, product.name, product.brand || '', product.model || '',
    product.condition || '', product.sourceUrl || '', product.retailerSku || '',
    product.retailerVariantId || '', options,
  ]);
}
