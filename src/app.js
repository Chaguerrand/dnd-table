"use strict";
const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const A = require("./engine/actions");
const P = require("./engine/partie");
const R = require("./engine/regles");
const { tourMJ } = require("./mj/boucle");
const { creerGestionnaire } = require("./store");

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

// Vue de la partie pour le client: sans les instantanés d'annulation, avec les valeurs calculées.
function vue(partie) {
  const perso = {};
  for (const [id, p] of Object.entries(partie.personnages)) {
    perso[id] = {
      id, base: p.base, etat: p.etat,
      calcul: {
        stats: Object.fromEntries(["sol", "per", "end", "cha", "int", "agi", "lot", "zen"].map((k) => [k, R.stat(p, k)])),
        vitesse_m: R.vitesse(p), pv_max: R.pvMax(p), charge: R.charge(p),
        pouvoirs: R.pouvoirsDe(p).map((d) => ({ ...d, restant: d.max - (p.etat.pouvoirs_utilises[d.id] || 0) })),
        emplacements_max: R.emplacementsMax(p)
      }
    };
  }
  return {
    nom: partie.nom, rev: partie.rev, temps: partie.temps, quetes: partie.quetes, carte: partie.carte,
    jets_en_attente: partie.jets_en_attente, personnages: perso,
    journal: partie.journal.slice(-40).map(({ avant, ...e }) => e),
    texte: partie.texte.slice(-60)
  };
}

function creerApp({ store, mj, env }) {
  const secret = env.SESSION_SECRET || "dev-secret-a-changer";
  const motDePasse = env.TABLE_PASSWORD || null;
  const gestion = creerGestionnaire(store, "partie");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "200kb" }));

  app.get("/sante", (req, res) => res.json({ ok: true, mj: mj ? mj.nom : null, mot_de_passe: !!motDePasse }));

  app.post("/api/connexion", (req, res) => {
    if (motDePasse) {
      const a = Buffer.from(String((req.body && req.body.mot_de_passe) || ""));
      const b = Buffer.from(motDePasse);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) return res.status(401).json({ erreur: "mot de passe incorrect" });
    }
    const jeton = signer("table", secret);
    res.setHeader("Set-Cookie", "table=" + encodeURIComponent(jeton) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000" + (env.NODE_ENV === "production" ? "; Secure" : ""));
    res.json({ ok: true });
  });

  app.use("/api", (req, res, next) => {
    if (!motDePasse) return next();
    if (verifier(lireCookie(req, "table"), secret)) return next();
    res.status(401).json({ erreur: "connexion requise" });
  });

  const enveloppe = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      console.error("erreur:", e && e.message);
      res.status(e.status || 500).json({ erreur: e.message || "erreur serveur" });
    }
  };

  app.get("/api/partie", enveloppe(async (req, res) => res.json(vue(await gestion.lire()))));

  app.get("/api/sorts", (req, res) => res.json(A.SORTS));

  // Ajout d'un personnage issu de la page de création (sortie "geler").
  app.post("/api/personnages", enveloppe(async (req, res) => {
    const sortie = await gestion.modifier((partie) => {
      const p = P.importerPersonnage(partie, req.body);
      const r = A.appliquer(partie, "ajouter_journal", { texte: p.base.nom + " rejoint la table." }, "systeme");
      return { id: p.id, journal: r.ok };
    }).catch((e) => ({ erreur: e.message }));
    if (sortie.erreur) return res.status(400).json(sortie);
    res.json(sortie);
  }));

  // Un joueur dit ou fait quelque chose: le MJ répond.
  app.post("/api/dire", enveloppe(async (req, res) => {
    const { perso, texte } = req.body || {};
    if (!texte || typeof texte !== "string" || texte.length > 1500) return res.status(400).json({ erreur: "texte manquant ou trop long" });
    if (!mj) return res.status(503).json({ erreur: "le MJ n'est pas configuré (clé Gemini manquante)" });
    const sortie = await gestion.modifier(async (partie) => {
      const p = partie.personnages[perso];
      if (!p) throw Object.assign(new Error("personnage inconnu"), { status: 400 });
      if (partie.jets_en_attente.length) throw Object.assign(new Error("un jet de dé est en attente: lancez-le d'abord"), { status: 409 });
      const ligne = "[" + p.base.nom + "] " + texte;
      partie.texte.push({ qui: "joueur", perso, minute: partie.temps.minute, texte: ligne });
      return tourMJ(partie, mj, ligne);
    });
    res.json({ ...sortie, partie: vue(await gestion.lire()) });
  }));

  // Le joueur lance le dé demandé: tirage côté serveur, puis le MJ raconte la suite.
  app.post("/api/jets/:id/lancer", enveloppe(async (req, res) => {
    const sortie = await gestion.modifier(async (partie) => {
      const r = A.resoudreJet(partie, req.params.id, req.body && req.body.perso);
      if (!r.ok) throw Object.assign(new Error(r.erreur), { status: 404 });
      const j = r.resultat;
      const nom = partie.personnages[partie.journal.at(-1).cible].base.nom;
      const ligne = "[Jet de dé] " + nom + " (" + j.nom + "): " + j.tirages.join(" et ") + (j.modificateur ? (j.modificateur > 0 ? " + " : " - ") + Math.abs(j.modificateur) : "") +
        " = " + j.total + (j.dd != null ? " contre " + j.dd + (j.reussi ? " : réussite" : " : échec") : "") +
        (j.critique === "reussite" ? " (20 naturel)" : j.critique === "echec" ? " (1 naturel)" : "");
      partie.texte.push({ qui: "joueur", perso: partie.journal.at(-1).cible, minute: partie.temps.minute, texte: ligne, jet: j });
      if (!mj) return { resultat: j, texte: "" };
      const m = await tourMJ(partie, mj, ligne);
      return { resultat: j, texte: m.texte };
    });
    res.json({ ...sortie, partie: vue(await gestion.lire()) });
  }));

  app.post("/api/annuler", enveloppe(async (req, res) => {
    const sortie = await gestion.modifier((partie) => A.annuler(partie));
    if (!sortie.ok) return res.status(409).json(sortie);
    res.json({ ...sortie, partie: vue(await gestion.lire()) });
  }));

  // Action manuelle (pour l'organisateur ou le test): même liste fermée que le MJ.
  app.post("/api/action", enveloppe(async (req, res) => {
    const { action, params } = req.body || {};
    const sortie = await gestion.modifier((partie) => A.appliquer(partie, action, params, "organisateur"));
    if (!sortie.ok) return res.status(400).json({ erreur: sortie.erreur });
    res.json({ resultat: sortie.resultat, partie: vue(await gestion.lire()) });
  }));

  app.use(express.static(path.join(__dirname, "..", "public")));
  return app;
}

module.exports = { creerApp, vue };
