"use strict";
// Constantes de règles de la table de jeu. Tout ce qui est "donnée de règle" vit ici.

// Les 8 caractéristiques SPECIALZ (clés internes en français).
const STATS = ["sol", "per", "end", "cha", "int", "agi", "lot", "zen"];
const NOMS_STATS = {
  sol: "Solidité", per: "Perception", end: "Endurance", cha: "Charisme",
  int: "Intelligence", agi: "Agilité", lot: "Loterie", zen: "Zen"
};

// Classes : dé de vie, caractéristique d'incantation, emplacements de niveau 1 (niveau 1 seulement pour l'instant).
const CLASSES = {
  barbare: { nom: "Barbare", dv: 12, mag: null, emplacements1: 0, sauvegardes: ["sol", "end"] },
  barde: { nom: "Barde", dv: 8, mag: "cha", emplacements1: 2, sauvegardes: ["agi", "cha"] },
  clerc: { nom: "Clerc", dv: 8, mag: "zen", emplacements1: 2, sauvegardes: ["zen", "cha"] },
  druide: { nom: "Druide", dv: 8, mag: "zen", emplacements1: 2, sauvegardes: ["int", "zen"] },
  guerrier: { nom: "Guerrier", dv: 10, mag: null, emplacements1: 0, sauvegardes: ["sol", "end"] },
  moine: { nom: "Moine", dv: 8, mag: null, emplacements1: 0, sauvegardes: ["sol", "agi"] },
  paladin: { nom: "Paladin", dv: 10, mag: "cha", emplacements1: 2, sauvegardes: ["zen", "cha"] },
  rodeur: { nom: "Rôdeur", dv: 10, mag: "zen", emplacements1: 2, sauvegardes: ["sol", "agi"] },
  voleur: { nom: "Voleur", dv: 8, mag: null, emplacements1: 0, sauvegardes: ["agi", "int"] },
  ensorceleur: { nom: "Ensorceleur", dv: 6, mag: "cha", emplacements1: 2, sauvegardes: ["end", "cha"] },
  occultiste: { nom: "Occultiste", dv: 8, mag: "cha", emplacements1: 1, sauvegardes: ["zen", "cha"], pacte: true },
  magicien: { nom: "Magicien", dv: 6, mag: "int", emplacements1: 2, sauvegardes: ["int", "zen"] }
};

// Le Guerrier et le Voleur utilisent la Perception à la place du Zen.
const CLASSES_PERCEPTION_POUR_ZEN = ["guerrier", "voleur"];

// Compétence -> caractéristique (Intuition est rattachée à la Perception).
const COMPETENCES = {
  "Acrobaties": "agi", "Dressage": "zen", "Arcanes": "int", "Athlétisme": "sol", "Tromperie": "cha",
  "Histoire": "int", "Intuition": "per", "Intimidation": "cha", "Investigation": "int", "Médecine": "zen",
  "Nature": "int", "Perception": "per", "Représentation": "cha", "Persuasion": "cha", "Religion": "int",
  "Escamotage": "agi", "Discrétion": "agi", "Survie": "zen"
};

// Catégories d'inventaire.
const CATEGORIES = [
  "armes", "armures", "boucliers", "munitions", "potions", "parchemins", "nourriture", "outils",
  "vetements", "bijoux", "objets-magiques", "tresors", "montures", "quete", "equipement", "divers"
];

// Champs numériques qu'un effet peut viser (en plus de stat.<clé>).
const CHAMPS_NUMERIQUES = ["vitesse_m", "armure", "attaque", "degats", "initiative", "pv_max"];

// Durées d'effet.
const TYPES_DUREE = ["permanent", "temps", "repos", "scene", "quete"];

// Plafonds de stats : base + race + classe entre 1 et 20, avec les effets entre 1 et 30.
const PLAFOND_SANS_EFFETS = 20;
const PLAFOND_AVEC_EFFETS = 30;

// Pouvoirs connus du moteur. Seuls ceux déjà validés avec Charlie sont définis ici ;
// les autres pouvoirs de classe et de race restent à définir.
const POUVOIRS = {
  second_souffle: { nom: "Second souffle", max: 1, recharge: "court" },
  endurance_de_pierre: { nom: "Endurance de pierre", max: 2, recharge: "long" }
};
const POUVOIRS_PAR_CLASSE = { guerrier: ["second_souffle"] };
const POUVOIRS_PAR_RACE = { goliath: ["endurance_de_pierre"] };

module.exports = {
  STATS, NOMS_STATS, CLASSES, CLASSES_PERCEPTION_POUR_ZEN, COMPETENCES, CATEGORIES,
  CHAMPS_NUMERIQUES, TYPES_DUREE, PLAFOND_SANS_EFFETS, PLAFOND_AVEC_EFFETS,
  POUVOIRS, POUVOIRS_PAR_CLASSE, POUVOIRS_PAR_RACE
};
