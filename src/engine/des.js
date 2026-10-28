"use strict";
const crypto = require("node:crypto");

// Tous les dés sont lancés ici, côté serveur, avec un tirage cryptographique.
function d(faces) {
  if (!Number.isInteger(faces) || faces < 2) throw new Error("dé invalide: " + faces);
  return crypto.randomInt(1, faces + 1);
}

// Lance un dé ou plusieurs dés : "d20", "2d6", "1d10". Renvoie {faces, nb, tirages, total}.
function lancer(expression) {
  const m = /^(\d*)d(\d+)$/.exec(String(expression).trim().toLowerCase());
  if (!m) throw new Error("expression de dé invalide: " + expression);
  const nb = m[1] === "" ? 1 : parseInt(m[1], 10);
  const faces = parseInt(m[2], 10);
  if (nb < 1 || nb > 20) throw new Error("nombre de dés invalide");
  const tirages = [];
  for (let i = 0; i < nb; i++) tirages.push(d(faces));
  return { faces, nb, tirages, total: tirages.reduce((a, b) => a + b, 0) };
}

// d20 avec avantage ou désavantage. Renvoie le dé retenu et tous les tirages.
function d20(mode) {
  const a = d(20);
  if (mode !== "avantage" && mode !== "desavantage") return { tirages: [a], retenu: a, mode: "normal" };
  const b = d(20);
  const retenu = mode === "avantage" ? Math.max(a, b) : Math.min(a, b);
  return { tirages: [a, b], retenu, mode };
}

module.exports = { d, lancer, d20 };
