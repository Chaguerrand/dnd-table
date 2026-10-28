"use strict";
const { Pool } = require("pg");

// Stockage Postgres (Neon): une table de documents JSON avec un numéro de version.
async function creerPg(url) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  await pool.query("create table if not exists docs (key text primary key, valeur jsonb not null, rev int not null default 1, maj timestamptz not null default now())");
  return {
    async lire(cle) {
      const r = await pool.query("select valeur, rev from docs where key = $1", [cle]);
      return r.rows[0] ? { rev: r.rows[0].rev, valeur: r.rows[0].valeur } : null;
    },
    async ecrire(cle, valeur, revAttendue) {
      if (revAttendue == null || revAttendue === 0) {
        const r = await pool.query(
          "insert into docs(key, valeur, rev) values ($1, $2, 1) on conflict (key) do update set valeur = excluded.valeur, rev = docs.rev + 1, maj = now() returning rev",
          [cle, JSON.stringify(valeur)]);
        return r.rows[0].rev;
      }
      const r = await pool.query("update docs set valeur = $2, rev = rev + 1, maj = now() where key = $1 and rev = $3 returning rev", [cle, JSON.stringify(valeur), revAttendue]);
      if (!r.rows[0]) throw new Error("conflit de version");
      return r.rows[0].rev;
    },
    async fermer() { await pool.end(); }
  };
}
module.exports = { creerPg };
