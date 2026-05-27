import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to database successfully!");

  // Start a database transaction so that we commit safely
  await client.query("BEGIN");

  try {
    // 1. Fetch all transactions order by date desc, created_at desc
    const txRes = await client.query(`
      SELECT id, title, amount, type, category, date, account_id, source, bank, created_at, pending
      FROM transactions
      ORDER BY date DESC, created_at DESC
    `);
    
    console.log(`Fetched ${txRes.rows.length} total transactions from database.`);

    const toDeleteIds = [];
    const visited = new Set();

    // 2. Loop through all transactions and identify duplicates
    for (let i = 0; i < txRes.rows.length; i++) {
      const tx1 = txRes.rows[i];
      if (visited.has(tx1.id)) continue;

      // Group comparison to find if there is a duplicate
      for (let j = i + 1; j < txRes.rows.length; j++) {
        const tx2 = txRes.rows[j];
        if (visited.has(tx2.id)) continue;

        // Check if they are duplicates
        if (tx1.account_id !== tx2.account_id) continue;
        if (Math.abs(tx1.amount - tx2.amount) > 0.001) continue;

        // Date check: within 3 days
        const date1 = new Date(tx1.date);
        const date2 = new Date(tx2.date);
        const diffMs = Math.abs(date1.getTime() - date2.getTime());
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 3) continue;

        // Title/merchant similarity
        const title1 = (tx1.merchant || tx1.title || "").toLowerCase().trim();
        const title2 = (tx2.merchant || tx2.title || "").toLowerCase().trim();
        const firstWord = (str) => str.split(/[^a-zA-Z0-9]/)[0] || "";

        const isTitleMatch =
          title1.includes(title2) ||
          title2.includes(title1) ||
          (firstWord(title1).length >= 4 && firstWord(title1) === firstWord(title2));

        if (isTitleMatch) {
          // Found duplicate! Decide which one to delete.
          // Rule: If one is pending (or has a longer random-looking ID vs a shorter ID, or older created_at), delete that one.
          // Or if one was created earlier (older created_at), delete the older one!
          let keepTx = tx1;
          let deleteTx = tx2;

          // If tx2 is posted and tx1 is pending, keep tx2
          if (tx2.pending === false && tx1.pending === true) {
            keepTx = tx2;
            deleteTx = tx1;
          }
          // If tx1 is longer (random ID) and tx2 is short (standard Plaid ID), keep tx2
          else if (tx1.id.length > 25 && tx2.id.length <= 25) {
            keepTx = tx2;
            deleteTx = tx1;
          }
          // Default: delete the one created earlier
          else if (tx1.created_at < tx2.created_at) {
            keepTx = tx2;
            deleteTx = tx1;
          }

          console.log(`Duplicate found:
  KEEP  : ID: ${keepTx.id.slice(0, 15)}... | Title: ${keepTx.title.slice(0, 30)} | Date: ${keepTx.date} | $${keepTx.amount} | Source: ${keepTx.source} | Pending: ${keepTx.pending}
  DELETE: ID: ${deleteTx.id.slice(0, 15)}... | Title: ${deleteTx.title.slice(0, 30)} | Date: ${deleteTx.date} | $${deleteTx.amount} | Source: ${deleteTx.source} | Pending: ${deleteTx.pending}`);

          toDeleteIds.push(deleteTx.id);
          visited.add(deleteTx.id);
        }
      }
      visited.add(tx1.id);
    }

    console.log(`\nFound ${toDeleteIds.length} duplicate transactions to delete.`);

    // 3. Delete duplicates
    if (toDeleteIds.length > 0) {
      const deleteChunks = [];
      const chunkSize = 50;
      for (let i = 0; i < toDeleteIds.length; i += chunkSize) {
        deleteChunks.push(toDeleteIds.slice(i, i + chunkSize));
      }

      for (const chunk of deleteChunks) {
        await client.query(`
          DELETE FROM transactions
          WHERE id = ANY($1)
        `, [chunk]);
      }
      console.log(`Successfully deleted ${toDeleteIds.length} duplicate records from the database!`);
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
