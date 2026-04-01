import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
      options: `-c search_path=${process.env.DB_SEARCH_PATH || 'booking,core,public'}`,
    });
  }
  return _pool;
}

export async function GET(req: NextRequest) {
  // Only active on Vercel – on the VPS the next.config.ts rewrite proxies to the booking server
  if (!process.env.VERCEL) return new NextResponse(null, { status: 404 });

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const savedState = req.cookies.get('oidc_state')?.value;
  const codeVerifier = req.cookies.get('oidc_verifier')?.value;
  const returnTo = req.cookies.get('oidc_return_to')?.value || '/';

  if (!code || !state || state !== savedState)
    return new NextResponse('Invalid callback: state mismatch', { status: 400 });

  const logtoEndpoint = (process.env.LOGTO_ENDPOINT || 'https://logto.propus.ch').replace(/\/$/, '');
  const appId = process.env.PROPUS_BOOKING_LOGTO_APP_ID || '';
  const appSecret = process.env.PROPUS_BOOKING_LOGTO_APP_SECRET || '';
  const host = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = (process.env.BOOKING_LOGTO_REDIRECT_BASE_URL || proto + '://' + host).replace(/\/$/, '');
  const callbackUrl = baseUrl + '/auth/logto/callback';

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = await fetch(logtoEndpoint + '/oidc/.well-known/openid-configuration').then(r => r.json());
    const tokenRes = await fetch(config.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: callbackUrl,
        code_verifier: codeVerifier || '',
      }),
    });
    if (!tokenRes.ok)
      return new NextResponse('Token exchange failed: ' + (await tokenRes.text()), { status: 500 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokens: any = await tokenRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userInfo: any = await fetch(config.userinfo_endpoint, {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    }).then(r => (r.ok ? r.json() : {}));

    const email = String(userInfo.email || '').trim().toLowerCase();
    const name = String(userInfo.name || userInfo.username || email || '');
    if (!email) return new NextResponse('No email in Logto profile', { status: 400 });

    const db = getPool();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    await db.query(
      `INSERT INTO booking.admin_users (username,email,name,active,created_at,updated_at)
       VALUES ($1,$2,$3,TRUE,NOW(),NOW())
       ON CONFLICT (username) DO UPDATE
       SET email=EXCLUDED.email,name=EXCLUDED.name,active=TRUE,updated_at=NOW()`,
      [email, email, name]
    ).catch(() => null);

    await db.query(
      `INSERT INTO booking.admin_sessions (token_hash,user_key,user_name,role,expires_at,created_at)
       VALUES ($1,$2,$3,$4,NOW()+INTERVAL '30 days',NOW())`,
      [tokenHash, email, name, 'admin']
    );

    const response = NextResponse.redirect(new URL(returnTo, req.url));
    response.cookies.set('admin_session', sessionToken, {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
    });
    response.cookies.delete('oidc_state');
    response.cookies.delete('oidc_verifier');
    response.cookies.delete('oidc_return_to');
    return response;
  } catch (err: unknown) {
    return new NextResponse('Auth error: ' + (err instanceof Error ? err.message : String(err)), { status: 500 });
  }
}
