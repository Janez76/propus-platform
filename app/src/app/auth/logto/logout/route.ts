import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';
let _pool: Pool | null = null;
function getPool() {
  if (!_pool)
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
  return _pool;
}
export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get('admin_session')?.value;
  if (sessionToken)
    await getPool()
      .query('DELETE FROM booking.admin_sessions WHERE token_hash=$1', [
        crypto.createHash('sha256').update(sessionToken).digest('hex'),
      ])
      .catch(() => null);
  const logtoEndpoint = (process.env.LOGTO_ENDPOINT || 'https://logto.propus.ch').replace(/\/$/, '');
  const host = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = (process.env.BOOKING_LOGTO_REDIRECT_BASE_URL || proto + '://' + host).replace(/\/$/, '');
  const response = NextResponse.redirect(
    logtoEndpoint + '/oidc/session/end?post_logout_redirect_uri=' + encodeURIComponent(baseUrl)
  );
  response.cookies.delete('admin_session');
  return response;
}
