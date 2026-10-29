"use strict";
const crypto = require("node:crypto");

// Comptes des joueurs: pseudo + code de 8 caractères (lettres et chiffres). Le code est stocké haché (scrypt).
const CLE = "joueurs";
const CODE_OK = /^[A-Za-z0-9]{8}$/;
const PSEUDO_OK = /^[\p{L}\p{N}_ -]{2,24}$/u;

const cleDe = (pseudo) => String(pseudo || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

function hacher(code, sel) {
  return crypto.scryptSync(String(code), sel, 32).toString("hex");
}

function creerComptes(store, env) {
  let file = Promise.resolve();
  const organisateurEnv = env && env.ORGANISATEUR ? cleDe(env.ORGANISATEUR) : null;
  const essais = new Map(); // limitation des essais: clé -> { n, jusqua }

  async function charger() {
    const e = await store.lire(CLE);
    return e ? { donnees: e.valeur, rev: e.rev } : { donnees: { joueurs: {} }, rev: 0 };
  }
  // Une seule modification à la fois.
  function modifier(fn) {
    const tache = file.then(async () => {
      const { donnees, rev } = await charger();
      const sortie = await fn(donnees);
      await store.ecrire(CLE, donnees, rev);
      return sortie;
    });
    file = tache.catch(() => {});
    return tache;
  }
  const erreur = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });

  function verifierFormat(pseudo, code) {
    if (!PSEUDO_OK.test(String(pseudo || "").trim())) throw erreur("Le pseudo doit faire 2 à 24 caractères (lettres, chiffres, espace, tiret).");
    if (!CODE_OK.test(String(code || ""))) throw erreur("Le code doit faire exactement 8 caractères : lettres et chiffres.");
  }
  function limiter(cle) {
    const e = essais.get(cle);
    if (e && e.jusqua > Date.now()) throw erreur("Trop d'essais. Réessaie dans quelques minutes.", 429);
  }
  function echec(cle) {
    const e = essais.get(cle) || { n: 0, jusqua: 0 };
    e.n += 1;
    if (e.n >= 5) { e.n = 0; e.jusqua = Date.now() + 5 * 60 * 1000; }
    essais.set(cle, e);
  }

  return {
    cleDe,
    async lister() {
      const { donnees } = await charger();
      return Object.keys(donnees.joueurs).map((k) => ({ cle: k, pseudo: donnees.joueurs[k].pseudo, role: donnees.joueurs[k].role }));
    },
    async lire(cle) {
      const { donnees } = await charger();
      const j = donnees.joueurs[cle];
      return j ? { cle, pseudo: j.pseudo, role: j.role } : null;
    },
    async creer(pseudo, code) {
      verifierFormat(pseudo, code);
      return modifier((d) => {
        const cle = cleDe(pseudo);
        if (d.joueurs[cle]) throw erreur("Ce pseudo existe déjà.", 409);
        const sel = crypto.randomBytes(16).toString("hex");
        const premier = Object.keys(d.joueurs).length === 0;
        const organisateur = organisateurEnv ? cle === organisateurEnv : premier;
        d.joueurs[cle] = { pseudo: String(pseudo).trim(), sel, hash: hacher(code, sel), role: organisateur ? "organisateur" : "joueur", cree: new Date().toISOString() };
        return { cle, pseudo: d.joueurs[cle].pseudo, role: d.joueurs[cle].role };
      });
    },
    async verifier(pseudo, code, ip) {
      const lim = cleDe(pseudo) + "|" + (ip || "");
      limiter(lim);
      const { donnees } = await charger();
      const cle = cleDe(pseudo);
      const j = donnees.joueurs[cle];
      const ok = j && String(code || "").length > 0 && crypto.timingSafeEqual(Buffer.from(hacher(code, j.sel), "hex"), Buffer.from(j.hash, "hex"));
      if (!ok) { echec(lim); throw erreur("Pseudo ou code incorrect.", 401); }
      return { cle, pseudo: j.pseudo, role: j.role };
    },
    async changerCode(cle, ancien, nouveau, ip) {
      if (!CODE_OK.test(String(nouveau || ""))) throw erreur("Le code doit faire exactement 8 caractères : lettres et chiffres.");
      const j = await this.lire(cle);
      if (!j) throw erreur("compte inconnu", 404);
      await this.verifier(j.pseudo, ancien, ip);
      return modifier((d) => { const sel = crypto.randomBytes(16).toString("hex"); d.joueurs[cle].sel = sel; d.joueurs[cle].hash = hacher(nouveau, sel); return { ok: true }; });
    },
    // Par l'organisateur: nouveau code pour un joueur qui a oublié le sien.
    async reinitialiser(cle, nouveau) {
      if (!CODE_OK.test(String(nouveau || ""))) throw erreur("Le code doit faire exactement 8 caractères : lettres et chiffres.");
      return modifier((d) => {
        if (!d.joueurs[cle]) throw erreur("joueur inconnu", 404);
        const sel = crypto.randomBytes(16).toString("hex");
        d.joueurs[cle].sel = sel; d.joueurs[cle].hash = hacher(nouveau, sel);
        return { ok: true };
      });
    }
  };
}

module.exports = { creerComptes, cleDe };
