import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to database successfully!");

  // Start transaction
  await client.query("BEGIN");

  try {
    // 1. Delete orphaned transactions (transactions with raw Plaid account IDs not present in accounts table)
    const orphanCountRes = await client.query(`
      SELECT COUNT(*)::int as count FROM transactions
      WHERE account_id NOT IN (SELECT id FROM accounts)
    `);
    const orphanCount = orphanCountRes.rows[0].count;
    console.log(`Found ${orphanCount} orphaned transactions (legacy "no bank" duplicates).`);

    if (orphanCount > 0) {
      const deleteOrphansRes = await client.query(`
        DELETE FROM transactions
        WHERE account_id NOT IN (SELECT id FROM accounts)
      `);
      console.log(`Successfully deleted ${deleteOrphansRes.rowCount} orphaned transactions.`);
    }

    // 2. Delete duplicate active transactions
    // Identifies duplicates having same account_id, amount, date, and title, keeping only the earliest inserted transaction
    const dupCountRes = await client.query(`
      SELECT COUNT(*)::int as count
      FROM transactions t1
      WHERE EXISTS (
        SELECT 1 FROM transactions t2
        WHERE t1.id > t2.id
          AND t1.account_id = t2.account_id
          AND t1.amount = t2.amount
          AND t1.date = t2.date
          AND t1.title = t2.title
      )
    `);
    const dupCount = dupCountRes.rows[0].count;
    console.log(`Found ${dupCount} duplicate transaction records in active accounts.`);

    if (dupCount > 0) {
      const deleteDupsRes = await client.query(`
        DELETE FROM transactions t1
        USING transactions t2
        WHERE t1.id > t2.id
          AND t1.account_id = t2.account_id
          AND t1.amount = t2.amount
          AND t1.date = t2.date
          AND t1.title = t2.title
      `);
      console.log(`Successfully deduplicated ${deleteDupsRes.rowCount} transaction records.`);
    }

    await client.query("COMMIT");
    console.log("\nDatabase cleanup committed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error during database cleanup, rolled back transaction:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
