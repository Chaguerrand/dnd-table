"use strict";
const path = require("node:path");
const { creerFichier } = require("./file");

async function ouvrir(env) {
  if (env.DATABASE_URL) return require("./pg").creerPg(env.DATABASE_URL);
  return creerFichier(env.DATA_DIR || path.join(__dirname, "..", "..", ".donnees"));
}

// Accès à la partie avec un verrou: une seule modification à la fois.
function creerGestionnaire(store, cle) {
  let file = Promise.resolve();
  const nouvelle = require("../engine/partie").nouvellePartie;
  const P = require("../engine/partie");
  async function charger() {
    const e = await store.lire(cle);
    if (!e) return { partie: nouvelle("Ma partie"), rev: 0 };
    const partie = e.valeur;
    for (const id of Object.keys(partie.personnages)) {
      // on regèle les bases après lecture
      (function geler(o) { if (o && typeof o === "object") { Object.freeze(o); for (const k of Object.keys(o)) geler(o[k]); } })(partie.personnages[id].base);
    }
    require("../engine/monnaie").harmoniser(partie); // anciennes pièces d'objets -> vraie monnaie (idempotent)
    return { partie, rev: e.rev };
  }
  return {
    lire: async () => (await charger()).partie,
    // modifier(fn): fn reçoit la partie et peut la changer; sauvegarde si fn n'a pas levé d'erreur.
    modifier(fn) {
      const tache = file.then(async () => {
        const { partie, rev } = await charger();
        const sortie = await fn(partie);
        partie.rev = rev + 1;
        await store.ecrire(cle, partie, rev);
        return sortie;
      });
      file = tache.catch(() => {});
      return tache;
    },
    P
  };
}
module.exports = { ouvrir, creerGestionnaire };
