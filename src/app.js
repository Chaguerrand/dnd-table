"use strict";
const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const A = require("./engine/actions");
const P = require("./engine/partie");
const R = require("./engine/regles");
const C = require("./engine/constantes");
const { tourMJ } = require("./mj/boucle");
const { creerGestionnaire } = require("./store");
const { creerComptes } = require("./comptes");

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

// moi = { cle, pseudo, role }; pseudos = { cle: pseudo }
function vue(partie, moi, pseudos) {
  moi = moi || { cle: null, pseudo: null, role: null };
  pseudos = pseudos || {};
  const perso = {};
  for (const [id, p] of Object.entries(partie.personnages)) {
    const mien = !!p.joueur && p.joueur === moi.cle;
    const commun = { id, joueur: p.joueur ? (pseudos[p.joueur] || p.joueur) : null, a_moi: mien };
    if (mien) perso[id] = { ...commun, base: p.base, etat: p.etat, calcul: calculComplet(p) };
    else {
      // les autres voient ce qui se voit: identité, PV, équipement porté
      perso[id] = { ...commun, reduit: true,
        base: { nom: p.base.nom, race: p.base.race, classe: p.base.classe, niveau: p.base.niveau, taille: p.base.taille },
        etat: { pv: p.etat.pv },
        calcul: { pv_max: R.pvMax(p) },
        equipe: (p.etat.inventaire.objets || []).filter((o) => o.equipe).map((o) => o.nom) };
    }
  }
  const proprio = (id) => partie.personnages[id] && partie.personnages[id].joueur;
  const voit = (e) => (!e.prive_a && !e.prive_de) || (e.prive_a && proprio(e.prive_a) === moi.cle) || (e.prive_de && proprio(e.prive_de) === moi.cle);
  const sortie = {
    nom: partie.nom, rev: partie.rev, temps: partie.temps, quetes: { objectifs: partie.quetes.objectifs }, carte: partie.carte,
    jets_en_attente: partie.jets_en_attente, personnages: perso,
    mj_occupe: mjOccupe ? (mjOccupe.perso === "prive" ? { perso: "prive", nom: "" } : { perso: mjOccupe.perso, nom: mjOccupe.nom }) : null,
    texte: partie.texte.filter(voit).slice(-60),
    moi: { pseudo: moi.pseudo, role: moi.role }
  };
  if (moi.role === "organisateur") sortie.journal = partie.journal.slice(-40).map(({ avant, ...e }) => e);
  return sortie;
}

// Qui le MJ est en train de servir (en mémoire seulement, utile quand plusieurs joueurs sont connectés).
let mjOccupe = null;
async function enOccupe(perso, nom, fn) {
  mjOccupe = { perso, nom, depuis: Date.now() };
  try { return await fn(); } finally { mjOccupe = null; }
}

function creerApp({ store, mj, env }) {
  const secret = env.SESSION_SECRET || "dev-secret-a-changer";
  const motDePasse = env.TABLE_PASSWORD || null;
  const prod = env.NODE_ENV === "production";
  const gestion = creerGestionnaire(store, "partie");
  const comptes = creerComptes(store, env);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "5mb" }));

  const cookie = (nom, valeur, age) => nom + "=" + encodeURIComponent(valeur) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + age + (prod ? "; Secure" : "");
  const erreur = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });
  const enveloppe = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (!e.status) console.error("erreur:", e && e.message);
      res.status(e.status || 500).json({ erreur: e.message || "erreur serveur" });
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

  app.get("/sante", (req, res) => res.json({ ok: true, version: (env.RENDER_GIT_COMMIT || "local").slice(0, 7), mj: mj ? mj.nom : null, mot_de_passe: !!motDePasse }));

  // Porte d'entrée de la table (mot de passe commun).
  app.post("/api/connexion", (req, res) => {
    if (motDePasse) {
      const a = Buffer.from(String((req.body && req.body.mot_de_passe) || ""));
      const b = Buffer.from(motDePasse);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) return res.status(401).json({ erreur: "mot de passe incorrect" });
    }
    res.setHeader("Set-Cookie", cookie("table", signer("table", secret), 2592000));
    res.json({ ok: true });
  });

  app.use("/api", (req, res, next) => {
    if (!motDePasse) return next();
    if (verifier(lireCookie(req, "table"), secret)) return next();
    res.status(401).json({ erreur: "connexion requise", etape: "table" });
  });

  // Comptes des joueurs.
  app.post("/api/compte/creer", enveloppe(async (req, res) => {
    const { pseudo, code } = req.body || {};
    const j = await comptes.creer(pseudo, code);
    oublierCache(); poseJoueur(res, j);
    res.json({ moi: { pseudo: j.pseudo, role: j.role } });
  }));
  app.post("/api/compte/connexion", enveloppe(async (req, res) => {
    const { pseudo, code } = req.body || {};
    const j = await comptes.verifier(pseudo, code, req.ip);
    poseJoueur(res, j);
    res.json({ moi: { pseudo: j.pseudo, role: j.role } });
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
  const organisateurSeul = (req) => { if (req.joueur.role !== "organisateur") throw erreur("réservé à l'organisateur", 403); };
  const vuePour = async (req) => vue(await gestion.lire(), req.joueur, await pseudos());
  const verifierProprio = (partie, id, req) => {
    const p = partie.personnages[id];
    if (!p) throw erreur("personnage inconnu", 400);
    if (p.joueur !== req.joueur.cle) throw erreur("ce personnage n'est pas le tien", 403);
    return p;
  };

  app.get("/api/compte", enveloppe(async (req, res) => {
    const partie = await gestion.lire();
    const sortie = { moi: { pseudo: req.joueur.pseudo, role: req.joueur.role } };
    if (req.joueur.role === "organisateur") {
      sortie.joueurs = (await comptes.lister()).map((j) => ({
        pseudo: j.pseudo, role: j.role,
        personnages: Object.values(partie.personnages).filter((p) => p.joueur === j.cle).map((p) => ({ id: p.id, nom: p.base.nom }))
      }));
      sortie.sans_joueur = Object.values(partie.personnages).filter((p) => !p.joueur).map((p) => ({ id: p.id, nom: p.base.nom }));
    }
    res.json(sortie);
  }));
  app.post("/api/compte/code", enveloppe(async (req, res) => {
    const { ancien, nouveau } = req.body || {};
    await comptes.changerCode(req.joueur.cle, ancien, nouveau, req.ip);
    res.json({ ok: true });
  }));
  app.post("/api/organisateur/reinitialiser", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const { pseudo, code } = req.body || {};
    await comptes.reinitialiser(comptes.cleDe(pseudo), code);
    res.json({ ok: true });
  }));
  app.post("/api/organisateur/attribuer", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const { perso, pseudo } = req.body || {};
    const cible = await comptes.lire(comptes.cleDe(pseudo));
    if (!cible) throw erreur("joueur inconnu", 404);
    await gestion.modifier((partie) => {
      const p = partie.personnages[perso];
      if (!p) throw erreur("personnage inconnu", 404);
      if (Object.values(partie.personnages).some((x) => x !== p && x.joueur === cible.cle)) throw erreur("ce joueur a déjà un personnage à cette table", 409);
      p.joueur = cible.cle;
    });
    res.json({ ok: true });
  }));

  // ?depuis=<rev>&occ=<perso> : si rien n'a changé, on renvoie juste {inchange:true} (sondage léger des autres joueurs).
  app.get("/api/partie", enveloppe(async (req, res) => {
    const partie = await gestion.lire();
    const occ = mjOccupe ? mjOccupe.perso : "";
    if (req.query.depuis !== undefined && Number(req.query.depuis) === partie.rev && (req.query.occ || "") === occ) return res.json({ inchange: true });
    res.json(vue(partie, req.joueur, await pseudos()));
  }));

  app.get("/api/sorts", (req, res) => res.json(A.SORTS));

  // Ajout d'un personnage issu de la page de création (sortie "geler"): il appartient au joueur connecté.
  app.post("/api/personnages", enveloppe(async (req, res) => {
    const sortie = await gestion.modifier((partie) => {
      if (Object.values(partie.personnages).some((x) => x.joueur === req.joueur.cle)) throw erreur("tu as déjà un personnage à cette table", 409);
      const p = P.importerPersonnage(partie, req.body);
      p.joueur = req.joueur.cle;
      const r = A.appliquer(partie, "ajouter_journal", { texte: p.base.nom + " rejoint la table." }, "systeme");
      return { id: p.id, journal: r.ok };
    }).catch((e) => ({ erreur: e.message, status: e.status }));
    if (sortie.erreur) return res.status(sortie.status || 400).json({ erreur: sortie.erreur });
    res.json(sortie);
  }));

  // Un joueur dit ou fait quelque chose: le MJ répond. Avec prive:true, c'est un message privé au MJ (commande /dmj).
  app.post("/api/dire", enveloppe(async (req, res) => {
    const { perso, texte, prive } = req.body || {};
    if (!texte || typeof texte !== "string" || texte.length > 1500) return res.status(400).json({ erreur: "texte manquant ou trop long" });
    if (!mj) return res.status(503).json({ erreur: "le MJ n'est pas configuré (clé Gemini manquante)" });
    const sortie = await gestion.modifier(async (partie) => {
      const p = verifierProprio(partie, perso, req);
      if (partie.jets_en_attente.length) throw erreur("un jet de dé est en attente: lancez-le d'abord", 409);
      const ligne = "[" + p.base.nom + "]" + (prive ? " (en privé au MJ)" : "") + " " + texte;
      partie.texte.push({ qui: "joueur", perso, minute: partie.temps.minute, texte: ligne, ...(prive ? { prive_de: perso } : {}) });
      return enOccupe(prive ? "prive" : perso, p.base.nom, () => tourMJ(partie, mj, ligne, prive ? { prive_a: perso } : undefined));
    });
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Le joueur lance le dé demandé: tirage côté serveur, puis le MJ raconte la suite.
  app.post("/api/jets/:id/lancer", enveloppe(async (req, res) => {
    const sortie = await gestion.modifier(async (partie) => {
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
        (j.critique === "reussite" ? " (20 naturel)" : j.critique === "echec" ? " (1 naturel)" : "");
      partie.texte.push({ qui: "joueur", perso: cible, minute: partie.temps.minute, texte: ligne, jet: j });
      if (!mj || (req.body && req.body.sans_mj)) return { resultat: j, texte: "" };
      const m = await enOccupe(cible, nom, () => tourMJ(partie, mj, ligne));
      return { resultat: j, texte: m.texte };
    });
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Le MJ reprend la main après un jet déjà enregistré (ou si sa réponse a échoué).
  app.post("/api/suite", enveloppe(async (req, res) => {
    if (!mj) return res.status(503).json({ erreur: "le MJ n'est pas configuré (clé Gemini manquante)" });
    const sortie = await gestion.modifier(async (partie) => {
      const dernier = partie.texte.at(-1);
      if (!dernier || dernier.qui !== "joueur") throw erreur("rien à reprendre", 409);
      if (partie.jets_en_attente.length) throw erreur("un jet de dé est en attente: lancez-le d'abord", 409);
      const qui = dernier.perso || null;
      if (req.joueur.role !== "organisateur" && !(qui && partie.personnages[qui] && partie.personnages[qui].joueur === req.joueur.cle)) throw erreur("ce n'est pas ton tour de parole", 403);
      const nom = qui && partie.personnages[qui] ? partie.personnages[qui].base.nom : "";
      return enOccupe(dernier.prive_de ? "prive" : qui, nom, () => tourMJ(partie, mj, dernier.texte, dernier.prive_de ? { prive_a: dernier.prive_de } : undefined));
    });
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Sauvegarde complète de la partie (export / import): organisateur seulement.
  app.get("/api/sauvegarde", enveloppe(async (req, res) => { organisateurSeul(req); res.json(await gestion.lire()); }));
  app.post("/api/sauvegarde", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const n = req.body;
    const ok = n && typeof n === "object" && n.version === 1 && n.personnages && typeof n.personnages === "object" &&
      Array.isArray(n.texte) && Array.isArray(n.journal) && Array.isArray(n.jets_en_attente) &&
      n.carte && Array.isArray(n.carte.murs) && n.carte.jetons && n.quetes && Array.isArray(n.quetes.objectifs) && n.temps && Number.isFinite(n.temps.minute);
    if (!ok) return res.status(400).json({ erreur: "ce fichier n'est pas une sauvegarde valide" });
    await gestion.modifier((partie) => {
      for (const k of Object.keys(partie)) delete partie[k];
      Object.assign(partie, JSON.parse(JSON.stringify(n)));
    });
    res.json({ ok: true, partie: await vuePour(req) });
  }));

  app.post("/api/annuler", enveloppe(async (req, res) => {
    organisateurSeul(req);
    const sortie = await gestion.modifier((partie) => A.annuler(partie));
    if (!sortie.ok) return res.status(409).json(sortie);
    res.json({ ...sortie, partie: await vuePour(req) });
  }));

  // Action manuelle: même liste fermée que le MJ. Un joueur ne peut équiper que ses propres objets.
  app.post("/api/action", enveloppe(async (req, res) => {
    const { action, params } = req.body || {};
    if (req.joueur.role !== "organisateur") {
      const partie = await gestion.lire();
      if (action !== "equiper" || !params) throw erreur("réservé à l'organisateur", 403);
      verifierProprio(partie, params.cible, req);
    }
    const sortie = await gestion.modifier((partie) => A.appliquer(partie, action, params, req.joueur.role === "organisateur" ? "organisateur" : req.joueur.pseudo));
    if (!sortie.ok) return res.status(400).json({ erreur: sortie.erreur });
    res.json({ resultat: sortie.resultat, partie: await vuePour(req) });
  }));

  app.use(express.static(path.join(__dirname, "..", "public")));
  return app;
}

module.exports = { creerApp, vue };
