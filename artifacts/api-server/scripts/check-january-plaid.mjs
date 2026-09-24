import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import pg from '../../../lib/db/node_modules/pg/lib/index.js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const envVars = {};
env.split('\n').forEach(l => {
  const m = l.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
  if (m) envVars[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': envVars.PLAID_CLIENT_ID,
      'PLAID-SECRET': envVars.PLAID_SECRET,
    },
  },
}));

async function main() {
  const client = new pg.Client({ connectionString: envVars.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const items = await client.query('SELECT item_id, access_token, bank_name FROM plaid_items');
  for (const item of items.rows) {
    try {
      const res = await plaidClient.transactionsGet({
        access_token: item.access_token,
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      });
      console.log(`${item.bank_name} (${item.item_id.slice(0, 10)}...): returned ${res.data.transactions?.length || 0} transactions for Jan 2026 (total_transactions: ${res.data.total_transactions})`);
      if (res.data.transactions?.length > 0) {
        console.log('Sample:', res.data.transactions[0].date, res.data.transactions[0].name, res.data.transactions[0].amount);
      }
    } catch (err) {
      console.log(`${item.bank_name} error:`, err?.response?.data?.error_message || err?.message);
    }
  }
  await client.end();
}

main().catch(console.error);
