import Store from '../store';
import { metadataForRoute, type MetadataSearchParams } from '../../lib/site-metadata';

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<MetadataSearchParams>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  return metadataForRoute(route.path, query);
}

export default function Page(){return <Store/>}
