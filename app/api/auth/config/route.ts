import { getAuthCapabilities } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(getAuthCapabilities(), { headers: { 'Cache-Control': 'no-store' } });
}
