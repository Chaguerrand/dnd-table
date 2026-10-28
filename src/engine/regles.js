"use strict";
const C = require("./constantes");

const mod = (total) => Math.floor((total - 10) / 2);
const borne = (v, a, b) => Math.max(a, Math.min(b, v));
const bonusMaitrise = (niveau) => 2 + Math.floor(((niveau || 1) - 1) / 4);

function classeDe(perso) {
  const c = String((perso.base && perso.base.classe) || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  return c;
}
function raceDe(perso) {
  return String((perso.base && perso.base.race) || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Le Guerrier et le Voleur utilisent la Perception à la place du Zen.
function cleEffective(perso, k) {
  if (k === "zen" && C.CLASSES_PERCEPTION_POUR_ZEN.includes(classeDe(perso))) return "per";
  return k;
}

// Effets encore actifs (les effets expirés sont retirés par avancer_temps et repos).
function effetsActifs(perso) {
  return (perso.etat && perso.etat.effets) || [];
}

function stat(perso, k) {
  const kk = cleEffective(perso, k);
  const base = (perso.base.stats_total && perso.base.stats_total[kk]) || 10;
  let total = borne(base, 1, C.PLAFOND_SANS_EFFETS);
  for (const e of effetsActifs(perso)) if (e.champ === "stat." + kk) total += e.valeur;
  return borne(total, 1, C.PLAFOND_AVEC_EFFETS);
}
const modStat = (perso, k) => mod(stat(perso, k));

function champ(perso, nom, base) {
  let v = base;
  for (const e of effetsActifs(perso)) if (e.champ === nom) v += e.valeur;
  return v;
}

function parseVitesse(v) {
  if (typeof v === "number") return v;
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(v || "9"));
  return m ? parseFloat(m[1].replace(",", ".")) : 9;
}

// Poids total et seuils de charge (Solidité x4 / x5,5 / x7, doublés pour la Carrure puissante).
function charge(perso) {
  const objets = (perso.etat.inventaire && perso.etat.inventaire.objets) || [];
  const poids = objets.reduce((s, o) => s + (o.poids_kg || 0) * (o.quantite || 1), 0);
  const x = raceDe(perso) === "goliath" ? 2 : 1;
  const sol = stat(perso, "sol");
  const seuils = { encombre: sol * 4 * x, surcharge: sol * 5.5 * x, max: sol * 7 * x };
  let etat = "normal";
  if (poids > seuils.surcharge) etat = "surcharge";
  else if (poids > seuils.encombre) etat = "encombre";
  return { poids: Math.round(poids * 100) / 100, seuils, etat };
}

function vitesse(perso) {
  let v = champ(perso, "vitesse_m", parseVitesse(perso.base.vitesse));
  const ch = charge(perso);
  if (ch.etat === "encombre") v -= 3;
  if (ch.etat === "surcharge") v -= 6;
  const sol = stat(perso, "sol");
  const objets = perso.etat.inventaire.objets || [];
  if (objets.some((o) => o.equipe && o.solidite_requise && o.solidite_requise > sol)) v -= 3;
  return Math.max(0, v);
}

function pvMax(perso) {
  return Math.max(1, champ(perso, "pv_max", perso.etat.pv_max));
}

function maitrise(perso, competence) {
  return ((perso.base.competences) || []).includes(competence);
}

function pouvoirsDe(perso) {
  const ids = [...(C.POUVOIRS_PAR_CLASSE[classeDe(perso)] || []), ...(C.POUVOIRS_PAR_RACE[raceDe(perso)] || [])];
  return ids.map((id) => ({ id, ...C.POUVOIRS[id] }));
}

function emplacementsMax(perso) {
  const c = C.CLASSES[classeDe(perso)];
  return c ? c.emplacements1 : 0;
}

// Modificateur d'un jet pour un type donné.
function modificateurJet(perso, type, nom, bonus) {
  const pb = bonusMaitrise(perso.base.niveau);
  if (type === "competence") {
    const k = C.COMPETENCES[nom];
    if (!k) throw new Error("compétence inconnue: " + nom);
    return modStat(perso, k) + (maitrise(perso, nom) ? pb : 0);
  }
  if (type === "stat") {
    if (!C.STATS.includes(nom)) throw new Error("caractéristique inconnue: " + nom);
    return modStat(perso, nom);
  }
  if (type === "sauvegarde") {
    if (!C.STATS.includes(nom)) throw new Error("caractéristique inconnue: " + nom);
    const cl = C.CLASSES[classeDe(perso)];
    const kk = cleEffective(perso, nom);
    const prof = cl && cl.sauvegardes.includes(nom);
    return modStat(perso, kk) + (prof ? pb : 0);
  }
  return bonus || 0;
}

module.exports = {
  mod, borne, bonusMaitrise, classeDe, raceDe, cleEffective, stat, modStat, champ,
  parseVitesse, charge, vitesse, pvMax, maitrise, pouvoirsDe, emplacementsMax, modificateurJet
};
