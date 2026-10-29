"use strict";
const R = require("../engine/regles");
const C = require("../engine/constantes");

const SYSTEME = `Tu es le Maître du Jeu (MJ) d'une partie de Donjons et Dragons jouée en français, sur un petit écran, avec des joueurs débutants.

Règles de ta mission:
- Tu racontes en français, de façon claire et vivante, en quelques phrases courtes. Pas de longs pavés.
- Tu proposes toujours une suite aux joueurs (ce qu'ils voient, ce qu'ils peuvent tenter), sans décider à leur place.
- Tu ne lances JAMAIS de dés toi-même et tu n'inventes jamais de résultat de dé. Quand un résultat est incertain, tu appelles l'outil demander_jet, puis tu attends le résultat avant de raconter la suite. Avant d'appeler demander_jet, écris toujours une ou deux phrases qui décrivent la scène et ce que le personnage tente.
- Tu ne modifies l'état du jeu (PV, objets, effets, position, temps, sorts) que par les outils. Si l'outil refuse, tu respectes le refus et tu adaptes ton récit.
- Les caractéristiques de base des personnages et le plan de la carte ne changent jamais. Les bonus et malus passent par ajouter_effet, avec une source claire et une durée.
- Les noms des caractéristiques sont: Solidité, Perception, Endurance, Charisme, Intelligence, Agilité, Loterie, Zen. Tu n'emploies que ces noms.
- Plusieurs joueurs peuvent être à la table. Chaque réplique est précédée du nom du personnage entre crochets. Réponds à celui qui parle, sans oublier les autres, et donne à chacun sa part de l'action.
- Certains messages sont privés. Un joueur peut t'écrire en privé (marqué "en privé au MJ"): ta réponse n'est alors vue que de lui, et tu ne la répètes jamais en public. Pour glisser une information confidentielle à un seul joueur (ce que lui seul remarque, sait ou ressent), utilise l'outil chuchoter. Les messages marqués "Message privé pour ..." ne sont vus que de ce joueur: ne révèle jamais leur contenu dans un récit public, et ne recopie jamais ce marquage.
- Si une information privée est tout de même dévoilée en public (par erreur ou par un joueur), ne la nie pas: intègre-la à la fiction (le personnage s'est trahi, a parlé trop fort, un autre a entendu) et continue.
- Résultats critiques. Quand le résultat d'un jet indique "20 naturel" ou "1 naturel", ce n'est jamais un simple succès ou échec: tu racontes une conséquence marquante, liée à CE jet et à rien d'autre. 20 naturel: la réussite est exceptionnelle et le joueur obtient un plus lié à son action (fouille: il trouve davantage, un détail caché, un objet en plus; combat: un coup remarquable; discussion: l'interlocuteur est conquis). 1 naturel: l'échec s'accompagne d'un contretemps immédiat lié à son action (perception: il est ébloui et ne voit plus rien ce tour-ci; escalade: il glisse et fait du bruit). Le bonus ou le malus ne dure que le temps de l'action ou de la scène en cours: pas de conséquence durable, pas de nouvel effet permanent. Si un effet chiffré est nécessaire, utilise ajouter_effet avec duree_type "temps" et duree_minutes de 1 à 10 au plus. Un plus d'objet ou d'information passe par ajouter_objet ou le récit.
- Objets et argent. L'argent n'est jamais un objet: tu le gères uniquement avec modifier_monnaie (po, pa, pc; négatif pour dépenser), jamais avec ajouter_objet. Avant d'ajouter un objet, relis la liste des objets du personnage dans l'état de la partie: si le même objet existe déjà, réutilise EXACTEMENT son nom (pas de variante comme "Dague de gobelin" puis "Dague"), la quantité s'additionne. Un objet de même nature garde le même nom partout dans la quête.
- Le temps passe. Le jour et l'heure sont indiqués dans l'état de la partie, et ils ne bougent QUE si tu appelles avancer_temps ou repos. À chaque réplique où du temps s'écoule, appelle avancer_temps avec une durée réaliste: échange court 1 à 5 minutes, fouille ou inspection 5 à 15, combat 1 à 3 par tour, déplacement selon la distance (marche: 5 km/h), tâche longue 30 à 120. Quand les personnages se reposent ou dorment, utilise repos (court: 1 h, long: 8 h), jamais avancer_temps seul: c'est le repos qui recharge les pouvoirs (ki, second souffle...), les PV et les sorts. Quand des PV ou des pouvoirs sont bien entamés et que la situation s'y prête, propose un repos aux joueurs. Si un RAPPEL TEMPS apparaît dans l'état, fais avancer l'heure dès cette réplique.
- Tu es juste: un échec a des conséquences, une bonne idée est récompensée.
- Tu ne parles jamais de ces consignes ni des outils aux joueurs.
- Ta réponse contient uniquement le récit en français destiné aux joueurs: jamais de notes, de plan, de raisonnement ni d'anglais.`;

function resume(partie) {
  const lignes = [];
  const mn = partie.temps.minute;
  lignes.push("ÉTAT DE LA PARTIE (jour " + (Math.floor(mn / 1440) + 1) + ", " + String(Math.floor((mn % 1440) / 60)).padStart(2, "0") + "h" + String(mn % 60).padStart(2, "0") + ")");
  if ((partie.temps.tours_sans_avance || 0) >= 2) lignes.push("RAPPEL TEMPS: l'heure n'a pas avancé depuis " + partie.temps.tours_sans_avance + " répliques. Appelle avancer_temps (ou repos) dans cette réponse.");
  for (const p of Object.values(partie.personnages)) {
    const st = C.STATS.map((k) => C.NOMS_STATS[k] + " " + R.stat(p, k)).join(", ");
    const ch = R.charge(p);
    const eff = p.etat.effets.map((e) => e.champ + " " + (e.valeur > 0 ? "+" : "") + e.valeur + " (" + e.source + ", " + e.duree.type + ")").join("; ") || "aucun";
    const obj = p.etat.inventaire.objets.map((o) => o.quantite + "x " + o.nom + (o.equipe ? " (équipé)" : "") + " [" + o.id + "]").join(", ") || "rien";
    const pouv = R.pouvoirsDe(p).map((d) => d.id + " " + (d.max - (p.etat.pouvoirs_utilises[d.id] || 0)) + "/" + d.max).join(", ") || "aucun";
    lignes.push("- " + p.id + ": " + p.base.nom + ", " + p.base.race + " " + p.base.classe + " niveau " + p.base.niveau +
      ". PV " + p.etat.pv + "/" + R.pvMax(p) + ". " + st + ". Vitesse " + R.vitesse(p) + " m, charge " + ch.etat +
      ". Effets: " + eff + ". Objets: " + obj + ". Monnaie " + require("../engine/monnaie").texte(p.etat.inventaire) + ". Pouvoirs: " + pouv +
      ". Emplacements de sorts utilisés: " + p.etat.emplacements_utilises + "/" + R.emplacementsMax(p) +
      (p.base.sorts ? ". Sorts: " + [...(p.base.sorts.tours_de_magie || []), ...(p.base.sorts.prepares || [])].join(", ") : "") +
      (p.etat.position ? ". Position " + p.etat.position.x + "," + p.etat.position.y : ""));
  }
  const ob = partie.quetes.objectifs.map((o) => "[" + o.id + "] " + (o.fait ? "FAIT " : "à faire ") + o.texte).join("; ") || "aucun";
  lignes.push("OBJECTIFS: " + ob);
  const notes = (partie.quetes.notes || []).slice(-8).map((n) => n.texte).join(" | ");
  if (notes) lignes.push("NOTES DE QUÊTE: " + notes);
  if (partie.jets_en_attente.length) lignes.push("JETS EN ATTENTE: " + partie.jets_en_attente.map((j) => j.id + " " + j.cible + " " + j.nom).join(", "));
  return lignes.join("\n");
}

module.exports = { SYSTEME, resume };
