"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { creerApp } = require("../src/app");
const { creerFichier } = require("../src/store/file");
const { creerGemini, versGemini, schemaOutils, nettoyer } = require("../src/mj/gemini");
const A = require("../src/engine/actions");

const stats = { sol: 16, per: 12, end: 14, cha: 10, int: 10, agi: 10, lot: 10, zen: 8 };
const KORGA = {
  id: "korga",
  base: { nom: "Korga", niveau: 1, race: "Goliath", classe: "Guerrier", taille: "Grande", vitesse: "10,5 m", competences: ["Athlétisme"], stats_total: stats, sorts: null },
  etat: { pv: 12, pv_max: 12, effets: [], inventaire: { po: 10, objets: ["Hache"] }, emplacements_utilises: 0, position: null }
};

// Faux MJ: suit un scénario de réponses.
function fauxMJ(scenario) {
  const appels = [];
  return {
    nom: "faux", appels,
    async generer(req) { appels.push(req); const r = scenario.shift(); if (!r) throw new Error("scénario épuisé"); return { parts: [], ...r }; }
  };
}

async function demarrer(mj, env) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "table-"));
  const app = creerApp({ store: creerFichier(dossier), mj, env: env || {} });
  const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  const base = "http://127.0.0.1:" + srv.address().port;
  const post = (u, corps, entetes) => fetch(base + u, { method: "POST", headers: { "content-type": "application/json", ...(entetes || {}) }, body: JSON.stringify(corps || {}) });
  const get = (u, entetes) => fetch(base + u, { headers: entetes || {} });
  return { base, post, get, fermer: () => srv.close() };
}

test("flux complet: création, MJ demande un jet, joueur lance, MJ raconte, annulation", async () => {
  const mj = fauxMJ([
    { texte: "Une falaise se dresse devant vous.", appels: [{ nom: "demander_jet", args: { cible: "korga", type: "competence", nom: "Athlétisme", dd: 10, raison: "grimper" } }] },
    { texte: "Korga se hisse au sommet.", appels: [{ nom: "ajouter_effet", args: { cible: "korga", champ: "stat.end", valeur: -1, source: "fatigue", duree_type: "repos" } }] },
    { texte: "Le vent souffle sur le plateau. Que faites-vous ?", appels: [] }
  ]);
  const s = await demarrer(mj);
  try {
    assert.equal((await s.post("/api/personnages", KORGA)).status, 200);
    assert.equal((await s.post("/api/personnages", KORGA)).status, 400);

    let r = await (await s.post("/api/dire", { perso: "korga", texte: "Je grimpe la falaise" })).json();
    assert.match(r.texte, /falaise/);
    assert.equal(typeof r.partie.texte.at(-1).duree_s, "number");
    assert.equal(r.partie.jets_en_attente.length, 1);

    // tant qu'un jet est en attente, on ne peut pas parler
    assert.equal((await s.post("/api/dire", { perso: "korga", texte: "Je mange" })).status, 409);

    const jetId = r.partie.jets_en_attente[0].id;
    r = await (await s.post("/api/jets/" + jetId + "/lancer", { perso: "korga" })).json();
    assert.equal(r.resultat.modificateur, 5);
    assert.equal(r.partie.jets_en_attente.length, 0);
    assert.equal(r.partie.personnages.korga.calcul.stats.end, 13);
    assert.match(r.texte, /plateau/);
    // le MJ a vu le résultat du jet dans sa conversation
    const dernierMessage = mj.appels.at(-1).messages;
    assert.ok(JSON.stringify(dernierMessage).includes("Jet de dé"));

    r = await (await s.post("/api/annuler", {})).json();
    assert.equal(r.action, "ajouter_effet");
    assert.equal(r.partie.personnages.korga.calcul.stats.end, 14);
  } finally { s.fermer(); }
});

test("refus de l'outil renvoyé au MJ, sans changer l'état", async () => {
  const mj = fauxMJ([
    { texte: "", appels: [{ nom: "modifier_pv", args: { cible: "personne", delta: -3 } }] },
    { texte: "Rien ne se passe.", appels: [] }
  ]);
  const s = await demarrer(mj);
  try {
    await s.post("/api/personnages", KORGA);
    const r = await (await s.post("/api/dire", { perso: "korga", texte: "J'attends" })).json();
    assert.equal(r.partie.personnages.korga.etat.pv, 12);
    const rep = mj.appels[1].messages.at(-1).reponses[0];
    assert.equal(rep.contenu.ok, false);
    assert.match(rep.contenu.erreur, /inconnu/);
  } finally { s.fermer(); }
});

test("mot de passe: accès refusé puis accepté avec cookie signé", async () => {
  const s = await demarrer(null, { TABLE_PASSWORD: "dragon", SESSION_SECRET: "abc" });
  try {
    assert.equal((await s.get("/api/partie")).status, 401);
    assert.equal((await s.post("/api/connexion", { mot_de_passe: "faux" })).status, 401);
    const c = await s.post("/api/connexion", { mot_de_passe: "dragon" });
    assert.equal(c.status, 200);
    const cookie = c.headers.get("set-cookie").split(";")[0];
    assert.equal((await s.get("/api/partie", { cookie })).status, 200);
    assert.equal((await s.get("/api/partie", { cookie: cookie.slice(0, -2) + "zz" })).status, 401);
    assert.equal((await s.post("/api/dire", { perso: "x", texte: "a" }, { cookie })).status, 503);
  } finally { s.fermer(); }
});

test("modifications simultanées: pas de perte (verrou)", async () => {
  const s = await demarrer(null);
  try {
    await s.post("/api/personnages", KORGA);
    await Promise.all(Array.from({ length: 10 }, () => s.post("/api/action", { action: "modifier_pv", params: { cible: "korga", delta: -1 } })));
    const p = await (await s.get("/api/partie")).json();
    assert.equal(p.personnages.korga.etat.pv, 2);
  } finally { s.fermer(); }
});

test("Gemini: conversion des outils et des messages, lecture de la réponse", async () => {
  const outils = schemaOutils(A.declarationsOutils())[0].functionDeclarations;
  assert.equal(outils.length, 15);
  const d = outils.find((o) => o.name === "demander_jet");
  assert.deepEqual(d.parameters.required.sort(), ["cible", "nom", "type"]);
  const m = versGemini([{ role: "user", texte: "a" }, { role: "mj", texte: "b", appels: [{ nom: "repos", args: { type: "court" } }] }, { role: "outil", reponses: [{ nom: "repos", contenu: { ok: true } }] }]);
  assert.equal(m[1].parts[1].functionCall.name, "repos");
  assert.equal(m[2].parts[0].functionResponse.name, "repos");

  let requete;
  const g = creerGemini({ cle: "K", modele: "m", fetchFn: async (url, opt) => {
    requete = { url, opt };
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "Bonjour" }, { functionCall: { name: "repos", args: { type: "long" } } }] } }] }) };
  } });
  const rep = await g.generer({ systeme: "s", messages: [{ role: "user", texte: "x" }], outils: A.declarationsOutils() });
  assert.equal(rep.texte, "Bonjour");
  assert.equal(rep.appels[0].args.type, "long");
  assert.match(requete.url, /models\/m:generateContent$/);
  assert.equal(requete.opt.headers["x-goog-api-key"], "K");
  const e = creerGemini({ cle: "K", fetchFn: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "quota" } }) }) });
  await assert.rejects(e.generer({ systeme: "s", messages: [{ role: "user", texte: "x" }], outils: [] }), /quota/);
});

test("nettoyage: le raisonnement qui fuite est coupé, le récit intact", () => {
  const fuite = "Korga se plaque contre le mur.\n\nVeux-tu rester caché ? dynamic_thoughtKey framing:\n1. Short, vivid.\nWait, let's call demander_jet!";
  assert.equal(nettoyer(fuite), "Korga se plaque contre le mur.\n\nVeux-tu rester caché ?");
  assert.equal(nettoyer("Une porte. Wait, c'est ouverte."), "Une porte. Wait, c'est ouverte.");
  assert.equal(nettoyer("Récit.\nWait, I should call it."), "Récit.");
});

test("jet en deux temps puis suite, et sauvegarde export/import", async () => {
  const mj = fauxMJ([
    { texte: "Une falaise.", appels: [{ nom: "demander_jet", args: { cible: "korga", type: "competence", nom: "Athlétisme", dd: 10, raison: "grimper" } }] },
    { texte: "Tu grimpes.", appels: [] }
  ]);
  const s = await demarrer(mj);
  try {
    await s.post("/api/personnages", KORGA);
    let r = await (await s.post("/api/dire", { perso: "korga", texte: "je grimpe" })).json();
    const jetId = r.partie.jets_en_attente[0].id;
    r = await (await s.post("/api/jets/" + jetId + "/lancer", { perso: "korga", sans_mj: true })).json();
    assert.equal(r.partie.jets_en_attente.length, 0);
    assert.equal(r.partie.texte.at(-1).qui, "joueur");
    assert.ok(r.resultat.tirages.length >= 1);
    assert.ok(r.partie.personnages.korga.calcul.competences["Athlétisme"].maitrise);
    r = await (await s.post("/api/suite", {})).json();
    assert.equal(r.partie.texte.at(-1).texte, "Tu grimpes.");
    assert.equal((await s.post("/api/suite", {})).status, 409);
    const save = await (await s.get("/api/sauvegarde")).json();
    assert.equal(save.version, 1);
    assert.equal((await s.post("/api/sauvegarde", { truc: 1 })).status, 400);
    const ok = await s.post("/api/sauvegarde", save);
    assert.equal(ok.status, 200);
    const p = await (await s.get("/api/partie")).json();
    assert.equal(p.texte.length, r.partie.texte.length);
  } finally { s.fermer(); }
});
