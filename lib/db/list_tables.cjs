const pg = require('pg');
const { Pool } = pg;

const connectionString = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  const pool = new Pool({ connectionString });
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log("Tables in public schema:");
    console.log(res.rows);
  } catch (err) {
    console.error("Error listing tables:", err);
  } finally {
    await pool.end();
  }
}

main();
