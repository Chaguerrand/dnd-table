"use strict";
const fs = require("node:fs");
const path = require("node:path");

// Stockage dans un fichier JSON: pour le développement et les tests.
function creerFichier(dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const chemin = (cle) => path.join(dossier, cle.replace(/[^a-z0-9_-]/gi, "_") + ".json");
  return {
    async lire(cle) {
      try { return JSON.parse(fs.readFileSync(chemin(cle), "utf8")); } catch { return null; }
    },
    async ecrire(cle, valeur, revAttendue) {
      const actuel = await this.lire(cle);
      const rev = actuel ? actuel.rev : 0;
      if (revAttendue != null && rev !== revAttendue) throw new Error("conflit de version");
      const entree = { rev: rev + 1, valeur };
      fs.writeFileSync(chemin(cle) + ".tmp", JSON.stringify(entree));
      fs.renameSync(chemin(cle) + ".tmp", chemin(cle));
      return entree.rev;
    }
  };
}
module.exports = { creerFichier };
