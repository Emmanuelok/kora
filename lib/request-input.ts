export class RequestInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readJsonObject(request: Request, maximumBytes = 20000): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > maximumBytes) {
    void request.body?.cancel().catch(() => {});
    throw new RequestInputError('Request is too large.', 413);
  }
  if (!request.body) throw new RequestInputError('Request data is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        // Cancellation must not delay or replace the bounded-input response.
        void reader.cancel().catch(() => {});
        throw new RequestInputError('Request is too large.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new RequestInputError('Send a valid request object.'); }
}

export async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function allowRequest(db: D1Database, request: Request, owner: string) {
  const now = Date.now();
  const windowMs = 3600000;
  const bucket = Math.floor(now / windowMs);
  const scopes: [string, number][] = [[`owner:${owner}:${bucket}`, 12]];
  // Cloudflare overwrites this header at the edge. Raw IP addresses are not stored.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) scopes.push([`network:${await sha256(ip)}:${bucket}`, 60]);
  await db.prepare('DELETE FROM request_limits WHERE expires < ?').bind(now).run();
  const results = await db.batch(scopes.map(([scope]) => db.prepare('INSERT INTO request_limits(scope,attempts,expires) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(scope, (bucket + 1) * windowMs)));
  return results.every((result, index) => Number((result.results[0] as { attempts?: number } | undefined)?.attempts || 0) <= scopes[index][1]);
}
