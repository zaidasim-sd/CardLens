import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedWorkEmail } from './workEmail.mjs';
import { isAllowedAventureEmail } from '../server/auth/service.js';

test('both company domains work outside development',()=>{
  const previous={ APP_ENV:process.env.APP_ENV, NODE_ENV:process.env.NODE_ENV };
  process.env.APP_ENV='production';process.env.NODE_ENV='production';
  try {
    for (const email of ['user@aventureaviation.com','user@vision71tech.com',' User@VISION71TECH.COM ']) {
      assert.equal(isAllowedWorkEmail(email),true);
      assert.equal(isAllowedAventureEmail(email),true);
    }
    for (const email of ['user@gmail.com','user@vision71tech.com.evil.com','user@sub.vision71tech.com','@vision71tech.com','a@b@vision71tech.com','a b@vision71tech.com','user@example.test']) {
      assert.equal(isAllowedWorkEmail(email),false);
      assert.equal(isAllowedAventureEmail(email),false);
    }
  } finally {
    for (const [key,value] of Object.entries(previous)) if(value===undefined) delete process.env[key]; else process.env[key]=value;
  }
});
test('test accounts require explicit development allowance',()=>{
  assert.equal(isAllowedWorkEmail('user@example.test',true),true);
  assert.equal(isAllowedWorkEmail('user@example.test'),false);
});
