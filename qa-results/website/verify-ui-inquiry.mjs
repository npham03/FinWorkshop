import pg from 'pg';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const reference = 'FW-B3A2D939-FC2B-4D35-94E2-AADC4E43337B';
const pool = new pg.Pool();
try {
  const database = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  assert.match(database, /^finworkshop_(qa_|website_test)/);
  const { rows } = await pool.query(`SELECT reference, inquiry_type AS type,
    consent_at IS NOT NULL AS consent,
    CASE WHEN company LIKE 'WEBSITE-QA-%' THEN company ELSE NULL END AS synthetic_tag
    FROM website_inquiries WHERE reference=$1`, [reference]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'CONTACT');
  assert.equal(rows[0].consent, true);
  const result = { checkedAt: new Date().toISOString(), persisted: true, ...rows[0] };
  await fs.writeFile(new URL('./inquiry-ui-persistence.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await pool.end(); }
