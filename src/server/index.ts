import { loadLocalEnv } from './env.js';
import { BuneDb } from './db.js';
import { createApp } from './app.js';

loadLocalEnv();

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8790);
const db = new BuneDb();
const { app, services } = await createApp(db);

await app.listen({ host, port });
app.log.info(`Bune API em http://${host}:${port}`);
void services.balances.startBlockWatcher();

const shutdown = async () => {
  services.balances.stopBlockWatcher();
  await app.close();
  db.close();
};

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
