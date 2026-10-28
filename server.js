"use strict";
const { ouvrir } = require("./src/store");
const { creerApp } = require("./src/app");
const { creerGemini } = require("./src/mj/gemini");

(async () => {
  const env = process.env;
  const store = await ouvrir(env);
  const mj = env.GEMINI_API_KEY ? creerGemini({ cle: env.GEMINI_API_KEY, modele: env.GEMINI_MODEL }) : null;
  if (!mj) console.warn("GEMINI_API_KEY absente: le MJ est désactivé.");
  if (!env.TABLE_PASSWORD) console.warn("TABLE_PASSWORD absent: l'accès n'est PAS protégé.");
  const app = creerApp({ store, mj, env });
  const port = parseInt(env.PORT || "3000", 10);
  app.listen(port, "0.0.0.0", () => console.log("Table de jeu prête sur le port " + port + (env.DATABASE_URL ? " (Postgres)" : " (fichier local)")));
})().catch((e) => { console.error("démarrage impossible:", e); process.exit(1); });
