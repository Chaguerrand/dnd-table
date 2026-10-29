"use strict";
const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const A = require("./engine/actions");
const P = require("./engine/partie");
const R = require("./engine/regles");
const C = require("./engine/constantes");
const { tourMJ } = require("./mj/boucle");
const { creerComptes } = require("./comptes");
const { creerTables } = require("./tables");

function signer(valeur, secret) {
  return valeur + "." + crypto.createHmac("sha256", secret).update(valeur).digest("hex");
}
function verifier(cookie, secret) {
  if (!cookie) return false;
  const i = cookie.lastIndexOf(".");
  if (i < 0) return false;
  const attendu = signer(cookie.slice(0, i), secret);
  const a = Buffer.from(cookie), b = Buffer.from(attendu);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function lireCookie(req, nom) {
  const m = (req.headers.cookie || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(nom + "="));
  return m ? decodeURIComponent(m.slice(nom.length + 1)) : null;
}

// Vue de la partie pour un joueur: sans les instantanés d'annulation, sans les secrets des autres.
function calculComplet(p) {
  return {
    stats: Object.fromEntries(["sol", "per", "end", "cha", "int", "agi", "lot", "zen"].map((k) => [k, R.stat(p, k)])),
    vitesse_m: R.vitesse(p), pv_max: R.pvMax(p), charge: R.charge(p),
    modificateurs: Object.fromEntries(["sol", "per", "end", "cha", "int", "agi", "lot", "zen"].map((k) => [k, R.modStat(p, k)])),
    maitrise: R.bonusMaitrise(p.base.niveau),
    armure: R.champ(p, "armure", 10 + R.modStat(p, "agi") + (p.etat.inventaire.objets || []).filter((o) => o.equipe).reduce((s, o) => s + ((o.stats && o.stats.armure) || 0), 0)),
    initiative: R.champ(p, "initiative", R.modStat(p, "agi")),
    competences: Object.fromEntries(Object.keys(C.COMPETENCES).map((n) => [n, { stat: C.COMPETENCES[n], bonus: R.modificateurJet(p, "competence", n), maitrise: R.maitrise(p, n) }])),
    sauvegardes: Object.fromEntries(C.STATS.map((k) => [k, R.modificateurJet(p, "sauvegarde", k)])),
    pouvoirs: R.pouvoirsDe(p).map((d) => ({ ...d, restant: d.max - (p.etat.pouvoirs_utilises[d.id] || 0) })),
    emplacements_max: R.emplacementsMax(p)
  };
}

// moi = { cle, pseudo, role (droit sur la table: "organisateur" | "joueur"), superadmin }; pseudos = { cle: pseudo }
function vue(partie, moi, pseudos, occupe, nomTable) {
  moi = moi || { cle: null, pseudo: null, role: null };
  pseudos = pseudos || {};
  const perso = {};
  for (const [id, p] of Object.entries(partie.personnages)) {
    const mien = !!p.joueur && p.joueur === moi.cle;
    const commun = { id, joueur: p.joueur ? (pseudos[p.joueur] || p.joueur) : null, a_moi: mien };
    if (mien) perso[id] = { ...commun, base: p.base, etat: p.etat, calcul: calculComplet(p) };
    else {
      // les autres voient ce qui se voit: identité, PV, ki, équipement porté
      const ki = R.pouvoirsDe(p).find((d) => d.id === "ki");
      perso[id] = { ...commun, reduit: true,
        base: { nom: p.base.nom, race: p.base.race, classe: p.base.classe, niveau: p.base.niveau, taille: p.base.taille },
        etat: { pv: p.etat.pv },
        calcul: { pv_max: R.pvMax(p) },
        ...(ki ? { ki: { restant: ki.max - (p.etat.pouvoirs_utilises.ki || 0), max: ki.max } } : {}),
        equipe: (p.etat.inventaire.objets || []).filter((o) => o.equipe).map((o) => o.nom) };
    }
  }
  const proprio = (id) => partie.personnages[id] && partie.personnages[id].joueur;
  const voit = (e) => (!e.prive_a && !e.prive_de) || (e.prive_a && proprio(e.prive_a) === moi.cle) || (e.prive_de && proprio(e.prive_de) === moi.cle);
  const sortie = {
    nom: nomTable || partie.nom, rev: partie.rev, temps: partie.temps, quetes: { objectifs: partie.quetes.objectifs }, carte: partie.carte,
    jets_en_attente: partie.jets_en_attente, personnages: perso,
    mj_occupe: occupe ? (occupe.perso === "prive" ? { perso: "prive", nom: "" } : { perso: occupe.perso, nom: occupe.nom }) : null,
    texte: partie.texte.filter(voit).slice(-60),
    moi: { pseudo: moi.pseudo, role: moi.role, superadmin: !!moi.superadmin }
  };
  if (moi.role === "organisateur") sortie.journal = partie.journal.slice(-40).map(({ avant, ...e }) => e);
  return sortie;
}

function creerApp({ store, mj, env }) {
  const secret = env.SESSION_SECRET || "dev-secret-a-changer";
  const prod = env.NODE_ENV === "production";
  const comptes = creerComptes(store, env);
  const tables = creerTables(store);
  const occupes = new Map(); // id de table -> { perso, nom, depuis } : qui le MJ est en train de servir (en mémoire)
  const enOccupe = async (tid, perso, nom, fn) => {
    occupes.set(tid, { perso, nom, depuis: Date.now() });
    try { return await fn(); } finally { occupes.delete(tid); }
  };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "5mb" }));

  const cookie = (nom, valeur, age) => nom + "=" + encodeURIComponent(valeur) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + age + (prod ? "; Secure" : "");
  const erreur = (msg, status, etape) => Object.assign(new Error(msg), { status: status || 400, etape });
  const enveloppe = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (!e.status) console.error("erreur:", e && e.message);
      res.status(e.status || 500).json({ erreur: e.message || "erreur serveur", ...(e.etape ? { etape: e.etape } : {}) });
    }
  };

  // Petit cache des comptes (évite une lecture en base à chaque requête).
  let cachePseudos = { t: 0, v: {} };
  async function pseudos() {
    if (Date.now() - cachePseudos.t > 15000) {
      const l = await comptes.lister();
      cachePseudos = { t: Date.now(), v: Object.fromEntries(l.map((j) => [j.cle, j.pseudo])) };
    }
    return cachePseudos.v;
  }
  const oublierCache = () => { cachePseudos.t = 0; };
  const poseJoueur = (res, j, extra) => res.setHeader("Set-Cookie", [cookie("joueur", signer(j.cle, secret), 2592000)].concat(extra || []));
  const moiPublic = (j) => ({ pseudo: j.pseudo, role: j.role, superadmin: j.role === "superadmin" });

  app.get("/sante", (req, res) => res.json({ ok: true, version: (env.RENDER_GIT_COMMIT || "local").slice(0, 7), mj: mj ? mj.nom : null }));

  // Comptes des joueurs.
  app.post("/api/compte/creer", enveloppe(async (req, res) => {
    const { pseudo, code } = req.body || {};
    const j = await comptes.creer(pseudo, code);
    oublierCache(); poseJoueur(res, j);
    res.json({ moi: moiPublic(j) });
  }));
  app.post("/api/compte/connexion", enveloppe(async (req, res) => {
    const { pseudo, code } = req.body || {};
    const j = await comptes.verifier(pseudo, code, req.ip);
    poseJoueur(res, j);
    res.json({ moi: moiPublic(j) });
  }));
  app.post("/api/compte/deconnexion", (req, res) => {
    res.setHeader("Set-Cookie", cookie("joueur", "", 0));
    res.json({ ok: true });
  });

  // À partir d'ici il faut un compte.
  app.use("/api", async (req, res, next) => {
    try {
      const brut = lireCookie(req, "joueur");
      if (!brut || !verifier(brut, secret)) return res.status(401).json({ erreur: "compte requis", etape: "compte" });
      const j = await comptes.lire(brut.slice(0, brut.lastIndexOf(".")));
      if (!j) return res.status(401).json({ erreur: "compte requis", etape: "compte" });
      req.joueur = j;
      next();
    } catch (e) { res.status(500).json({ erreur: e.message }); }
  });
  const superadminSeul = (req) => { if (req.joueur.role !== "superadmin") throw erreur("réservé au superadmin", 403); };
  const organisateurSeul = (req) => { if (req.droit !== "organisateur") throw erreur("réservé à l'organisateur de la table", 403); };

  // Table courante: en-tête X-Table (ou ?table=). Sans indication, la seule table accessible, ou la table n°1 pour le superadmin.
  async function resoudreTable(req) {
    const accessibles = await tables.accessibles(req.joueur);
    const demande = req.headers["x-table"] || req.query.table || null;
    let t;
    if (demande) {
      t = accessibles.find((x) => x.id === demande);
      if (!t) throw erreur("table inaccessible", 403, "choix_table");
    } else if (accessibles.length === 1) t = accessibles[0];
    else if (!accessibles.length) throw erreur("Tu n'as été invité à aucune table.", 403, "aucune_table");
    else {
      t = accessibles.find((x) => x.id === "t1") || (req.joueur.role === "superadmin" ? accessibles[0] : null);
      if (!t) throw erreur("Choisis une table.", 400, "choix_table");
    }
    req.table = t; req.droit = t.droit; req.gestion = tables.gestion(t.id);
    req.moi = { cle: req.joueur.cle, pseudo: req.joueur.pseudo, role: t.droit, superadmin: req.joueur.role === "superadmin" };
  }
  const avecTable = async (req, res, next) => {
    try { await resoudreTable(req); next(); } catch (e) {
      res.status(e.status || 500).json({ erreur: e.message, ...(e.etape ? { etape: e.etape } : {}) });
    }
  };
  app.use(["/api/partie", "/api/dire", "/api/jets", "/api/suite", "/api/sauvegarde", "/api/annuler", "/api/action", "/api/organisateur/attribuer"], avecTable);

  const vuePour = async (req) => vue(await req.gestion.lire(), req.moi, await pseudos(), occupes.get(req.table.id), req.table.nom);
  const verifierProprio = (partie, id, req) => {
    const p = partie.personnages[id];
    if (!p) throw erreur("personnage inconnu", 400);
    if (p.joueur !== req.joueur.cle) throw erreur("ce personnage n'est pas le tien", 403);
    return p;
  };
  const trouverCompte = async (pseudo) => {
    const c = await comptes.lire(comptes.cleDe(pseudo));
    if (!c) throw erreur("joueur inconnu", 404);
    return c;
  };
  // Table visée par une route /api/tables/:id/...: il faut y avoir accès.
  async function tableDeRoute(req, organisateur) {
    const t = await tables.lire(req.params.id);
    if (!t) throw erreur("table inconnue", 404);
    const droit = tables.droitDe(t, req.joueur);
    if (!droit) throw erreur("table inaccessible", 403);
    if (organisateur && droit !== "organisateur") throw erreur("réservé à l'organisateur de la table", 403);
    return { t, droit };
  }
  // Copie un personnage de la bibliothèque dans la partie de la table: un seul par joueur et par table.
  const rejoindre = (gestion, joueur, entree) => gestion.modifier((partie) => {
    if (Object.values(partie.personnages).some((x) => x.joueur === joueur.cle)) throw erreur("tu as déjà un personnage à cette table", 409);
    if (partie.personnages[entree.id]) throw erreur("un personnage porte déjà cet identifiant à cette table", 409);
    const p = P.importerPersonnage(partie, { id: entree.id, base: entree.base, etat: entree.etat });
    p.joueur = joueur.cle;
    const r = A.appliquer(partie, "ajouter_journal", { texte: p.base.nom + " rejoint la table." }, "systeme");
    return { id: p.id, journal: r.ok };
  });

  app.get("/api/compte", enveloppe(async (req, res) => {
    const sortie = { moi: moiPublic(req.joueur) };
    try { await resoudreTable(req); } catch (e) { /* pas de table courante: on renvoie juste le compte */ }
    if (req.table && req.droit === "organisateur") {
      const partie = await req.gestion.lire();
      // le superadmin voit tous les comptes; un organisateur délégué, seulement les membres de sa table
      sortie.joueurs = (await comptes.lister()).filter((j) => req.joueur.role === "superadmin" || req.table.membres.includes(j.cle)).map((j) => ({
        pseudo: j.pseudo, role: j.role,
        personnages: Object.values(partie.personnages).filter((p) => p.joueur === j.cle).map((p) => ({ id: p.id, nom: p.base.nom }))
      }));
      sortie.sans_joueur = Object.values(partie.personnages).filter((p) => !p.joueur).map((p) => ({ id: p.id, nom: p.base.nom }));
    }
    if (req.table) sortie.table = { id: req.table.id, nom: req.table.nom, role: req.droit };
    res.json(sortie);
  }));
  app.post("/api/compte/code", enveloppe(async (req, res) => {
    const { ancien, nouveau } = req.body || {};
    await comptes.changerCode(req.joueur.cle, ancien, nouveau, req.ip);
    res.json({ ok: true });
  }));
  // Réinitialiser le code d'un compte donne accès à ses autres tables: superadmin seulement.
  app.post("/api/organisateur/reinitialiser", enveloppe(async (req, res) => {
    superadminSeul(req);
    const { pseudo, code } = req.body || {};
    await comptes.reinitialiser(comptes.cleDe(pseudo), code);
    res.json({ ok: true });
  }));
  app.post("/api/organisateur/attribuer", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const { perso, pseudo } = req.body || {};
    const cible = await trouverCompte(pseudo);
    await req.gestion.modifier((partie) => {
      const p = partie.personnages[perso];
      if (!p) throw erreur("personnage inconnu", 404);
      if (Object.values(partie.personnages).some((x) => x !== p && x.joueur === cible.cle)) throw erreur("ce joueur a déjà un personnage à cette table", 409);
      p.joueur = cible.cle;
    });
    await tables.inviter(req.table.id, cible.cle);
    res.json({ ok: true });
  }));

  // Tables: liste de celles auxquelles j'ai accès, création (superadmin), invitations (organisateur de la table).
  app.get("/api/tables", enveloppe(async (req, res) => {
    const p = await pseudos();
    const liste = await tables.accessibles(req.joueur);
    const sortie = [];
    for (const t of liste) {
      const partie = await tables.gestion(t.id).lire();
      const mien = Object.values(partie.personnages).find((x) => x.joueur === req.joueur.cle);
      sortie.push({
        id: t.id, nom: t.nom, role: t.droit,
        organisateur: t.organisateur ? (p[t.organisateur] || t.organisateur) : null,
        mon_perso: mien ? { id: mien.id, nom: mien.base.nom } : null,
        ...(t.droit === "organisateur" ? { membres: t.membres.map((m) => p[m] || m) } : {})
      });
    }
    res.json(sortie);
  }));
  app.post("/api/tables", enveloppe(async (req, res) => {
    superadminSeul(req);
    const t = await tables.creer(req.body && req.body.nom, req.joueur.cle);
    res.json({ id: t.id, nom: t.nom });
  }));
  app.post("/api/tables/:id/organisateur", enveloppe(async (req, res) => {
    superadminSeul(req);
    const pseudo = req.body && req.body.pseudo;
    const cible = pseudo ? await trouverCompte(pseudo) : null;
    if (!(await tables.lire(req.params.id))) throw erreur("table inconnue", 404);
    await tables.definirOrganisateur(req.params.id, cible ? cible.cle : null);
    res.json({ ok: true });
  }));
  // Renommer: organisateur de la table ou superadmin.
  app.post("/api/tables/:id/renommer", enveloppe(async (req, res) => {
    await tableDeRoute(req, true);
    const t = await tables.renommer(req.params.id, req.body && req.body.nom);
    res.json({ id: t.id, nom: t.nom });
  }));
  // Suggestions de noms tirées de la quête en cours (objectifs) et du récit public. Rien de privé n'est transmis au modèle.
  app.post("/api/tables/:id/suggestions", enveloppe(async (req, res) => {
    const { t } = await tableDeRoute(req, true);
    if (!mj) throw erreur("le MJ n'est pas configuré (clé Gemini manquante)", 503);
    const partie = await tables.gestion(t.id).lire();
    const objectifs = partie.quetes.objectifs.map((o) => o.texte);
    const recit = partie.texte.filter((e) => !e.prive_a && !e.prive_de && e.qui === "mj").slice(-6).map((e) => e.texte);
    if (!objectifs.length && !recit.length) throw erreur("Pas encore de matière : la table n'a ni objectif de quête ni récit. Les suggestions viendront avec la quête.", 409);
    const consigne = "Nom actuel de la table: " + t.nom + "\nObjectifs de la quête: " + (objectifs.join(" | ") || "aucun") + "\nDébut du récit: " + (recit.join(" | ") || "aucun") +
      "\n\nPropose 5 noms courts (2 à 5 mots) pour cette table de jeu de rôle, en français, évocateurs de la quête. Un nom par ligne, sans numéro, sans guillemets, sans commentaire.";
    const rep = await mj.generer({ systeme: "Tu proposes des titres de quête pour une table de Donjons et Dragons. Tu réponds uniquement par la liste demandée.", messages: [{ role: "user", texte: consigne }], outils: [] });
    const noms = [...new Set(String(rep.texte || "").split("\n").map((l) => l.replace(/^[\s\-*\d.)]+/, "").replace(/["«»]/g, "").trim()).filter((l) => l.length >= 2 && l.length <= 60))].slice(0, 5);
    if (!noms.length) throw erreur("Le MJ n'a proposé aucun nom exploitable, réessaie.", 502);
    res.json({ noms });
  }));
  app.post("/api/tables/:id/inviter", enveloppe(async (req, res) => {
    await tableDeRoute(req, true);
    const cible = await trouverCompte(req.body && req.body.pseudo);
    await tables.inviter(req.params.id, cible.cle);
    res.json({ ok: true });
  }));
  app.post("/api/tables/:id/retirer", enveloppe(async (req, res) => {
    await tableDeRoute(req, true);
    const cible = await trouverCompte(req.body && req.body.pseudo);
    await tables.retirer(req.params.id, cible.cle);
    res.json({ ok: true });
  }));
  // Un joueur invité choisit un de ses personnages pour entrer sur la table.
  app.post("/api/tables/:id/rejoindre", enveloppe(async (req, res) => {
    await tableDeRoute(req, false);
    const entree = await tables.persoDe(req.joueur.cle, req.body && req.body.perso);
    if (!entree) throw erreur("personnage inconnu dans ta bibliothèque", 404);
    res.json(await rejoindre(tables.gestion(req.params.id), req.joueur, entree));
  }));

  // Bibliothèque de mes personnages (indépendante des tables).
  app.get("/api/personnages", enveloppe(async (req, res) => {
    const l = await tables.persosDe(req.joueur.cle);
    res.json(l.map((p) => ({ id: p.id, nom: p.base.nom, race: p.base.race, classe: p.base.classe, niveau: p.base.niveau })));
  }));
  // Nouveau personnage issu de la page de création (sortie "geler"): il entre dans ma bibliothèque,
  // et rejoint aussi la table courante sauf si rejoindre:false.
  app.post("/api/personnages", enveloppe(async (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.base || !b.etat) throw erreur("personnage incomplet");
    if (await tables.persoDe(req.joueur.cle, b.id)) throw erreur("tu as déjà un personnage avec cet identifiant", 409);
    let sortie = { id: b.id };
    if (b.rejoindre !== false) {
      try { await resoudreTable(req); } catch (e) { req.table = null; }
      if (req.table) sortie = await rejoindre(req.gestion, req.joueur, b);
    }
    await tables.ajouterPerso(req.joueur.cle, { id: b.id, base: b.base, etat: b.etat });
    res.json(sortie);
  }));

  // ?depuis=<rev>&occ=<perso> : si rien n'a changé, on renvoie juste {inchange:true} (sondage léger des autres joueurs).
  app.get("/api/partie", enveloppe(async (req, res) => {
    const partie = await req.gestion.lire();
    const occupe = occupes.get(req.table.id);
    const occ = occupe ? occupe.perso : "";
    if (req.query.depuis !== undefined && Number(req.query.depuis) === partie.rev && (req.query.occ || "") === occ) return res.json({ inchange: true });
    res.json(vue(partie, req.moi, await pseudos(), occupe, req.table.nom));
  }));

  app.get("/api/sorts", (req, res) => res.json(A.SORTS));

  // Un joueur dit ou fait quelque chose: le MJ répond. Avec prive:true, c'est un message privé au MJ (commande /dmj).
  app.post("/api/dire", enveloppe(async (req, res) => {
    const { perso, texte, prive } = req.body || {};
    if (!texte || typeof texte !== "string" || texte.length > 1500) return res.status(400).json({ erreur: "texte manquant ou trop long" });
    if (!mj) return res.status(503).json({ erreur: "le MJ n'est pas configuré (clé Gemini manquante)" });
    const sortie = await req.gestion.modifier(async (partie) => {
      const p = verifierProprio(partie, perso, req);
      if (partie.jets_en_attente.length) throw erreur("un jet de dé est en attente: lancez-le d'abord", 409);
      const ligne = "[" + p.base.nom + "]" + (prive ? " (en privé au MJ)" : "") + " " + texte;
      partie.texte.push({ qui: "joueur", perso, minute: partie.temps.minute, texte: ligne, ...(prive ? { prive_de: perso } : {}) });
      return enOccupe(req.table.id, prive ? "prive" : perso, p.base.nom, () => tourMJ(partie, mj, ligne, prive ? { prive_a: perso } : undefined));
    });
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Le joueur lance le dé demandé: tirage côté serveur, puis le MJ raconte la suite.
  app.post("/api/jets/:id/lancer", enveloppe(async (req, res) => {
    const sortie = await req.gestion.modifier(async (partie) => {
      const jet = partie.jets_en_attente.find((x) => x.id === req.params.id);
      if (!jet) throw erreur("jet introuvable: " + req.params.id, 404);
      verifierProprio(partie, jet.cible, req);
      const r = A.resoudreJet(partie, req.params.id, jet.cible);
      if (!r.ok) throw erreur(r.erreur, 404);
      const j = r.resultat;
      const cible = jet.cible;
      const nom = partie.personnages[cible].base.nom;
      const ligne = "[Jet de dé] " + nom + " (" + j.nom + "): " + j.tirages.join(" et ") + (j.modificateur ? (j.modificateur > 0 ? " + " : " - ") + Math.abs(j.modificateur) : "") +
        " = " + j.total + (j.dd != null ? " contre " + j.dd + (j.reussi ? " : réussite" : " : échec") : "") +
        (j.critique === "reussite" ? " (20 naturel : réussite critique)" : j.critique === "echec" ? " (1 naturel : échec critique)" : "");
      partie.texte.push({ qui: "joueur", perso: cible, minute: partie.temps.minute, texte: ligne, jet: j });
      if (!mj || (req.body && req.body.sans_mj)) return { resultat: j, texte: "" };
      const m = await enOccupe(req.table.id, cible, nom, () => tourMJ(partie, mj, ligne));
      return { resultat: j, texte: m.texte };
    });
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Le MJ reprend la main après un jet déjà enregistré (ou si sa réponse a échoué).
  app.post("/api/suite", enveloppe(async (req, res) => {
    if (!mj) return res.status(503).json({ erreur: "le MJ n'est pas configuré (clé Gemini manquante)" });
    const sortie = await req.gestion.modifier(async (partie) => {
      const dernier = partie.texte.at(-1);
      if (!dernier || dernier.qui !== "joueur") throw erreur("rien à reprendre", 409);
      if (partie.jets_en_attente.length) throw erreur("un jet de dé est en attente: lancez-le d'abord", 409);
      const qui = dernier.perso || null;
      if (req.droit !== "organisateur" && !(qui && partie.personnages[qui] && partie.personnages[qui].joueur === req.joueur.cle)) throw erreur("ce n'est pas ton tour de parole", 403);
      const nom = qui && partie.personnages[qui] ? partie.personnages[qui].base.nom : "";
      return enOccupe(req.table.id, dernier.prive_de ? "prive" : qui, nom, () => tourMJ(partie, mj, dernier.texte, dernier.prive_de ? { prive_a: dernier.prive_de } : undefined));
    });
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Sauvegarde complète de la partie (export / import): organisateur de la table seulement.
  app.get("/api/sauvegarde", enveloppe(async (req, res) => { organisateurSeul(req); res.json(await req.gestion.lire()); }));
  app.post("/api/sauvegarde", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const n = req.body;
    const ok = n && typeof n === "object" && n.version === 1 && n.personnages && typeof n.personnages === "object" &&
      Array.isArray(n.texte) && Array.isArray(n.journal) && Array.isArray(n.jets_en_attente) &&
      n.carte && Array.isArray(n.carte.murs) && n.carte.jetons && n.quetes && Array.isArray(n.quetes.objectifs) && n.temps && Number.isFinite(n.temps.minute);
    if (!ok) return res.status(400).json({ erreur: "ce fichier n'est pas une sauvegarde valide" });
    await req.gestion.modifier((partie) => {
      for (const k of Object.keys(partie)) delete partie[k];
      Object.assign(partie, JSON.parse(JSON.stringify(n)));
    });
    res.json({ ok: true, partie: await vuePour(req) });
  }));

  app.post("/api/annuler", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const sortie = await req.gestion.modifier((partie) => A.annuler(partie));
    if (!sortie.ok) return res.status(409).json(sortie);
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Action manuelle: même liste fermée que le MJ. Un joueur ne peut équiper que ses propres objets.
  app.post("/api/action", enveloppe(async (req, res) => {
    const { action, params } = req.body || {};
    if (req.droit !== "organisateur") {
      const partie = await req.gestion.lire();
      if (action !== "equiper" || !params) throw erreur("réservé à l'organisateur", 403);
      verifierProprio(partie, params.cible, req);
    }
    const sortie = await req.gestion.modifier((partie) => A.appliquer(partie, action, params, req.droit === "organisateur" ? "organisateur" : req.joueur.pseudo));
    if (!sortie.ok) return res.status(400).json({ erreur: sortie.erreur });
    res.json({ resultat: sortie.resultat, partie: await vuePour(req) });
  }));

  app.use(express.static(path.join(__dirname, "..", "public")));
  return app;
}

module.exports = { creerApp, vue };
