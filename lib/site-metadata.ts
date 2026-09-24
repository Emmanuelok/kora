import type { Metadata } from 'next';
import { catalogue, type Product } from './catalogue';
import departmentNames from '../data/departments.json';

const DEFAULT_ORIGIN = 'https://kora.eo-kingsford.workers.dev';
export const SITE_NAME = 'KORA Ghana';
export const SITE_TITLE = 'KORA Ghana | Technology for every day';
export const SITE_DESCRIPTION = 'Find your next favourite in tech, home and everyday life. Explore the KORA Ghana catalogue, compare products and request a quotation.';
export const THEME_COLOR = '#23192b';

// Only deployment configuration can set the canonical origin, never a request Host header.
export function resolveSiteOrigin(configured?: string): string {
  if (!configured) return DEFAULT_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.pathname === '/' && !url.search && !url.hash
      && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)
      && !url.hostname.endsWith('.localhost')) return url.origin;
  } catch { /* Invalid configuration retains the known production origin. */ }
  return DEFAULT_ORIGIN;
}

export const SITE_ORIGIN = resolveSiteOrigin(process.env.KORA_SITE_URL);
export const siteUrl = (path: string) => new URL(path, SITE_ORIGIN).href;
export const socialImage = {
  url: siteUrl('/social/kora-og.png'),
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'KORA Ghana — Find your next favourite. Tech, home and everyday life.',
};

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: 'KORA',
  title: { default: SITE_TITLE, template: '%s | KORA Ghana' },
  description: SITE_DESCRIPTION,
  alternates: { canonical: siteUrl('/') },
  category: 'shopping',
  openGraph: {
    type: 'website', locale: 'en_GH', siteName: SITE_NAME,
    title: SITE_TITLE, description: SITE_DESCRIPTION,
    url: siteUrl('/'), images: [socialImage],
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [socialImage] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/icons/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/icons/kora-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/kora-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.svg',
    apple: [{ url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
    other: [{ url: '/icons/pinned-tab.svg', rel: 'mask-icon', type: 'image/svg+xml', color: THEME_COLOR }],
  },
  appleWebApp: { capable: true, title: 'KORA', statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false, address: false },
  // Vinext emits the standard capability tag from appleWebApp; iOS also uses this legacy name.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

type PageCopy = { title: string; description: string };
export type MetadataSearchParams = Record<string, string | string[] | undefined>;

const publicPages: Record<string, PageCopy> = {
  '/': { title: SITE_TITLE, description: SITE_DESCRIPTION },
  '/shop': { title: 'Discover the catalogue', description: 'Explore phones, laptops, gaming, appliances and more. Compare your favourites and ask KORA for a Ghana quotation.' },
  '/departments': { title: 'A world of possibilities', description: 'Find your next discovery across KORA’s technology, home and lifestyle departments. Browse every category in the catalogue.' },
  '/new-releases': { title: 'The next generation', description: 'Explore new and upcoming technology in the KORA catalogue. View product details and ask about Ghana availability.' },
  '/collections': { title: 'A collection for every possibility', description: 'Discover KORA’s collections, from new technology to home essentials. Thoughtfully brought together for Ghana.' },
  '/brands': { title: 'Brands you know. More to discover.', description: 'Browse brands across technology, home and everyday life in the KORA catalogue. Find products to compare and explore.' },
  '/services': { title: 'A little help. A lot less hassle.', description: 'Explore device setup, repairs, installation and technology support. Tell KORA what you need and request a service quotation.' },
  '/trade-in': { title: 'Give your tech a next chapter', description: 'Explore trade-in and electronics recycling enquiries with KORA Ghana. Request a device assessment and confirm local service availability.' },
  '/business': { title: 'Equip your ambition', description: 'Explore technology, appliances and backup power for your business. Request a tailored quotation for your team, school or hospitality project.' },
  '/advisor': { title: 'Find your tech match', description: 'Start with your needs and discover a shortlist from the KORA catalogue. Explore products for work, play, home and everyday life.' },
  '/updates': { title: 'New possibilities. Verified sources.', description: 'Read KORA’s catalogue update history, product sourcing notes and image coverage. Catalogue updates are currently checked manually.' },
  '/help': { title: 'Clear answers. Real support.', description: 'Learn how the KORA catalogue works, how to request a quotation and what to confirm before purchasing.' },
  '/help/catalogue': { title: 'About the KORA catalogue', description: 'Understand KORA’s product catalogue, dated price references and quotation process. Final prices and availability require confirmation.' },
  '/help/privacy': { title: 'Privacy & terms', description: 'Learn how KORA’s guest browser sessions store saved products, shopping bags and enquiries, and read the preview’s privacy and purchase information.' },
  '/help/delivery': { title: 'Delivery information', description: 'Learn how delivery interest is captured across Ghana. Confirm your address, coverage, fees and timing in your final KORA quotation.' },
  '/install': { title: 'Your next favourite. One tap away.', description: 'Add KORA to your home screen for an app-like experience. Discover tech, home and everyday life with a quicker way back to the catalogue.' },
};

const privatePages: Record<string, PageCopy> = {
  '/account': { title: 'My KORA', description: 'Your KORA guest session, profile and requests in this browser.' },
  '/cart': { title: 'Your shopping bag', description: 'Review the products in your KORA guest shopping bag.' },
  '/checkout': { title: 'Request a quotation', description: 'Request a KORA quotation for the products in your shopping bag.' },
  '/saved': { title: 'Your saved collection', description: 'Return to your favourites saved in this browser’s KORA session.' },
  '/track': { title: 'Track your requests', description: 'Review requests saved in this browser’s KORA guest session.' },
  '/compare': { title: 'The details, side by side', description: 'Compare your selected KORA products in this browser.' },
};

const productsById = new Map(catalogue.map(product => [product.id, product]));
const departments = departmentNames as Record<string, string>;

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function productImage(product: Product) {
  if (product.imageVerificationStatus === 'under_review') return socialImage;
  try {
    const url = new URL(product.image, SITE_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || /\.svg$/i.test(url.pathname)) return socialImage;
    return { url: url.href, alt: plainText(product.name) };
  } catch { return socialImage; }
}

export function metadataForRoute(pathSegments: string[] = [], searchParams: MetadataSearchParams = {}): Metadata {
  const path = '/' + pathSegments.join('/');
  let copy = publicPages[path];
  let canonical = copy ? path : '/';
  let image = socialImage as { url: string; alt: string; width?: number; height?: number; type?: string };
  let index = Boolean(copy);
  let follow = Boolean(copy);

  const privatePath = Object.keys(privatePages).find(route => path === route || path.startsWith(route + '/'));
  if (privatePath) {
    copy = privatePages[privatePath];
    canonical = privatePath;
    index = false;
    follow = false;
  } else if (pathSegments.length === 2 && pathSegments[0] === 'product') {
    const product = productsById.get(pathSegments[1]);
    if (product) {
      const name = plainText(product.name);
      copy = {
        title: name,
        description: `Explore ${name.slice(0, 115)} with KORA Ghana. View product details, compare favourites and request a quotation.`,
      };
      canonical = '/product/' + encodeURIComponent(product.id);
      image = productImage(product);
      index = true;
      follow = true;
    }
  } else if (path === '/shop' || path === '/new-releases') {
    // Only known catalogue filters can influence share copy. Search text and other input never do.
    const department = typeof searchParams.department === 'string' ? searchParams.department : '';
    const category = typeof searchParams.category === 'string' ? searchParams.category : '';
    const brand = typeof searchParams.brand === 'string' ? searchParams.brand : '';
    if (department && Object.hasOwn(departments, department)) {
      const name = category && catalogue.some(product => product.department === department && product.category === category)
        ? category : departments[department];
      copy = { title: name, description: `Discover ${name.toLowerCase()} in the KORA Ghana catalogue. Compare products and request a quotation for your next favourite.` };
    } else if (brand && catalogue.some(product => product.brand === brand)) {
      copy = { title: `Explore ${brand}`, description: `Discover ${brand} products in the KORA Ghana catalogue. View details, compare your favourites and request a quotation.` };
    }
    if (Object.keys(searchParams).some(key => ['department', 'category', 'brand', 'collection', 'offers', 'sort', 'page', 'q'].includes(key))) index = false;
  }

  if (!copy) copy = { title: 'Page unavailable', description: 'Find your next discovery in the KORA Ghana catalogue.' };
  if (Object.hasOwn(searchParams, 'q')) index = false;
  if (path === '/install') image = { ...socialImage, url: siteUrl('/social/kora-install.png'), alt: 'KORA — Your next favourite, one tap away. Add KORA to your home screen.' };

  const title = path === '/' ? SITE_TITLE : `${copy.title} | KORA Ghana`;
  const url = siteUrl(canonical);
  return {
    title: path === '/' ? { absolute: SITE_TITLE } : copy.title,
    description: copy.description,
    alternates: { canonical: url },
    robots: { index, follow, googleBot: { index, follow, 'max-image-preview': index ? 'large' : 'none' } },
    openGraph: { type: 'website', locale: 'en_GH', siteName: SITE_NAME, title, description: copy.description, url, images: [image] },
    twitter: { card: 'summary_large_image', title, description: copy.description, images: [image] },
  };
}
