import Store from './store';
import { metadataForRoute, type MetadataSearchParams } from '../lib/site-metadata';

export async function generateMetadata({ searchParams }: { searchParams: Promise<MetadataSearchParams> }) {
  return metadataForRoute([], await searchParams);
}

export default function Page(){return <Store/>}
