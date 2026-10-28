# dnd-table

Serveur de table de D&D en français avec un MJ propulsé par un modèle de langage (Gemini par défaut, remplaçable dans `src/mj/gemini.js`).

- `src/engine`: règles, actions du MJ (liste fermée), jets de dés côté serveur, annulation
- `src/store`: Postgres (Neon) ou fichier local
- `src/mj`: prompt, boucle de jeu, adaptateur Gemini
- `npm test` lance les tests

Variables: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TABLE_PASSWORD`, `SESSION_SECRET`.
