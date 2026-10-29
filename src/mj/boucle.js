"use strict";
const A = require("../engine/actions");
const { SYSTEME, resume } = require("./prompt");

const MAX_TOURS = 6;      // appels au modèle par réplique
const MAX_HISTORIQUE = 24; // dernières répliques envoyées au modèle

function historique(partie) {
  return partie.texte.slice(-MAX_HISTORIQUE).map((t) => t.qui === "mj"
    ? { role: "mj", texte: t.texte }
    : { role: "user", texte: t.texte });
}

// Fait jouer un tour au MJ. `entree` est ce que le joueur vient de dire ou le résultat d'un jet.
// Modifie `partie` (journal, texte, état) et renvoie { texte }.
async function tourMJ(partie, mj, entree) {
  const debut = Date.now();
  const messages = historique(partie);
  const intro = resume(partie);
  const outils = A.declarationsOutils();
  // l'état courant est rappelé à chaque tour, collé à la dernière entrée
  const dernier = messages.length ? messages[messages.length - 1] : null;
  if (!dernier || dernier.role !== "user") messages.push({ role: "user", texte: entree });
  messages[messages.length - 1] = { role: "user", texte: intro + "\n\n" + messages[messages.length - 1].texte };

  let texteFinal = "";
  for (let tour = 0; tour < MAX_TOURS; tour++) {
    const rep = await mj.generer({ systeme: SYSTEME, messages, outils });
    if (!rep.appels.length) { texteFinal = rep.texte; break; }
    messages.push({ role: "mj", texte: rep.texte, appels: rep.appels, parts: rep.parts });
    if (rep.texte) texteFinal += (texteFinal ? "\n" : "") + rep.texte;
    const reponses = [];
    let attendJet = false;
    for (const a of rep.appels) {
      const r = A.appliquer(partie, a.nom, a.args, "mj");
      reponses.push({ nom: a.nom, contenu: r.ok ? { ok: true, ...r.resultat } : { ok: false, erreur: r.erreur } });
      if (r.ok && a.nom === "demander_jet") attendJet = true;
    }
    messages.push({ role: "outil", reponses });
    if (attendJet) break; // on attend que le joueur lance le dé
  }
  if (texteFinal) partie.texte.push({ qui: "mj", minute: partie.temps.minute, texte: texteFinal, duree_s: Math.round((Date.now() - debut) / 100) / 10 });
  return { texte: texteFinal };
}

module.exports = { tourMJ, MAX_TOURS };
