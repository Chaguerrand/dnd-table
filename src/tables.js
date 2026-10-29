"use strict";
const crypto = require("node:crypto");
const { creerGestionnaire } = require("./store");

// Tables de jeu (une table = une quête = une partie), membres par invitation, et bibliothèque de personnages
// rattachés aux comptes. La partie de la table "t1" reste stockée sous la clé historique "partie".
const CLE_TABLES = "tables";
const CLE_BIB = "bibliotheque";
const cleJeu = (id) => (id === "t1" ? "partie" : "partie-" + id);

const erreur = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });

// Document simple avec écritures sérialisées et révision optimiste.
function creerDoc(store, cle, vide) {
  let file = Promise.resolve();
  async function charger() {
    const e = await store.lire(cle);
    return e ? { donnees: e.valeur, rev: e.rev } : { donnees: vide(), rev: 0 };
  }
  return {
    lire: async () => (await charger()).donnees,
    modifier(fn) {
      const tache = file.then(async () => {
        const { donnees, rev } = await charger();
        const sortie = await fn(donnees);
        await store.ecrire(cle, donnees, rev);
        return sortie;
      });
      file = tache.catch(() => {});
      return tache;
    }
  };
}

function creerTables(store) {
  const reg = creerDoc(store, CLE_TABLES, () => ({ tables: {}, migre: false }));
  const bib = creerDoc(store, CLE_BIB, () => ({ persos: {} }));
  const gestionnaires = new Map();
  let pret = null;

  // Migration idempotente: la partie existante devient la table "t1", ses joueurs en sont membres et
  // leurs personnages entrent dans la bibliothèque de leur compte.
  function assurer() {
    if (!pret) {
      pret = (async () => {
        const deja = await reg.lire();
        if (deja.migre) return;
        const e = await store.lire("partie");
        const partie = e ? e.valeur : null;
        const membres = new Set();
        await bib.modifier((b) => {
          if (!partie) return;
          for (const p of Object.values(partie.personnages || {})) {
            if (!p.joueur) continue;
            membres.add(p.joueur);
            const k = p.joueur + "/" + p.id;
            if (!b.persos[k]) b.persos[k] = { id: p.id, joueur: p.joueur, base: p.base, etat: p.etat };
          }
        });
        await reg.modifier((d) => {
          if (d.migre) return;
          if (!d.tables.t1) d.tables.t1 = { id: "t1", nom: (partie && partie.nom) || "Ma partie", createur: null, organisateur: null, membres: [...membres], cree: new Date().toISOString() };
          d.migre = true;
        });
      })().catch((e) => { pret = null; throw e; });
    }
    return pret;
  }

  const droitDe = (t, joueur) => {
    if (joueur.role === "superadmin") return "organisateur";
    if (t.organisateur && t.organisateur === joueur.cle) return "organisateur";
    if (t.membres.includes(joueur.cle)) return "joueur";
    return null;
  };

  return {
    assurer, droitDe, cleJeu,
    gestion(id) {
      if (!gestionnaires.has(id)) gestionnaires.set(id, creerGestionnaire(store, cleJeu(id)));
      return gestionnaires.get(id);
    },
    async lire(id) { await assurer(); const d = await reg.lire(); return d.tables[id] || null; },
    // Tables auxquelles ce compte a accès, avec son droit.
    async accessibles(joueur) {
      await assurer();
      const d = await reg.lire();
      return Object.values(d.tables).map((t) => ({ ...t, droit: droitDe(t, joueur) })).filter((t) => t.droit);
    },
    async creer(nom, createur) {
      await assurer();
      const n = String(nom || "").trim();
      if (n.length < 2 || n.length > 60) throw erreur("Le nom de la table doit faire 2 à 60 caractères.");
      return reg.modifier((d) => {
        const id = "t" + crypto.randomBytes(4).toString("hex");
        d.tables[id] = { id, nom: n, createur, organisateur: null, membres: [], cree: new Date().toISOString() };
        return d.tables[id];
      });
    },
    async definirOrganisateur(id, cle) {
      await assurer();
      return reg.modifier((d) => {
        const t = d.tables[id];
        if (!t) throw erreur("table inconnue", 404);
        t.organisateur = cle || null;
        if (cle && !t.membres.includes(cle)) t.membres.push(cle);
        return t;
      });
    },
    async inviter(id, cle) {
      await assurer();
      return reg.modifier((d) => {
        const t = d.tables[id];
        if (!t) throw erreur("table inconnue", 404);
        if (!t.membres.includes(cle)) t.membres.push(cle);
        return t;
      });
    },
    async retirer(id, cle) {
      await assurer();
      return reg.modifier((d) => {
        const t = d.tables[id];
        if (!t) throw erreur("table inconnue", 404);
        t.membres = t.membres.filter((m) => m !== cle);
        if (t.organisateur === cle) t.organisateur = null;
        return t;
      });
    },
    // Bibliothèque: personnages d'un compte, indépendants des tables (la base y reste figée).
    async persosDe(cle) {
      const b = await bib.lire();
      return Object.values(b.persos).filter((p) => p.joueur === cle);
    },
    async persoDe(cle, id) {
      const b = await bib.lire();
      return b.persos[cle + "/" + id] || null;
    },
    async ajouterPerso(cle, entree) {
      return bib.modifier((b) => {
        const k = cle + "/" + entree.id;
        if (b.persos[k]) throw erreur("tu as déjà un personnage avec cet identifiant", 409);
        b.persos[k] = { id: entree.id, joueur: cle, base: entree.base, etat: entree.etat };
      });
    }
  };
}

module.exports = { creerTables, cleJeu };
