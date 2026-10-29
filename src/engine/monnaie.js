"use strict";
// Monnaie: 1 po = 10 pa = 100 pc (cuivre). Jamais des objets d'inventaire: trois compteurs par personnage,
// toujours ramenés à la forme canonique (pc < 10, pa < 10, le reste en po). Un seul endroit, donc pas de doublons.
const COURS = { pc: 1, pa: 10, po: 100 };

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Un nom d'objet qui décrit de l'argent ("Pièces de cuivre gobelines", "15 po", "Ducats").
function estMonnaie(nom) {
  const n = norm(nom);
  return /\bpieces?\b.*\b(cuivre|argent|or|platine|electrum)\b/.test(n) || /\b(ecus?|ducats?|doublons?|monnaie|florins?)\b/.test(n) || /^\d*\s*(po|pa|pc|pp|pe)\b/.test(n);
}

// Pour la reprise des anciennes données: quelle unité et quelle valeur en cuivre (null si on ne sait pas).
function valeurUnite(nom) {
  const n = norm(nom);
  if (/\bplatine\b|\bpp\b/.test(n)) return 1000;
  if (/\bcuivre\b|\bpc\b/.test(n)) return 1;
  if (/\bargent\b|\bpa\b/.test(n)) return 10;
  if (/\belectrum\b|\bpe\b/.test(n)) return 50;
  if (/\bor\b|\bpo\b/.test(n)) return 100;
  return null;
}

const totalCuivre = (inv) => (inv.po || 0) * 100 + (inv.pa || 0) * 10 + (inv.pc || 0);
function poser(inv, total) {
  inv.po = Math.floor(total / 100);
  inv.pa = Math.floor((total % 100) / 10);
  inv.pc = total % 10;
}

// Reprise des anciennes données: les objets "pièces de cuivre" etc. deviennent de la vraie monnaie.
// Idempotent. Renvoie le nombre d'objets convertis.
function harmoniser(partie) {
  let n = 0;
  for (const p of Object.values(partie.personnages || {})) {
    const inv = p.etat && p.etat.inventaire;
    if (!inv || !Array.isArray(inv.objets)) continue;
    let ajout = 0;
    inv.objets = inv.objets.filter((o) => {
      if (o.equipe || !estMonnaie(o.nom)) return true;
      const v = valeurUnite(o.nom);
      if (v == null) return true; // on ne devine pas
      ajout += v * (o.quantite || 1);
      n++;
      return false;
    });
    if (ajout || inv.pa == null || inv.pc == null) poser(inv, totalCuivre(inv) + ajout);
  }
  return n;
}

function texte(inv) {
  const l = [];
  if (inv.po) l.push(inv.po + " po");
  if (inv.pa) l.push(inv.pa + " pa");
  if (inv.pc) l.push(inv.pc + " pc");
  return l.join(" ") || "0 po";
}

module.exports = { COURS, estMonnaie, valeurUnite, totalCuivre, poser, harmoniser, texte };
