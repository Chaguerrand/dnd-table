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
const { nouvellePartie, importerPersonnage } = require("../src/engine/partie");
const { creerComptes } = require("../src/comptes");

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

async function demarrer(mj, env, options) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "table-"));
  const app = creerApp({ store: creerFichier(dossier), mj, env: env || {} });
  const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  const base = "http://127.0.0.1:" + srv.address().port;
  let cookies = "";
  const avec = (entetes) => ({ ...(cookies ? { cookie: cookies } : {}), ...(entetes || {}) });
  const post = (u, corps, entetes) => fetch(base + u, { method: "POST", headers: { "content-type": "application/json", ...avec(entetes) }, body: JSON.stringify(corps || {}) });
  const get = (u, entetes) => fetch(base + u, { headers: avec(entetes) });
  const s = { base, post, get, fermer: () => srv.close(), cookies: (c) => { cookies = c; } };
  if (!(options && options.sansCompte)) {
    const r = await fetch(base + "/api/compte/creer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo: "Testeur", code: "Abcd1234" }) });
    cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  return s;
}

test("le MJ demande un jet dans son texte sans l'outil: le serveur le relance", async () => {
  const mj = fauxMJ([
    { texte: "Tu glisses ta dague dans son flanc. Fais un jet de dégâts pour les dagues.", appels: [] },
    { texte: "", appels: [{ nom: "demander_jet", args: { cible: "korga", type: "degats", nom: "dagues", de: "1d4+1" } }] }
  ]);
  const s = await demarrer(mj);
  try {
    assert.equal((await s.post("/api/personnages", KORGA)).status, 200);
    const r = await (await s.post("/api/dire", { perso: "korga", texte: "Je frappe" })).json();
    assert.equal(r.partie.jets_en_attente.length, 1);
    assert.equal(r.partie.jets_en_attente[0].type, "degats");
  } finally { s.fermer(); }
});

test("flux complet: création, MJ demande un jet, joueur lance, MJ raconte, annulation", async () => {
  const mj = fauxMJ([
    { texte: "Une falaise se dresse devant vous.", appels: [{ nom: "demander_jet", args: { cible: "korga", type: "competence", nom: "Athlétisme", dd: 10, raison: "grimper" } }] },
    { texte: "Korga se hisse au sommet.", appels: [{ nom: "ajouter_effet", args: { cible: "korga", champ: "stat.end", valeur: -1, source: "fatigue", duree_type: "repos" } }] },
    { texte: "Le vent souffle sur le plateau. Que faites-vous ?", appels: [] }
  ]);
  const s = await demarrer(mj);
  try {
    assert.equal((await s.post("/api/personnages", KORGA)).status, 200);
    assert.equal((await s.post("/api/personnages", KORGA)).status, 409);

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

test("compte requis: sans compte ou avec un cookie falsifié, accès refusé", async () => {
  const s = await demarrer(null, { SESSION_SECRET: "abc" }, { sansCompte: true });
  try {
    const r = await s.get("/api/partie");
    assert.equal(r.status, 401);
    assert.equal((await r.json()).etape, "compte");
    assert.equal((await s.get("/api/partie", { cookie: "joueur=charlie.0000" })).status, 401);
    const cr = await s.post("/api/compte/creer", { pseudo: "Charlie", code: "Abcd1234" });
    assert.equal(cr.status, 200);
    const cookie = cr.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
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
  assert.equal(outils.length, 18);
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


test("comptes: format du code, doublon, connexion, mauvais code, premier compte organisateur", async () => {
  const s = await demarrer(null, {}, { sansCompte: true });
  try {
    assert.equal((await s.post("/api/compte/creer", { pseudo: "Anna", code: "court" })).status, 400);
    assert.equal((await s.post("/api/compte/creer", { pseudo: "Anna", code: "abcd-123" })).status, 400);
    const a = await s.post("/api/compte/creer", { pseudo: "Anna", code: "motDe8Ch" });
    assert.equal(a.status, 200);
    assert.equal((await a.json()).moi.role, "superadmin");
    assert.equal((await s.post("/api/compte/creer", { pseudo: "anna", code: "motDe8Ch" })).status, 409);
    const b = await s.post("/api/compte/creer", { pseudo: "Bob", code: "12345678" });
    assert.equal((await b.json()).moi.role, "joueur");
    assert.equal((await s.post("/api/compte/connexion", { pseudo: "Bob", code: "faux12345" })).status, 401);
    assert.equal((await s.post("/api/compte/connexion", { pseudo: "BOB", code: "12345678" })).status, 200);
  } finally { s.fermer(); }
});

async function deuxJoueurs(mj) {
  const s = await demarrer(mj, {}, { sansCompte: true });
  const creer = async (pseudo) => {
    const r = await fetch(s.base + "/api/compte/creer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo, code: "Abcd1234" }) });
    return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  };
  const orga = await creer("Orga"), bob = await creer("Bob");
  const p = (c) => (u, corps) => fetch(s.base + u, { method: "POST", headers: { "content-type": "application/json", cookie: c }, body: JSON.stringify(corps || {}) });
  const g = (c) => (u) => fetch(s.base + u, { headers: { cookie: c } });
  const sortie = { s, orga: { post: p(orga), get: g(orga) }, bob: { post: p(bob), get: g(bob) } };
  await sortie.orga.post("/api/tables/t1/inviter", { pseudo: "Bob" }); // l'accès à une table se fait sur invitation
  return sortie;
}
const MIRA = { id: "mira", base: { ...KORGA.base, nom: "Mira", taille: "Moyenne" }, etat: KORGA.etat };

test("propriété des personnages: un seul par joueur, personne n'agit pour un autre", async () => {
  const mj = fauxMJ([{ texte: "Ok.", appels: [] }]);
  const { s, orga, bob } = await deuxJoueurs(mj);
  try {
    assert.equal((await orga.post("/api/personnages", KORGA)).status, 200);
    assert.equal((await orga.post("/api/personnages", MIRA)).status, 409); // déjà un personnage
    assert.equal((await bob.post("/api/personnages", MIRA)).status, 200);
    assert.equal((await bob.post("/api/dire", { perso: "korga", texte: "je prends sa place" })).status, 403);
    assert.equal((await bob.post("/api/dire", { perso: "mira", texte: "bonjour" })).status, 200);
    // action manuelle, annulation, sauvegarde: organisateur seulement
    assert.equal((await bob.post("/api/action", { action: "modifier_pv", params: { cible: "mira", delta: 5 } })).status, 403);
    assert.equal((await bob.post("/api/annuler", {})).status, 403);
    assert.equal((await bob.get("/api/sauvegarde")).status, 403);
    // les autres ne voient que l'essentiel
    const vu = await (await bob.get("/api/partie")).json();
    assert.equal(vu.personnages.mira.a_moi, true);
    assert.ok(vu.personnages.mira.calcul.stats);
    assert.equal(vu.personnages.korga.reduit, true);
    assert.equal(vu.personnages.korga.calcul.stats, undefined);
    assert.equal(vu.personnages.korga.etat.inventaire, undefined);
    assert.equal(vu.journal, undefined);
    // l'organisateur peut réattribuer
    assert.equal((await bob.post("/api/organisateur/attribuer", { perso: "korga", pseudo: "Bob" })).status, 403);
    assert.equal((await orga.post("/api/organisateur/attribuer", { perso: "mira", pseudo: "Orga" })).status, 409); // Orga a déjà korga
  } finally { s.fermer(); }
});

test("messages privés: /dmj et chuchoter ne sont vus que du destinataire", async () => {
  const mj = fauxMJ([
    { texte: "Tu glisses la main vers sa poche.", appels: [] },                       // réponse privée à Bob
    { texte: "", appels: [{ nom: "chuchoter", args: { cible: "mira", texte: "Une lame brille sous sa cape." } }] },
    { texte: "La salle est calme.", appels: [] }
  ]);
  const { s, orga, bob } = await deuxJoueurs(mj);
  try {
    await orga.post("/api/personnages", KORGA);
    await bob.post("/api/personnages", MIRA);
    let r = await (await bob.post("/api/dire", { perso: "mira", texte: "je fouille sa poche", prive: true })).json();
    assert.match(r.partie.texte.map((t) => t.texte).join("|"), /poche/);
    let vuO = await (await orga.get("/api/partie")).json();
    assert.equal(vuO.texte.length, 0); // rien de privé ne fuit
    await orga.post("/api/dire", { perso: "korga", texte: "je regarde autour" });
    vuO = await (await orga.get("/api/partie")).json();
    assert.ok(!vuO.texte.some((t) => /lame/.test(t.texte)));
    assert.ok(vuO.texte.some((t) => /calme/.test(t.texte)));
    const vuB = await (await bob.get("/api/partie")).json();
    assert.ok(vuB.texte.some((t) => /lame/.test(t.texte)));
    assert.ok(vuB.texte.some((t) => /poche/.test(t.texte)));
  } finally { s.fermer(); }
});

// ---- Tables multiples, invitations, organisateur délégué, ki, migration ----
const MOINE = { id: "lin", base: { ...KORGA.base, nom: "Lin", race: "Humain", classe: "Moine", taille: "Moyenne", niveau: 3 }, etat: KORGA.etat };

async function troisComptes() {
  const s = await demarrer(null, {}, { sansCompte: true });
  const creer = async (pseudo) => {
    const r = await fetch(s.base + "/api/compte/creer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo, code: "Abcd1234" }) });
    return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  };
  const cl = async (pseudo) => {
    const c = await creer(pseudo);
    return {
      post: (u, corps, h) => fetch(s.base + u, { method: "POST", headers: { "content-type": "application/json", cookie: c, ...(h || {}) }, body: JSON.stringify(corps || {}) }),
      get: (u, h) => fetch(s.base + u, { headers: { cookie: c, ...(h || {}) } })
    };
  };
  return { s, admin: await cl("Admin"), eve: await cl("Eve"), max: await cl("Max") };
}

test("tables: accès sur invitation seulement, création réservée au superadmin", async () => {
  const { s, admin, eve } = await troisComptes();
  try {
    assert.equal((await eve.post("/api/tables", { nom: "Ma table" })).status, 403);
    const t = await (await admin.post("/api/tables", { nom: "Les mines" })).json();
    // Eve n'est invitée nulle part: aucune table, rien à lire
    const r = await eve.get("/api/partie");
    assert.equal(r.status, 403);
    assert.equal((await r.json()).etape, "aucune_table");
    assert.equal((await eve.get("/api/partie", { "x-table": t.id })).status, 403);
    assert.deepEqual(await (await eve.get("/api/tables")).json(), []);
    // invitation: seul l'organisateur de la table invite
    assert.equal((await eve.post("/api/tables/" + t.id + "/inviter", { pseudo: "Eve" })).status, 403);
    assert.equal((await admin.post("/api/tables/" + t.id + "/inviter", { pseudo: "Eve" })).status, 200);
    assert.equal((await admin.post("/api/tables/" + t.id + "/inviter", { pseudo: "Inconnu" })).status, 404);
    assert.equal((await eve.get("/api/partie", { "x-table": t.id })).status, 200);
    const liste = await (await eve.get("/api/tables")).json();
    assert.equal(liste.length, 1);
    assert.equal(liste[0].role, "joueur");
    assert.equal(liste[0].membres, undefined); // un simple joueur ne voit pas la liste des membres
    // le superadmin entre sur n'importe quelle table sans invitation
    assert.equal((await admin.get("/api/partie", { "x-table": t.id })).status, 200);
    // retrait
    await admin.post("/api/tables/" + t.id + "/retirer", { pseudo: "Eve" });
    assert.equal((await eve.get("/api/partie", { "x-table": t.id })).status, 403);
  } finally { s.fermer(); }
});

test("tables: personnage de la bibliothèque, un seul actif par table, réutilisable ailleurs", async () => {
  const { s, admin, eve } = await troisComptes();
  try {
    const t1 = await (await admin.post("/api/tables", { nom: "Quête A" })).json();
    const t2 = await (await admin.post("/api/tables", { nom: "Quête B" })).json();
    await admin.post("/api/tables/" + t1.id + "/inviter", { pseudo: "Eve" });
    await admin.post("/api/tables/" + t2.id + "/inviter", { pseudo: "Eve" });
    // création hors table (rejoindre:false): il va dans la bibliothèque
    assert.equal((await eve.post("/api/personnages", { ...KORGA, rejoindre: false })).status, 200);
    assert.equal((await eve.post("/api/personnages", { ...KORGA, rejoindre: false })).status, 409);
    assert.equal((await eve.post("/api/personnages", { ...MIRA, rejoindre: false })).status, 200);
    assert.equal((await (await eve.get("/api/personnages")).json()).length, 2);
    assert.equal((await eve.post("/api/tables/" + t1.id + "/rejoindre", { perso: "korga" })).status, 200);
    assert.equal((await eve.post("/api/tables/" + t1.id + "/rejoindre", { perso: "mira" })).status, 409); // un seul actif par table
    assert.equal((await eve.post("/api/tables/" + t2.id + "/rejoindre", { perso: "mira" })).status, 200); // l'autre table, un autre personnage
    assert.equal((await eve.post("/api/tables/" + t2.id + "/rejoindre", { perso: "inexistant" })).status, 404);
    const v1 = await (await eve.get("/api/partie", { "x-table": t1.id })).json();
    const v2 = await (await eve.get("/api/partie", { "x-table": t2.id })).json();
    assert.deepEqual(Object.keys(v1.personnages), ["korga"]);
    assert.deepEqual(Object.keys(v2.personnages), ["mira"]);
    // sans en-tête et avec deux tables, il faut choisir
    const amb = await eve.get("/api/partie");
    assert.equal(amb.status, 400);
    assert.equal((await amb.json()).etape, "choix_table");
  } finally { s.fermer(); }
});

test("tables: organisateur délégué, droits limités à sa table", async () => {
  const { s, admin, eve, max } = await troisComptes();
  try {
    const ta = await (await admin.post("/api/tables", { nom: "Table d'Eve" })).json();
    const tb = await (await admin.post("/api/tables", { nom: "Autre table" })).json();
    assert.equal((await eve.post("/api/tables/" + ta.id + "/organisateur", { pseudo: "Eve" })).status, 403); // seul le superadmin délègue
    assert.equal((await admin.post("/api/tables/" + ta.id + "/organisateur", { pseudo: "Eve" })).status, 200);
    // Eve organise la table A: elle invite, voit la sauvegarde, annule
    assert.equal((await eve.post("/api/tables/" + ta.id + "/inviter", { pseudo: "Max" })).status, 200);
    assert.equal((await eve.get("/api/sauvegarde", { "x-table": ta.id })).status, 200);
    assert.equal((await eve.get("/api/tables")).status, 200);
    const l = await (await eve.get("/api/tables")).json();
    assert.equal(l.length, 1);
    assert.deepEqual(l[0].membres.sort(), ["Eve", "Max"]);
    // mais pas la table B, ni les droits du superadmin
    assert.equal((await eve.get("/api/sauvegarde", { "x-table": tb.id })).status, 403);
    assert.equal((await eve.post("/api/tables/" + tb.id + "/inviter", { pseudo: "Max" })).status, 403);
    assert.equal((await eve.post("/api/tables", { nom: "Nouvelle" })).status, 403);
    assert.equal((await eve.post("/api/organisateur/reinitialiser", { pseudo: "Max", code: "Nouveau1" })).status, 403);
    // l'organisateur retiré de la délégation redevient simple membre
    await admin.post("/api/tables/" + ta.id + "/organisateur", { pseudo: "" });
    assert.equal((await eve.get("/api/sauvegarde", { "x-table": ta.id })).status, 403);
    // le superadmin garde la main partout
    assert.equal((await admin.post("/api/organisateur/reinitialiser", { pseudo: "Max", code: "Nouveau1" })).status, 200);
    assert.equal((await max.get("/api/partie")).status, 200);
  } finally { s.fermer(); }
});

test("ki du moine: visible par les autres joueurs, décompté à l'usage", async () => {
  const { s, admin, eve } = await troisComptes();
  try {
    const t = await (await admin.post("/api/tables", { nom: "Dojo" })).json();
    await admin.post("/api/tables/" + t.id + "/inviter", { pseudo: "Eve" });
    await eve.post("/api/personnages", { ...MOINE, rejoindre: false });
    assert.equal((await eve.post("/api/tables/" + t.id + "/rejoindre", { perso: "lin" })).status, 200);
    const h = { "x-table": t.id };
    let v = await (await admin.get("/api/partie", h)).json(); // le superadmin n'est pas le propriétaire: il voit la vue réduite
    assert.equal(v.personnages.lin.reduit, true);
    assert.ok(v.personnages.lin.ki.max >= 3);
    assert.equal(v.personnages.lin.ki.restant, v.personnages.lin.ki.max);
    const r = await admin.post("/api/action", { action: "utiliser_pouvoir", params: { cible: "lin", pouvoir: "ki" } }, h);
    assert.equal(r.status, 200);
    v = await (await admin.get("/api/partie", h)).json();
    assert.equal(v.personnages.lin.ki.restant, v.personnages.lin.ki.max - 1);
    await admin.post("/api/action", { action: "repos", params: { type: "court" } }, h);
    v = await (await admin.get("/api/partie", h)).json();
    assert.equal(v.personnages.lin.ki.restant, v.personnages.lin.ki.max);
  } finally { s.fermer(); }
});

test("migration: la partie existante devient la table n°1, ses joueurs en sont membres, ancien rôle devient superadmin", async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "table-"));
  const store = creerFichier(dossier);
  // données d'avant les tables: une partie avec un personnage appartenant au compte "anna", un compte au rôle "organisateur"
  const partie = nouvellePartie("Ancienne partie");
  const p = importerPersonnage(partie, { id: "korga", base: KORGA.base, etat: KORGA.etat });
  p.joueur = "anna";
  await store.ecrire("partie", partie, 0);
  await store.ecrire("joueurs", { joueurs: { anna: { pseudo: "Anna", sel: "00", hash: "00", role: "organisateur" } } }, 0);
  const comptes = creerComptes(store, {});
  assert.equal((await comptes.lire("anna")).role, "superadmin");
  const app = creerApp({ store, mj: null, env: {} });
  const srv = await new Promise((ok) => { const x = app.listen(0, () => ok(x)); });
  const base = "http://127.0.0.1:" + srv.address().port;
  try {
    const c = (await fetch(base + "/api/compte/creer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo: "Bea", code: "Abcd1234" }) }));
    assert.equal(c.status, 200);
    const cookie = c.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
    // Bea n'est membre de rien
    const r = await fetch(base + "/api/partie", { headers: { cookie } });
    assert.equal(r.status, 403);
    // table n°1 existe sous le nom de l'ancienne partie et contient bien le personnage; anna en est membre et son perso est dans sa bibliothèque
    const { creerTables } = require("../src/tables");
    const t = creerTables(store);
    const t1 = await t.lire("t1");
    assert.equal(t1.nom, "Ancienne partie");
    assert.deepEqual(t1.membres, ["anna"]);
    assert.equal((await t.persosDe("anna")).length, 1);
    assert.ok((await t.gestion("t1").lire()).personnages.korga);
  } finally { srv.close(); }
});

test("résultats critiques: la ligne du jet les nomme et le MJ a la consigne", async () => {
  const { SYSTEME } = require("../src/mj/prompt");
  assert.match(SYSTEME, /20 naturel/);
  assert.match(SYSTEME, /1 naturel/);
  assert.match(SYSTEME, /pas de conséquence durable/);
});

test("tables: renommer (organisateur et superadmin) et suggestions sans fuite du privé", async () => {
  const vus = [];
  const mj = { nom: "faux", async generer(x) { vus.push(JSON.stringify(x.messages)); return { texte: "1. La Mine Oubliée\n- Les Échos du Gouffre\n« Rouille et Sang »", appels: [], parts: [] }; } };
  const s = await demarrer(mj, {}, { sansCompte: true });
  const creer = async (pseudo) => {
    const r = await fetch(s.base + "/api/compte/creer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo, code: "Abcd1234" }) });
    const c = r.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
    return { post: (u, b) => fetch(s.base + u, { method: "POST", headers: { "content-type": "application/json", cookie: c }, body: JSON.stringify(b || {}) }), get: (u, h) => fetch(s.base + u, { headers: { cookie: c, ...(h || {}) } }) };
  };
  try {
    const admin = await creer("Admin"), eve = await creer("Eve"), max = await creer("Max");
    const t = await (await admin.post("/api/tables", { nom: "Table test" })).json();
    await admin.post("/api/tables/" + t.id + "/inviter", { pseudo: "Eve" });
    await admin.post("/api/tables/" + t.id + "/inviter", { pseudo: "Max" });
    await admin.post("/api/tables/" + t.id + "/organisateur", { pseudo: "Eve" });
    assert.equal((await max.post("/api/tables/" + t.id + "/renommer", { nom: "Piraté" })).status, 403);
    assert.equal((await eve.post("/api/tables/" + t.id + "/renommer", { nom: "x" })).status, 400);
    assert.equal((await eve.post("/api/tables/" + t.id + "/renommer", { nom: "  Les   mines  de Karn " })).status, 200);
    const liste = await (await admin.get("/api/tables")).json();
    assert.equal(liste.find((x) => x.id === t.id).nom, "Les mines de Karn");
    assert.equal((await (await max.get("/api/partie", { "x-table": t.id })).json()).nom, "Les mines de Karn");
    // sans objectif ni récit: pas de matière
    assert.equal((await eve.post("/api/tables/" + t.id + "/suggestions")).status, 409);
    // avec un objectif et un message privé: le privé ne part pas au modèle
    await admin.post("/api/action?table=" + t.id, { action: "ajouter_objectif", params: { texte: "Retrouver la forge perdue" } });
    const r = await eve.post("/api/tables/" + t.id + "/suggestions");
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).noms, ["La Mine Oubliée", "Les Échos du Gouffre", "Rouille et Sang"]);
    assert.match(vus[0], /forge perdue/);
    assert.equal((await max.post("/api/tables/" + t.id + "/suggestions")).status, 403);
  } finally { s.fermer(); }
});

test("temps: l'état affiche le jour et l'heure, et rappelle au MJ de faire avancer l'heure", async () => {
  const { resume } = require("../src/mj/prompt");
  const { tourMJ } = require("../src/mj/boucle");
  const partie = nouvellePartie("t");
  importerPersonnage(partie, { id: "korga", base: KORGA.base, etat: KORGA.etat });
  assert.match(resume(partie), /jour 1, 08h00/);
  assert.doesNotMatch(resume(partie), /RAPPEL TEMPS/);
  const rien = { async generer() { return { texte: "Rien ne bouge.", appels: [], parts: [] }; } };
  await tourMJ(partie, rien, "[Korga] j'attends");
  await tourMJ(partie, rien, "[Korga] j'attends encore");
  assert.equal(partie.temps.tours_sans_avance, 2);
  assert.match(resume(partie), /RAPPEL TEMPS/);
  const avance = { async generer() { return partie.temps.tours_sans_avance === 2 && !avance.fait ? (avance.fait = true, { texte: "", appels: [{ nom: "avancer_temps", args: { minutes: 10 } }], parts: [] }) : { texte: "Dix minutes passent.", appels: [], parts: [] }; } };
  await tourMJ(partie, avance, "[Korga] je fouille");
  assert.equal(partie.temps.minute, 490);
  assert.equal(partie.temps.tours_sans_avance, 0);
  assert.doesNotMatch(resume(partie), /RAPPEL TEMPS/);
});

test("combat: pas de rappel de temps pendant un combat, rappel de fin si trop long", async () => {
  const { resume } = require("../src/mj/prompt");
  const { tourMJ } = require("../src/mj/boucle");
  const partie = nouvellePartie("t");
  importerPersonnage(partie, { id: "korga", base: KORGA.base, etat: KORGA.etat });
  A.appliquer(partie, "definir_combat", { actif: true }, "mj");
  const rien = { async generer() { return { texte: "Tu frappes.", appels: [], parts: [] }; } };
  for (let i = 0; i < 5; i++) await tourMJ(partie, rien, "[Korga] j'attaque");
  assert.equal(partie.temps.tours_sans_avance, 0);
  assert.match(resume(partie), /COMBAT EN COURS depuis 5/);
  assert.doesNotMatch(resume(partie), /RAPPEL TEMPS/);
  partie.combat.repliques = 40;
  assert.match(resume(partie), /RAPPEL COMBAT/);
});
