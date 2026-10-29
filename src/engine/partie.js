"use strict";

function geler(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) geler(o[k]);
  }
  return o;
}

function nouvellePartie(nom) {
  return {
    version: 1, nom: nom || "Nouvelle partie", rev: 0,
    personnages: {},
    temps: { minute: 0 },
    quetes: { objectifs: [] },
    carte: { largeur: 20, hauteur: 15, murs: [], jetons: {} },
    jets_en_attente: [],
    journal: [],
    texte: []
  };
}

// Convertit les objets de la création (simples textes) en objets d'inventaire.
// Le poids est une estimation: poids_estime:true pour que le MJ ou Charlie puisse le corriger.
function normaliserObjets(liste) {
  return (liste || []).map((o, i) => {
    if (typeof o !== "string") return o;
    return {
      id: "obj-" + String(i + 1), nom: o, categorie: "equipement", quantite: 1,
      poids_kg: 1, poids_estime: true, equipe: false, solidite_requise: 0, stats: {}, effets_portes: [], quete: null
    };
  });
}

// Importe la sortie "geler" de la page de création.
// entree = { id, base: {...}, etat: {...} }
function importerPersonnage(partie, entree) {
  if (!entree || !entree.id || !entree.base || !entree.etat) throw new Error("personnage incomplet");
  if (partie.personnages[entree.id]) throw new Error("personnage déjà présent: " + entree.id);
  const etat = JSON.parse(JSON.stringify(entree.etat));
  etat.effets = etat.effets || [];
  etat.inventaire = etat.inventaire || { po: 0, objets: [] };
  etat.inventaire.po = etat.inventaire.po || 0;
  etat.inventaire.pa = etat.inventaire.pa || 0;
  etat.inventaire.pc = etat.inventaire.pc || 0;
  etat.inventaire.objets = normaliserObjets(etat.inventaire.objets);
  etat.emplacements_utilises = etat.emplacements_utilises || 0;
  etat.pouvoirs_utilises = etat.pouvoirs_utilises || {};
  etat.position = etat.position || null;
  const base = JSON.parse(JSON.stringify(entree.base));
  geler(base);
  partie.personnages[entree.id] = { id: entree.id, base, etat };
  // jeton sur la carte: les créatures de taille Grande occupent 1 x 2 cases
  const grande = /grand/i.test(String(base.taille || ""));
  const pos = etat.position || { x: Object.keys(partie.carte.jetons).length * 2, y: 0 };
  partie.carte.jetons[entree.id] = { x: pos.x, y: pos.y, empreinte: grande ? [1, 2] : [1, 1], orientation: "face" };
  etat.position = { x: pos.x, y: pos.y };
  return partie.personnages[entree.id];
}

// Instantané pour l'annulation: tout sauf le journal et le texte.
function instantane(partie) {
  const { journal, texte, ...reste } = partie;
  return JSON.parse(JSON.stringify(reste));
}

function restaurer(partie, snap) {
  const journal = partie.journal, texte = partie.texte, rev = partie.rev;
  for (const k of Object.keys(partie)) delete partie[k];
  Object.assign(partie, JSON.parse(JSON.stringify(snap)));
  partie.journal = journal; partie.texte = texte; partie.rev = rev;
  for (const id of Object.keys(partie.personnages)) geler(partie.personnages[id].base);
}

module.exports = { nouvellePartie, importerPersonnage, instantane, restaurer, normaliserObjets };
