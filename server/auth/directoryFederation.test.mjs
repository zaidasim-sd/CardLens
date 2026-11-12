import test from 'node:test';import assert from 'node:assert/strict';import {federatedDirectoryToken} from './directoryFederation.js';
const env={FIREBASE_DIRECTORY_WIF_AUDIENCE:'//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/directory/providers/production',FIREBASE_DIRECTORY_SERVICE_ACCOUNT_EMAIL:'directory-reader@fixture-project.iam.gserviceaccount.com'};
test('federation uses only Google STS and the configured read-only account with a short token lifetime',async()=>{
 const calls=[];const token=await federatedDirectoryToken(env,'signed-fixture-oidc',async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return Response.json(calls.length===1?{access_token:'federated-fixture'}:{accessToken:'readonly-fixture'});});
 assert.equal(token,'readonly-fixture');assert.equal(calls[0].url,'https://sts.googleapis.com/v1/token');assert.equal(calls[0].body.audience,env.FIREBASE_DIRECTORY_WIF_AUDIENCE);assert.equal(calls[0].body.subjectToken,'signed-fixture-oidc');
 assert.equal(calls[1].url,'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/directory-reader%40fixture-project.iam.gserviceaccount.com:generateAccessToken');
 assert.deepEqual(calls[1].body,{scope:['https://www.googleapis.com/auth/identitytoolkit'],lifetime:'600s'});assert.equal(calls[0].redirect,'error');assert.equal(calls[1].redirect,'error');
});
test('missing tokens and invalid configuration do not make external requests',async()=>{
 for(const [config,token] of [[env,undefined],[{...env,FIREBASE_DIRECTORY_WIF_AUDIENCE:'https://untrusted.example'},'fixture'],[{...env,FIREBASE_DIRECTORY_SERVICE_ACCOUNT_EMAIL:'attacker@example.test'},'fixture']])await assert.rejects(federatedDirectoryToken(config,token,async()=>assert.fail('Network not allowed')),{code:'FIREBASE_DIRECTORY_UNAVAILABLE'});
});
test('failed exchange never proceeds or exposes provider error text or tokens',async()=>{
 let calls=0;await assert.rejects(federatedDirectoryToken(env,'secret-token',async()=>{calls++;return Response.json({error:'secret-token'},{status:403})}),e=>e.code==='FIREBASE_DIRECTORY_UNAVAILABLE'&&!e.message.includes('secret-token'));assert.equal(calls,1);
});
