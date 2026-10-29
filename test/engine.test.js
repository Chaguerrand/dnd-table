"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/engine/partie");
const A = require("../src/engine/actions");
const R = require("../src/engine/regles");

function stats(o) { return Object.assign({ sol: 10, per: 10, end: 10, cha: 10, int: 10, agi: 10, lot: 10, zen: 10 }, o); }

function creer() {
  const partie = P.nouvellePartie("test");
  P.importerPersonnage(partie, {
    id: "korga",
    base: { nom: "Korga", niveau: 1, race: "Goliath", classe: "Guerrier", taille: "Grande", vitesse: "10,5 m",
      competences: ["Athlétisme", "Perception"], stats_total: stats({ sol: 16, end: 14, per: 12, zen: 8 }), sorts: null },
    etat: { pv: 12, pv_max: 12, effets: [], inventaire: { po: 10, objets: ["Hache à deux mains", "Sac à dos"] }, emplacements_utilises: 0, position: null }
  });
  P.importerPersonnage(partie, {
    id: "lyra",
    base: { nom: "Lyra", niveau: 1, race: "Elfe", classe: "Magicien", taille: "Moyenne", vitesse: "9 m",
      competences: ["Arcanes"], stats_total: stats({ int: 16, agi: 14 }),
      sorts: { tours_de_magie: ["trait-de-feu"], prepares: ["bouclier"], connus: ["bouclier"] } },
    etat: { pv: 7, pv_max: 7, effets: [], inventaire: { po: 5, objets: [] }, emplacements_utilises: 0, position: null }
  });
  return partie;
}

test("import: base gelée, jeton Grand 1x2, objets convertis", () => {
  const p = creer();
  assert.ok(Object.isFrozen(p.personnages.korga.base));
  assert.deepEqual(p.carte.jetons.korga.empreinte, [1, 2]);
  assert.equal(p.personnages.korga.etat.inventaire.objets[0].poids_estime, true);
});

test("ajouter_effet: bonus de stat, plafond 30, remplacement par source", () => {
  const p = creer();
  let r = A.appliquer(p, "ajouter_effet", { cible: "korga", champ: "stat.sol", valeur: 4, source: "potion", duree_type: "scene" }, "mj");
  assert.ok(r.ok, r.erreur);
  assert.equal(R.stat(p.personnages.korga, "sol"), 20);
  A.appliquer(p, "ajouter_effet", { cible: "korga", champ: "stat.sol", valeur: 2, source: "potion", duree_type: "scene" }, "mj");
  assert.equal(p.personnages.korga.etat.effets.length, 1);
  assert.equal(R.stat(p.personnages.korga, "sol"), 18);
  A.appliquer(p, "ajouter_effet", { cible: "korga", champ: "stat.sol", valeur: 20, source: "dieu", duree_type: "quete" }, "mj");
  assert.equal(R.stat(p.personnages.korga, "sol"), 30);
});

test("refus: paramètre inconnu, champ inconnu, durée en temps sans minutes; l'état n'est pas modifié", () => {
  const p = creer();
  assert.equal(A.appliquer(p, "ajouter_effet", { cible: "korga", champ: "stat.sol", valeur: 1, source: "x", duree_type: "temps" }, "mj").ok, false);
  assert.equal(A.appliquer(p, "ajouter_effet", { cible: "korga", champ: "base.nom", valeur: 1, source: "x", duree_type: "scene" }, "mj").ok, false);
  assert.equal(A.appliquer(p, "modifier_pv", { cible: "korga", delta: -1, truc: 1 }, "mj").ok, false);
  assert.equal(A.appliquer(p, "inconnue", {}, "mj").ok, false);
  assert.equal(p.journal.length, 0);
});

test("modifier_pv: bornes 0 et maximum", () => {
  const p = creer();
  assert.equal(A.appliquer(p, "modifier_pv", { cible: "lyra", delta: -50 }, "mj").resultat.pv, 0);
  assert.equal(A.appliquer(p, "modifier_pv", { cible: "lyra", delta: 50 }, "mj").resultat.pv, 7);
});

test("temps: effet en minutes expire; repos retire les effets de repos et recharge", () => {
  const p = creer();
  A.appliquer(p, "ajouter_effet", { cible: "lyra", champ: "stat.agi", valeur: 2, source: "sort", duree_type: "temps", duree_minutes: 10 }, "mj");
  A.appliquer(p, "ajouter_effet", { cible: "lyra", champ: "armure", valeur: 1, source: "bénédiction", duree_type: "repos" }, "mj");
  A.appliquer(p, "avancer_temps", { minutes: 9 }, "mj");
  assert.equal(p.personnages.lyra.etat.effets.length, 2);
  A.appliquer(p, "avancer_temps", { minutes: 1 }, "mj");
  assert.equal(p.personnages.lyra.etat.effets.length, 1);
  A.appliquer(p, "utiliser_pouvoir", { cible: "korga", pouvoir: "second_souffle" }, "mj");
  assert.equal(A.appliquer(p, "utiliser_pouvoir", { cible: "korga", pouvoir: "second_souffle" }, "mj").ok, false);
  A.appliquer(p, "repos", { type: "court" }, "mj");
  assert.equal(p.personnages.lyra.etat.effets.length, 0);
  assert.equal(A.appliquer(p, "utiliser_pouvoir", { cible: "korga", pouvoir: "second_souffle" }, "mj").ok, true);
  assert.equal(A.appliquer(p, "utiliser_pouvoir", { cible: "lyra", pouvoir: "second_souffle" }, "mj").ok, false);
});

test("sorts: tour de magie gratuit, emplacements limités, sort inconnu refusé", () => {
  const p = creer();
  const tdm = A.appliquer(p, "lancer_sort", { cible: "lyra", sort: "trait-de-feu" }, "mj");
  assert.ok(tdm.ok, tdm.erreur);
  assert.equal(p.personnages.lyra.etat.emplacements_utilises, 0);
  assert.equal(A.appliquer(p, "lancer_sort", { cible: "lyra", sort: "bouclier" }, "mj").ok, true);
  assert.equal(A.appliquer(p, "lancer_sort", { cible: "lyra", sort: "bouclier" }, "mj").ok, true);
  assert.equal(A.appliquer(p, "lancer_sort", { cible: "lyra", sort: "bouclier" }, "mj").ok, false);
  assert.equal(A.appliquer(p, "lancer_sort", { cible: "korga", sort: "trait-de-feu" }, "mj").ok, false);
});

test("inventaire: poids, charge, encombrement, vitesse, maximum", () => {
  const p = creer();
  const k = p.personnages.korga;
  assert.equal(R.vitesse(k), 10.5);
  // Goliath, Solidité 16: encombré au-dessus de 128 kg, surchargé au-dessus de 176 kg, max 224 kg
  A.appliquer(p, "ajouter_objet", { cible: "korga", nom: "Lingots", categorie: "tresors", poids_kg: 10, quantite: 13 }, "mj");
  assert.equal(R.charge(k).etat, "encombre");
  assert.equal(R.vitesse(k), 7.5);
  A.appliquer(p, "ajouter_objet", { cible: "korga", nom: "Pierres", categorie: "divers", poids_kg: 10, quantite: 5 }, "mj");
  assert.equal(R.charge(k).etat, "surcharge");
  assert.equal(R.vitesse(k), 4.5);
  assert.equal(A.appliquer(p, "ajouter_objet", { cible: "korga", nom: "Enclume", categorie: "divers", poids_kg: 100 }, "mj").ok, false);
  A.appliquer(p, "retirer_objet", { cible: "korga", objet: "Pierres", quantite: 5 }, "mj");
  assert.equal(R.charge(p.personnages.korga).etat, "encombre");
});

test("armure trop lourde pour la Solidité: -3 m de plus", () => {
  const p = creer();
  A.appliquer(p, "ajouter_objet", { cible: "lyra", nom: "Cotte de mailles", categorie: "armures", poids_kg: 20, solidite_requise: 13 }, "mj");
  assert.equal(R.vitesse(p.personnages.lyra), 9);
  A.appliquer(p, "equiper", { cible: "lyra", objet: "Cotte de mailles", equipe: true }, "mj");
  assert.equal(R.vitesse(p.personnages.lyra), 6);
});

test("carte: murs, jetons, vitesse, empreinte et orientation", () => {
  const p = creer();
  p.carte.murs.push([3, 0]);
  assert.equal(A.appliquer(p, "deplacer_jeton", { jeton: "lyra", x: 3, y: 0 }, "mj").ok, false);
  assert.equal(A.appliquer(p, "deplacer_jeton", { jeton: "lyra", x: 12, y: 0 }, "mj").ok, false);
  assert.equal(A.appliquer(p, "deplacer_jeton", { jeton: "lyra", x: 5, y: 3 }, "mj").ok, true);
  // korga (1 profondeur x 2 largeur) à 0,0 occupe (0,0) et (1,0); lyra ne peut pas aller en (1,0)
  assert.equal(A.appliquer(p, "deplacer_jeton", { jeton: "lyra", x: 1, y: 0 }, "mj").ok, false);
  // de profil, korga occupe 2 lignes
  A.appliquer(p, "deplacer_jeton", { jeton: "korga", x: 0, y: 0, orientation: "profil" }, "mj");
  assert.equal(A.appliquer(p, "deplacer_jeton", { jeton: "lyra", x: 0, y: 1 }, "mj").ok, false);
  assert.equal(A.appliquer(p, "deplacer_jeton", { jeton: "korga", x: 0, y: 14, orientation: "profil" }, "mj").ok, false);
});

test("annulation: restaure l'état, garde le journal", () => {
  const p = creer();
  A.appliquer(p, "modifier_pv", { cible: "korga", delta: -5 }, "mj");
  A.appliquer(p, "modifier_pv", { cible: "korga", delta: -2 }, "mj");
  assert.equal(p.personnages.korga.etat.pv, 5);
  const r = A.annuler(p);
  assert.ok(r.ok);
  assert.equal(p.personnages.korga.etat.pv, 7);
  A.annuler(p);
  assert.equal(p.personnages.korga.etat.pv, 12);
  assert.equal(A.annuler(p).ok, false);
  assert.equal(p.journal.length, 2);
  assert.ok(Object.isFrozen(p.personnages.korga.base));
});

test("jets: demande puis résolution avec dés serveur", () => {
  const p = creer();
  const r = A.appliquer(p, "demander_jet", { cible: "korga", type: "competence", nom: "Athlétisme", dd: 12, raison: "escalader" }, "mj");
  assert.ok(r.ok, r.erreur);
  assert.equal(A.appliquer(p, "demander_jet", { cible: "korga", type: "stat", nom: "sol" }, "mj").ok, false);
  const res = A.resoudreJet(p, r.resultat.jet_id, "korga");
  assert.ok(res.ok);
  // Solidité 16 = +3, maitrise +2
  assert.equal(res.resultat.modificateur, 5);
  assert.equal(res.resultat.total, res.resultat.tirages[0] + 5);
  assert.equal(p.jets_en_attente.length, 0);
  assert.equal(p.journal.at(-1).action, "jet");
  assert.equal(A.resoudreJet(p, "jet99", "korga").ok, false);
});

test("jets: Guerrier utilise Perception à la place de Zen; sauvegarde avec maitrise de classe", () => {
  const p = creer();
  const k = p.personnages.korga;
  assert.equal(R.modStat(k, "zen"), R.modStat(k, "per"));
  assert.equal(R.modificateurJet(k, "sauvegarde", "sol"), 5);
  assert.equal(R.modificateurJet(k, "sauvegarde", "agi"), 0);
});

test("dégâts: 2d6 donne entre 2 et 12 et pas de d20", () => {
  const p = creer();
  const r = A.appliquer(p, "demander_jet", { cible: "korga", type: "degats", nom: "hache", de: "2d6", bonus: 3 }, "mj");
  assert.ok(r.ok, r.erreur);
  const res = A.resoudreJet(p, r.resultat.jet_id, "korga").resultat;
  assert.ok(res.total >= 5 && res.total <= 15);
  assert.equal(res.tirages.length, 2);
});

test("objectifs et journal de quête", () => {
  const p = creer();
  const o = A.appliquer(p, "ajouter_objectif", { texte: "Trouver la clé" }, "mj");
  assert.equal(A.appliquer(p, "valider_objectif", { id: o.resultat.id }, "mj").ok, true);
  assert.equal(A.appliquer(p, "valider_objectif", { id: o.resultat.id }, "mj").ok, false);
  assert.equal(A.appliquer(p, "ajouter_journal", { texte: "Le pont est brisé." }, "mj").ok, true);
});

test("déclarations d'outils: une par action, schéma complet", () => {
  const d = A.declarationsOutils();
  assert.equal(d.length, 17);
  assert.ok(d.every((x) => x.nom && x.description && x.parametres));
});

// ---- Monnaie et empilement des objets ----
const Mn = require("../src/engine/monnaie");

test("monnaie: ajout, conversion automatique, dépense, solde insuffisant", () => {
  const p = creer();
  let r = A.appliquer(p, "modifier_monnaie", { cible: "korga", pc: 15 }, "mj");
  assert.equal(r.ok, true);
  assert.equal(r.resultat.monnaie, "10 po 1 pa 5 pc");
  r = A.appliquer(p, "modifier_monnaie", { cible: "korga", pc: 8 }, "mj");
  assert.equal(r.resultat.monnaie, "10 po 2 pa 3 pc"); // 23 pc deviennent 2 pa 3 pc, aucun doublon
  r = A.appliquer(p, "modifier_monnaie", { cible: "korga", po: -3 }, "mj");
  assert.equal(r.resultat.monnaie, "7 po 2 pa 3 pc");
  r = A.appliquer(p, "modifier_monnaie", { cible: "korga", po: -50 }, "mj");
  assert.equal(r.ok, false);
  assert.match(r.erreur, /pas assez/);
  assert.equal(A.appliquer(p, "modifier_monnaie", { cible: "korga" }, "mj").ok, false);
  assert.equal(p.personnages.korga.etat.inventaire.po, 7);
});

test("l'argent n'est pas un objet: refus, et un même objet s'empile sans doublon", () => {
  const p = creer();
  const refus = A.appliquer(p, "ajouter_objet", { cible: "korga", nom: "Pièces de cuivre gobelines", categorie: "tresors", quantite: 15, poids_kg: 0.01 }, "mj");
  assert.equal(refus.ok, false);
  assert.match(refus.erreur, /modifier_monnaie/);
  assert.equal(A.appliquer(p, "ajouter_objet", { cible: "korga", nom: "Potion de soin", categorie: "potions", quantite: 1, poids_kg: 0.5 }, "mj").ok, true);
  const r = A.appliquer(p, "ajouter_objet", { cible: "korga", nom: "Potions de soin", categorie: "potions", quantite: 2, poids_kg: 0.4 }, "mj");
  assert.equal(r.ok, true);
  const potions = p.personnages.korga.etat.inventaire.objets.filter((o) => /potion/i.test(o.nom));
  assert.equal(potions.length, 1);
  assert.equal(potions[0].quantite, 3);
});

test("reprise des anciennes données: les pièces en objets deviennent de la monnaie", () => {
  const p = creer();
  const objets = p.personnages.korga.etat.inventaire.objets;
  objets.push({ id: "obj-90", nom: "Pièces de cuivre gobelines", categorie: "tresors", quantite: 15, poids_kg: 0.01, equipe: false, stats: {}, effets_portes: [], quete: null });
  objets.push({ id: "obj-91", nom: "Pièces de cuivre", categorie: "tresors", quantite: 8, poids_kg: 0.01, equipe: false, stats: {}, effets_portes: [], quete: null });
  objets.push({ id: "obj-92", nom: "Collier de dents de gobelin", categorie: "divers", quantite: 1, poids_kg: 0.1, equipe: false, stats: {}, effets_portes: [], quete: null });
  assert.equal(Mn.harmoniser(p), 2);
  const inv = p.personnages.korga.etat.inventaire;
  assert.equal(Mn.texte(inv), "10 po 2 pa 3 pc");
  assert.ok(inv.objets.some((o) => /Collier/.test(o.nom)));
  assert.ok(!inv.objets.some((o) => /Pièces/.test(o.nom)));
  assert.equal(Mn.harmoniser(p), 0); // idempotent
  assert.equal(Mn.texte(inv), "10 po 2 pa 3 pc");
});
