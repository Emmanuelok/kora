import departmentNames from '../data/departments.json';
import { catalogue, type Product } from './catalogue';

export type NavigationCategory = {
  name: string;
  image: string;
  href: string;
};

export type NavigationDepartment = {
  id: string;
  title: string;
  image: string;
  href: string;
  categories: NavigationCategory[];
};

const departmentOrder = [
  'computers-tablets', 'phones', 'tv-home-theatre', 'audio', 'gaming',
  'major-appliances', 'cameras-drones', 'wearables', 'smart-home', 'power-solar',
];

// Existing catalogue photographs, chosen for an easily recognisable department subject.
// IDs, rather than copied image URLs, keep artwork in sync with future photo reviews.
const departmentArtwork: Record<string, string> = {
  'computers-tablets': 'gh-apple-macbook-air-m5-15-16gb-512gb-midnight',
  'phones': 'gh-apple-iphone-17-256gb-black-1sim',
  'tv-home-theatre': 'gh-lg-50ua85006la',
  'audio': 'bbca-19320383',
  'gaming': 'official-sony-playstation-5-pro',
  'major-appliances': 'gh-nasco-nas-07-tw',
  'cameras-drones': 'bbca-17119597',
  'wearables': 'bbca-19361142',
  'smart-home': 'bbca-14581247',
  'power-solar': 'bbca-19266891',
  'components-networking': 'bbca-19755648',
  'office-printing': 'bbca-19807280',
  'car-tech': 'bbca-18394663',
  'kitchen-appliances': 'bbca-18172012',
  'cooling-floor-care': 'bbca-17168806',
  'furniture': 'bbca-19840610',
  'home-living': 'bbca-19366603',
  'outdoor-tools': 'bbca-19851770',
  'baby-maternity': 'bbca-19996414',
  'fitness': 'bbca-20003333',
  'sports-transport': 'bbca-19672153',
  'movies-music': 'bbca-19840498',
  'musical-instruments': 'bbca-10449542',
  'toys-education': 'bbca-19979609',
  'personal-care': 'bbca-19930442',
  'travel-bags': 'bbca-19883339',
  'fashion-watches': 'bbca-19950439',
  'pets': 'bbca-19327768',
  'gift-cards': 'bbca-16699431',
};

// Prefer a clear example of the category over a bundle, peripheral or generic listing.
const categoryArtwork: Record<string, Record<string, string>> = {
  'computers-tablets': { Laptops: 'gh-apple-macbook-air-m5-15-16gb-512gb-midnight' },
  'phones': { 'Charging essentials': 'bbca-17920350' },
  'office-printing': { Stationery: 'bbca-14443629' },
  'tv-home-theatre': { Projectors: 'bbca-17176961', 'TV antennas': 'bbca-14538011' },
  'audio': { 'Noise cancellation': 'bbca-19320383', 'Portable speakers': 'bbca-18190246' },
  'cameras-drones': { 'Compact cameras': 'bbca-18930240', Camcorders: 'bbca-17370307' },
  'car-tech': {
    'Car cameras': 'bbca-18394663',
    'GPS navigation': 'bbca-17969670',
    'Vehicle tracking': 'bbca-19497891',
  },
  'home-living': { 'Home décor': 'bbca-19366603' },
  'power-solar': { 'Solar panels': 'bbca-17211469' },
  'wearables': { Smartwatches: 'bbca-19361142' },
  'sports-transport': { 'Skating & scooters': 'bbca-18588824' },
  'movies-music': { 'Collectible editions': 'bbca-19840498' },
  'toys-education': { 'Dolls & plush': 'bbca-15222164', 'Kids technology': 'bbca-16237359' },
  'personal-care': { 'Hair removal': 'bbca-19299129' },
  'travel-bags': { Backpacks: 'bbca-17373138', 'Duffle bags': 'bbca-16544520' },
  'gift-cards': { 'Game downloads': 'bbca-19128367' },
};

function hasUsableArtwork(product: Product): boolean {
  const image = product.image?.trim();
  return product.imageVerificationStatus !== 'under_review'
    && !!image
    && !/(?:placeholder|under[_-]review|withheld|no[_-]image|missing[_-]image)/i.test(image)
    && (/^https:\/\//.test(image) || /^\/(?:images\/|api\/product-image\?)/.test(image));
}

function representative(products: Product[], preferredId?: string): Product | undefined {
  const eligible = products.filter(hasUsableArtwork);
  return eligible.find(product => product.id === preferredId) || eligible[0];
}

function departmentHref(department: string, category?: string): string {
  return `/shop?department=${encodeURIComponent(department)}`
    + (category ? `&category=${encodeURIComponent(category)}` : '');
}

const productsByDepartment = new Map<string, Product[]>();
for (const product of catalogue) {
  const products = productsByDepartment.get(product.department);
  if (products) products.push(product);
  else productsByDepartment.set(product.department, [product]);
}

const names = departmentNames as Record<string, string>;
const priority = (department: string) => {
  const index = departmentOrder.indexOf(department);
  return index < 0 ? departmentOrder.length : index;
};

/** Populated departments and exact category filter links, without inventory counts. */
export const navigationDepartments: NavigationDepartment[] = [...productsByDepartment]
  .sort(([a], [b]) => priority(a) - priority(b))
  .map(([id, products]) => {
    const image = representative(products, departmentArtwork[id])?.image || '';
    const categories = [...new Set(products.map(product => product.category))].sort();
    return {
      id,
      title: names[id] || id.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
      image,
      href: departmentHref(id),
      categories: categories.map(name => ({
        name,
        image: representative(
          products.filter(product => product.category === name), categoryArtwork[id]?.[name],
        )?.image || image,
        href: departmentHref(id, name),
      })),
    };
  });
