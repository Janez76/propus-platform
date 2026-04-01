import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const logtoEndpoint = (process.env.LOGTO_ENDPOINT || 'https://logto.propus.ch').replace(/\/$/, '');
  const appId = process.env.PROPUS_BOOKING_LOGTO_APP_ID || '';
  const host = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = (process.env.BOOKING_LOGTO_REDIRECT_BASE_URL || proto + '://' + host).replace(/\/$/, '');
  const callbackUrl = baseUrl + '/auth/logto/callback';
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/';
  const params = new URLSearchParams({ client_id: appId, redirect_uri: callbackUrl, response_type: 'code', scope: 'openid profile email urn:logto:scope:roles', state, code_challenge: codeChallenge, code_challenge_method: 'S256' });
  const response = NextResponse.redirect(logtoEndpoint + '/oidc/auth?' + params);
  response.cookies.set('oidc_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  response.cookies.set('oidc_verifier', codeVerifier, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  response.cookies.set('oidc_return_to', returnTo, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}