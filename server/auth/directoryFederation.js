const unavailable = () => Object.assign(new Error('Firebase directory authentication is unavailable. Ask the administrator to check its read-only connection.'), {code:'FIREBASE_DIRECTORY_UNAVAILABLE',status:503});

// Vercel supplies a short-lived, signed token. Google validates its issuer,
// audience and exact deployment subject before allowing read-only impersonation.
export async function federatedDirectoryToken(env, oidcToken, fetcher = fetch) {
  const audience = env.FIREBASE_DIRECTORY_WIF_AUDIENCE;
  const account = env.FIREBASE_DIRECTORY_SERVICE_ACCOUNT_EMAIL;
  if (!oidcToken || typeof oidcToken !== 'string' || !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(audience || '') ||
      !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(account || '')) throw unavailable();
  const post = async (url, body, bearer) => {
    let response;
    try { response = await fetcher(url, {method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body)}); }
    catch { throw unavailable(); }
    if (!response.ok) throw unavailable();
    const result = await response.json().catch(()=>null);
    if (!result) throw unavailable();
    return result;
  };
  const exchanged = await post('https://sts.googleapis.com/v1/token', {
    audience, grantType:'urn:ietf:params:oauth:grant-type:token-exchange', requestedTokenType:'urn:ietf:params:oauth:token-type:access_token',
    subjectTokenType:'urn:ietf:params:oauth:token-type:jwt', subjectToken:oidcToken, scope:'https://www.googleapis.com/auth/cloud-platform',
  });
  if (!exchanged.access_token) throw unavailable();
  const result = await post(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(account)}:generateAccessToken`,
    {scope:['https://www.googleapis.com/auth/identitytoolkit'],lifetime:'600s'},exchanged.access_token);
  if (!result.accessToken) throw unavailable();
  return result.accessToken;
}
