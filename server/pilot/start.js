import 'dotenv/config';
import { Store } from './store.js';
import { makeApp, purgeImages } from './app.js';
const store = new Store(process.env.DATA_PATH || './.data/development.sqlite', process.env.DATA_KEY);
const app = makeApp(store);
purgeImages(store);
setInterval(() => { try { purgeImages(store); } catch { console.error('RETENTION_JOB_FAILED'); } }, 60000).unref();
app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('CardSnap internal pilot ready at /pilot/'));
