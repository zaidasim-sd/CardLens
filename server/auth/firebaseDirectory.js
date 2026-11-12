import { GoogleAuth } from 'google-auth-library';
import { normalizeGooglePrivateKey } from '../integrations/sheetService.js';
import { federatedDirectoryToken } from './directoryFederation.js';

const failure = (code, message) => Object.assign(new Error(message), {code, status:503});
let cachedAuth;
let credentialIdentity;

export function directoryEmailVisible(email, env = process.env) {
  if (env.APP_ENV !== 'staging' && env.VERCEL_ENV !== 'preview') return true;
  const value = String(email || '').trim().toLowerCase();
  const domain = value.split('@')[1] || '';
  return domain === 'vision71tech.com';
}

export async function readFirebaseDirectory({env = process.env, fetcher = fetch, getAccessToken, oidcToken} = {}) {
  const project = env.FIREBASE_DIRECTORY_PROJECT_ID || env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
  const email = env.FIREBASE_DIRECTORY_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizeGooglePrivateKey(env.FIREBASE_DIRECTORY_PRIVATE_KEY || env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (!project || (!getAccessToken && !env.FIREBASE_DIRECTORY_WIF_AUDIENCE && (!email || !privateKey)))
    throw failure('FIREBASE_DIRECTORY_NOT_CONFIGURED', 'Firebase user directory access is not configured. Ask the project administrator to configure the server credentials.');

  let token;
  try {
    if (getAccessToken) token = await getAccessToken();
    else if (env.FIREBASE_DIRECTORY_WIF_AUDIENCE) token = await federatedDirectoryToken(env, oidcToken, fetcher);
    else {
      const identity = `${email}\0${privateKey}`;
      if (!cachedAuth || credentialIdentity !== identity) {
        cachedAuth = new GoogleAuth({credentials:{client_email:email, private_key:privateKey}, scopes:['https://www.googleapis.com/auth/identitytoolkit']});
        credentialIdentity = identity;
      }
      token = await cachedAuth.getAccessToken();
    }
  } catch {
    throw failure('FIREBASE_DIRECTORY_UNAVAILABLE', 'Firebase user directory authentication failed. Ask the project administrator to check the server credentials.');
  }
  if (!token) throw failure('FIREBASE_DIRECTORY_UNAVAILABLE', 'Firebase user directory authentication failed.');

  const users = [];
  const pageTokens = new Set();
  let nextPageToken;
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(project)}/accounts:batchGet`);
    url.searchParams.set('maxResults', '1000');
    // Request identity fields only. Password hashes, salts and tokens are excluded.
    url.searchParams.set('fields', 'users(localId,email,displayName,emailVerified,disabled),nextPageToken');
    if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken);
    let response;
    try {
      response = await fetcher(url.href, {method:'GET', redirect:'error', signal:AbortSignal.timeout(10000), headers:{Authorization:`Bearer ${token}`, 'x-goog-user-project':project}});
    } catch {
      throw failure('FIREBASE_DIRECTORY_UNAVAILABLE', 'The complete Firebase user list could not be loaded. Refresh Team settings to retry.');
    }
    if (response.status === 403)
      throw failure('FIREBASE_DIRECTORY_ACCESS_DENIED', 'The backend needs read-only Firebase user directory permission. Ask the project administrator to grant firebaseauth.users.get and serviceusage.services.use.');
    if (!response.ok) throw failure('FIREBASE_DIRECTORY_UNAVAILABLE', 'The complete Firebase user list could not be loaded. Refresh Team settings to retry.');
    const body = await response.json().catch(() => null);
    if (!body || (body.users !== undefined && !Array.isArray(body.users)))
      throw failure('FIREBASE_DIRECTORY_UNAVAILABLE', 'Firebase returned an incomplete user directory response. Refresh Team settings to retry.');
    for (const account of body.users || []) {
      if (!account.localId || !account.email) continue;
      users.push({uid:account.localId, email:String(account.email).trim().toLowerCase(), name:account.displayName || '', emailVerified:account.emailVerified === true, disabled:account.disabled === true});
    }
    nextPageToken = body.nextPageToken;
    if (nextPageToken && pageTokens.has(nextPageToken)) throw failure('FIREBASE_DIRECTORY_UNAVAILABLE', 'Firebase user directory pagination could not be completed.');
    if (nextPageToken) pageTokens.add(nextPageToken);
  } while (nextPageToken);
  return users;
}
