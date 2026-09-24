import RequestWorkspace from './request-workspace';
import { metadataForRoute } from '@/lib/site-metadata';
export const metadata = metadataForRoute(['admin']);
export default function AdminPage() { return <RequestWorkspace/>; }
