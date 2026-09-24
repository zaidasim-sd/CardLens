import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Store, passwordHash } from '../server/pilot/store.js';
if (!process.env.DATA_KEY) { const key = randomBytes(32).toString('hex'); appendFileSync('.env', `\nDATA_KEY=${key}\n`); process.env.DATA_KEY=key; }
mkdirSync('.data', { recursive:true });
const store = new Store(process.env.DATA_PATH || './.data/development.sqlite',process.env.DATA_KEY);
const accounts=[];
for(const [username,role] of [['demo-administrator','admin'],['demo-assistant','assistant'],['demo-reviewer','reviewer']]){
  if(store.all('demo','user').some(u=>u.username===username))continue;
  const password=randomBytes(18).toString('base64url'); const id=randomUUID();store.put('demo','user',id,{id,username,role,active:true,password:passwordHash(password)});accounts.push({tenant:'demo',username,password,role});
}
if(accounts.length)writeFileSync('.data/demo-accounts.json',JSON.stringify(accounts,null,2));
console.log('Local accounts prepared. Credentials are in ignored .data/demo-accounts.json.');store.db.close();
