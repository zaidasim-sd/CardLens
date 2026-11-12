const problem=(code,status,message)=>Object.assign(new Error(message),{code,status});

// Uses Firebase's email/password API. No directory-writer permission is granted.
// Passwords and temporary Firebase tokens remain in request memory only.
export async function provisionFirebaseUser({name,email,password},{env=process.env,fetcher=fetch,sendVerification=true}={}) {
  const key=env.FIREBASE_API_KEY||env.VITE_FIREBASE_API_KEY;
  if(!key)throw problem('FIREBASE_NOT_CONFIGURED',503,'Firebase account creation is not configured.');
  const call=async(action,body)=>{
    let response;
    try{response=await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(key)}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
    catch{throw problem('FIREBASE_CREATE_UNCERTAIN',503,'Firebase could not confirm the account operation. Retry with the same email; an existing account will not be duplicated or have its password changed.');}
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      const code=String(result.error?.message||'').split(' : ')[0];
      if(code==='EMAIL_EXISTS')throw problem('ACCOUNT_EXISTS',409,'This email is already registered. Its password has not been changed.');
      if(code==='TOO_MANY_ATTEMPTS_TRY_LATER'||response.status===429)throw problem('FIREBASE_RATE_LIMITED',429,'Firebase is temporarily limiting account creation. Please wait before trying again.');
      if(code==='WEAK_PASSWORD'||code.startsWith('PASSWORD_DOES_NOT_MEET_REQUIREMENTS'))throw problem('PASSWORD_INVALID',400,'Choose a stronger temporary password that meets the Firebase password policy.');
      throw problem('FIREBASE_PROVISIONING_FAILED',502,'Firebase could not complete this account operation. No existing password was changed.');
    }
    return result;
  };
  const created=await call('signUp',{email,password,returnSecureToken:true});
  if(!created.localId||!created.idToken)throw problem('FIREBASE_CREATE_UNCERTAIN',503,'Account creation could not be confirmed. Retry with the same email to check its status.');
  let profileUpdated=false,verificationSent=false;
  try{await call('update',{idToken:created.idToken,displayName:name,returnSecureToken:false});profileUpdated=true;}catch{/* Account exists; report the incomplete optional step without creating it again. */}
  const staging=env.APP_ENV==='staging'||env.VERCEL_ENV==='preview';
  const permittedRecipient=!staging||String(env.STAGING_EMAIL_ALLOWLIST||'').split(',').map(value=>value.trim().toLowerCase()).includes(email);
  if(sendVerification&&permittedRecipient){try{await call('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:created.idToken});verificationSent=true;}catch{/* The user can resend verification from sign in. */}}
  return {uid:created.localId,email,emailVerified:false,disabled:false,name:profileUpdated?name:'',created:true,verificationSent,profileUpdated};
}
