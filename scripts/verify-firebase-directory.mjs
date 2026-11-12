import {readFirebaseDirectory,directoryEmailVisible} from '../server/auth/firebaseDirectory.js';
// Explicit deployment verification only. Read identities; never create or alter accounts.
if(process.env.FIREBASE_DIRECTORY_VERIFY_BUILD==='true') {
  const users=await readFirebaseDirectory({oidcToken:process.env.VERCEL_OIDC_TOKEN});
  const visible=users.filter(user=>directoryEmailVisible(user.email));
  if((process.env.APP_ENV==='staging'||process.env.VERCEL_ENV==='preview') && visible.some(user=>!user.email.endsWith('@vision71tech.com')))throw new Error('Staging directory isolation check failed');
  console.log(JSON.stringify({check:'Firebase directory read-only access',result:'PASS',registeredAccounts:users.length,visibleAccounts:visible.length,stagingDomainOnly:process.env.APP_ENV==='staging'}));
}
