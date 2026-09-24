import 'dotenv/config';
import { Store } from '../server/pilot/store.js';
import { writeFileSync, readFileSync } from 'node:fs';
const store=new Store(process.env.DATA_PATH||'./.data/development.sqlite',process.env.DATA_KEY);
const [mode,file]=process.argv.slice(2);
if(!file||!['backup','restore'].includes(mode))throw new Error('Usage: node scripts/backup-pilot.js backup|restore path');
if(mode==='backup'){
  const data={entities:store.db.prepare("SELECT * FROM entities WHERE kind NOT IN ('image','session','oauth')").all(),audit:store.db.prepare('SELECT * FROM audit').all()};
  writeFileSync(file,store.seal(data));console.log('Encrypted backup created; temporary images and sessions excluded.');
}else{
  if(store.db.prepare('SELECT COUNT(*) AS n FROM entities').get().n)throw new Error('Restore requires an empty destination');
  const data=store.open(readFileSync(file,'utf8'));store.transaction(()=>{for(const r of data.entities)store.db.prepare('INSERT INTO entities VALUES(?,?,?,?)').run(r.tenant,r.kind,r.id,r.payload);for(const r of data.audit)store.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(r.seq,r.tenant,r.actor,r.action,r.record,r.at);});console.log('Restore completed.');
}store.db.close();
