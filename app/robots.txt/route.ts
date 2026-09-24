import { privatePagePaths, siteUrl } from '../../lib/site-metadata';

export function GET() {
  const rules = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    ...privatePagePaths.map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${siteUrl('/sitemap.xml')}`,
    '',
  ];
  return new Response(rules.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
