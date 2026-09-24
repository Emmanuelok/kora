import familyData from '../data/product-families.json';
import { catalogue, type Product } from './catalogue';

export type ProductVariant = { productId: string; options: Record<string, string> };
export type ProductFamily = {
  id: string;
  name: string;
  axes: string[];
  evidence: { kind: string; checkedAt: string };
  variants: ProductVariant[];
};

export const productFamilies = familyData as ProductFamily[];
const productsById = new Map(catalogue.map(product => [product.id, product]));
const familiesById = new Map(productFamilies.map(family => [family.id, family]));
const familiesByProduct = new Map(productFamilies.flatMap(family => family.variants.map(variant => [variant.productId, family] as const)));

export const getProductFamily = (productId: string): ProductFamily | undefined => familiesByProduct.get(productId);
export const productOptionCount = (productId: string): number => getProductFamily(productId)?.variants.length ?? 0;
export const productHref = (productId: string): string => '/product/' + encodeURIComponent(productId);

export function getProductOptionSnapshot(productId: string): Record<string, string> | undefined {
  const family = getProductFamily(productId);
  const variant = family?.variants.find(option => option.productId === productId);
  return variant ? { ...variant.options } : undefined;
}

export function getVariantOptions(productId: string): Array<ProductVariant & { product: Product; label: string; href: string }> {
  const family = getProductFamily(productId);
  if (!family) return [];
  return family.variants.flatMap(variant => {
    const product = productsById.get(variant.productId);
    return product ? [{ ...variant, product, label: family.axes.map(axis => variant.options[axis]).join(' · '), href: productHref(product.id) }] : [];
  });
}

/** Resolve a complete, explicitly listed configuration. Never invent option combinations. */
export function resolveProductVariant(familyId: string, selection: Record<string, string>): Product | undefined {
  const family = familiesById.get(familyId);
  if (!family || Object.keys(selection).length !== family.axes.length) return undefined;
  const variant = family.variants.find(option => family.axes.every(axis => option.options[axis] === selection[axis]));
  return variant ? productsById.get(variant.productId) : undefined;
}
