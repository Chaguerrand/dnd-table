"use strict";
const fs = require("node:fs");
const path = require("node:path");
const C = require("./constantes");
const R = require("./regles");
const D = require("./des");
const P = require("./partie");

const SORTS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "sorts.json"), "utf8"));
const M = require("./monnaie");
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
// Clé de comparaison d'un nom d'objet: sans articles ni "de", au singulier ("Potions de soin" = "Potion de soin").
const MOTS_VIDES = new Set(["le", "la", "les", "un", "une", "des", "l", "de", "du", "d"]);
const cleObjet = (s) => norm(s).replace(/['’]/g, " ").split(/\s+/).filter((w) => w && !MOTS_VIDES.has(w)).map((w) => (w.length > 3 ? w.replace(/[sx]$/, "") : w)).join(" ");
// Fait passer des minutes et expire les effets de durée en temps.
function passerTemps(partie, minutes) {
  partie.temps.minute += minutes;
  let expires = 0;
  for (const c of Object.values(partie.personnages)) {
    const avant = c.etat.effets.length;
    c.etat.effets = c.etat.effets.filter((e) => !(e.duree.type === "temps" && e.duree.fin_minute <= partie.temps.minute));
    expires += avant - c.etat.effets.length;
  }
  return { minute: partie.temps.minute, effets_expires: expires };
}
const MAX_ANNULABLES = 20;

class ErreurAction extends Error {}
const refuse = (msg) => { throw new ErreurAction(msg); };

function perso(partie, id) {
  const p = partie.personnages[id];
  if (!p) refuse("personnage inconnu: " + id);
  return p;
}

function trouverObjet(p, ref) {
  const objets = p.etat.inventaire.objets;
  const o = objets.find((x) => x.id === ref) || objets.find((x) => norm(x.nom) === norm(ref));
  if (!o) refuse("objet introuvable: " + ref);
  return o;
}

function prochainId(prefixe, existants) {
  let n = existants.length + 1;
  while (existants.includes(prefixe + n)) n++;
  return prefixe + n;
}

// Cases occupées par un jeton: empreinte profondeur x largeur à partir de (x, y).
function cases(x, y, empreinte, orientation) {
  let [prof, larg] = empreinte || [1, 1];
  if (orientation === "profil") [prof, larg] = [larg, prof];
  const out = [];
  for (let dy = 0; dy < prof; dy++) for (let dx = 0; dx < larg; dx++) out.push([x + dx, y + dy]);
  return out;
}

// Définitions: nom, description pour le MJ, paramètres (schéma simple) et fonction.
// Aucune action ne touche au bloc "base" des personnages ni au plan de la carte (murs, taille).
const ACTIONS = {
  ajouter_effet: {
    description: "Ajoute un bonus ou un malus temporaire ou permanent à un personnage. Un effet de même source et même champ remplace l'ancien.",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      champ: { type: "string", description: "stat.sol, stat.per, stat.end, stat.cha, stat.int, stat.agi, stat.lot, stat.zen, vitesse_m, armure, attaque, degats, initiative ou pv_max", requis: true },
      valeur: { type: "integer", description: "bonus (positif) ou malus (négatif)", requis: true },
      source: { type: "string", description: "origine de l'effet (ex: potion de force)", requis: true },
      duree_type: { type: "string", enum: C.TYPES_DUREE, description: "permanent, temps (en minutes), repos (jusqu'au prochain repos), scene ou quete", requis: true },
      duree_minutes: { type: "integer", description: "obligatoire si duree_type = temps" },
      quete: { type: "string", description: "id de quête liée, facultatif" }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const okChamp = C.CHAMPS_NUMERIQUES.includes(p.champ) || (p.champ.startsWith("stat.") && C.STATS.includes(p.champ.slice(5)));
      if (!okChamp) refuse("champ d'effet inconnu: " + p.champ);
      if (!Number.isInteger(p.valeur) || p.valeur === 0) refuse("valeur d'effet invalide");
      if (!C.TYPES_DUREE.includes(p.duree_type)) refuse("type de durée inconnu: " + p.duree_type);
      const duree = { type: p.duree_type };
      if (p.duree_type === "temps") {
        if (!Number.isInteger(p.duree_minutes) || p.duree_minutes < 1) refuse("duree_minutes obligatoire pour une durée en temps");
        duree.fin_minute = partie.temps.minute + p.duree_minutes;
      }
      c.etat.effets = c.etat.effets.filter((e) => !(e.source === p.source && e.champ === p.champ));
      c.etat.effets.push({ champ: p.champ, valeur: p.valeur, source: p.source, quete: p.quete || null, duree });
      return { stat_apres: p.champ.startsWith("stat.") ? R.stat(c, p.champ.slice(5)) : undefined };
    }
  },

  retirer_effet: {
    description: "Retire tous les effets d'une source donnée chez un personnage.",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      source: { type: "string", description: "source de l'effet à retirer", requis: true }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const avant = c.etat.effets.length;
      c.etat.effets = c.etat.effets.filter((e) => e.source !== p.source);
      if (c.etat.effets.length === avant) refuse("aucun effet de cette source: " + p.source);
      return { retires: avant - c.etat.effets.length };
    }
  },

  modifier_pv: {
    description: "Change les points de vie (dégâts: delta négatif, soins: delta positif). Les PV restent entre 0 et le maximum.",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      delta: { type: "integer", description: "changement de PV", requis: true },
      raison: { type: "string", description: "cause (ex: flèche, potion)" }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      if (!Number.isInteger(p.delta) || p.delta === 0) refuse("delta invalide");
      c.etat.pv = R.borne(c.etat.pv + p.delta, 0, R.pvMax(c));
      return { pv: c.etat.pv, pv_max: R.pvMax(c), a_terre: c.etat.pv === 0 };
    }
  },

  utiliser_pouvoir: {
    description: "Consomme une utilisation d'un pouvoir de classe ou de race (ex: second_souffle, endurance_de_pierre).",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      pouvoir: { type: "string", description: "id du pouvoir", requis: true }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const def = R.pouvoirsDe(c).find((x) => x.id === p.pouvoir);
      if (!def) refuse("ce personnage n'a pas le pouvoir " + p.pouvoir);
      const n = c.etat.pouvoirs_utilises[def.id] || 0;
      if (n >= def.max) refuse("pouvoir épuisé: " + def.nom);
      c.etat.pouvoirs_utilises[def.id] = n + 1;
      return { restant: def.max - n - 1 };
    }
  },

  repos: {
    description: "Fait faire un repos au groupe. Court: recharge les pouvoirs à recharge courte et retire les effets de type repos. Long: tout récupérer (PV, emplacements de sorts, pouvoirs) et 8 heures passent.",
    params: { type: { type: "string", enum: ["court", "long"], description: "court (1 h) ou long (8 h)", requis: true } },
    executer(partie, p) {
      if (p.type !== "court" && p.type !== "long") refuse("type de repos inconnu");
      partie.temps.minute += p.type === "court" ? 60 : 480;
      for (const c of Object.values(partie.personnages)) {
        c.etat.effets = c.etat.effets.filter((e) => e.duree.type !== "repos" && !(e.duree.type === "temps" && e.duree.fin_minute <= partie.temps.minute));
        for (const def of R.pouvoirsDe(c)) {
          if (p.type === "long" || def.recharge === "court") c.etat.pouvoirs_utilises[def.id] = 0;
        }
        if (p.type === "long") {
          c.etat.pv = R.pvMax(c);
          c.etat.emplacements_utilises = 0;
        } else if (C.CLASSES[R.classeDe(c)] && C.CLASSES[R.classeDe(c)].pacte) {
          c.etat.emplacements_utilises = 0;
        }
      }
      return { minute: partie.temps.minute };
    }
  },

  ajouter_objet: {
    description: "Donne un objet à un personnage. La charge maximale (Solidité x7) ne peut pas être dépassée.",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      nom: { type: "string", description: "nom de l'objet", requis: true },
      categorie: { type: "string", enum: C.CATEGORIES, description: "catégorie", requis: true },
      quantite: { type: "integer", description: "quantité (1 par défaut)" },
      poids_kg: { type: "number", description: "poids d'une unité en kg", requis: true },
      solidite_requise: { type: "integer", description: "Solidité minimale pour porter l'objet sans malus (armures)" },
      quete: { type: "string", description: "id de quête liée" }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      if (M.estMonnaie(p.nom)) refuse("l'argent n'est pas un objet: utilise modifier_monnaie (po, pa, pc)");
      if (!C.CATEGORIES.includes(p.categorie)) refuse("catégorie inconnue: " + p.categorie);
      const q = p.quantite == null ? 1 : p.quantite;
      if (!Number.isInteger(q) || q < 1) refuse("quantité invalide");
      if (typeof p.poids_kg !== "number" || p.poids_kg < 0) refuse("poids invalide");
      const objets = c.etat.inventaire.objets;
      // même objet = même nom à l'accord près (potion / potions), même catégorie: on empile, pas de doublon
      const existant = objets.find((o) => cleObjet(o.nom) === cleObjet(p.nom) && o.categorie === p.categorie && !o.equipe);
      const futur = R.charge(c).poids + p.poids_kg * q;
      if (futur > R.charge(c).seuils.max) refuse("trop lourd: le personnage ne peut pas porter autant");
      let o;
      if (existant) { existant.quantite += q; o = existant; }
      else {
        o = { id: prochainId("obj-", objets.map((x) => x.id)), nom: p.nom, categorie: p.categorie, quantite: q, poids_kg: p.poids_kg, equipe: false, solidite_requise: p.solidite_requise || 0, stats: {}, effets_portes: [], quete: p.quete || null };
        objets.push(o);
      }
      return { objet: o.id, quantite: o.quantite, charge: R.charge(c) };
    }
  },

  modifier_monnaie: {
    description: "Ajoute ou retire de l'argent à un personnage (valeurs négatives pour dépenser). 1 po = 10 pa = 100 pc. Les pièces ne sont JAMAIS des objets. Le total est converti automatiquement (23 pc deviennent 2 pa 3 pc).",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      po: { type: "integer", description: "pièces d'or à ajouter (négatif pour retirer)" },
      pa: { type: "integer", description: "pièces d'argent à ajouter (négatif pour retirer)" },
      pc: { type: "integer", description: "pièces de cuivre à ajouter (négatif pour retirer)" },
      raison: { type: "string", description: "d'où vient l'argent ou à quoi il sert" }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      for (const k of ["po", "pa", "pc"]) if (p[k] != null && !Number.isInteger(p[k])) refuse("montant invalide: " + k);
      const delta = (p.po || 0) * M.COURS.po + (p.pa || 0) * M.COURS.pa + (p.pc || 0) * M.COURS.pc;
      if (!delta) refuse("aucun montant");
      const inv = c.etat.inventaire;
      const total = M.totalCuivre(inv) + delta;
      if (total < 0) refuse("pas assez d'argent: " + M.texte(inv));
      M.poser(inv, total);
      return { monnaie: M.texte(inv), po: inv.po, pa: inv.pa, pc: inv.pc };
    }
  },

  retirer_objet: {
    description: "Retire un objet (ou une quantité) de l'inventaire d'un personnage.",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      objet: { type: "string", description: "id ou nom de l'objet", requis: true },
      quantite: { type: "integer", description: "quantité à retirer (1 par défaut)" }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const o = trouverObjet(c, p.objet);
      const q = p.quantite == null ? 1 : p.quantite;
      if (!Number.isInteger(q) || q < 1 || q > o.quantite) refuse("quantité invalide pour " + o.nom);
      o.quantite -= q;
      if (o.quantite === 0) c.etat.inventaire.objets = c.etat.inventaire.objets.filter((x) => x !== o);
      return { restant: o.quantite };
    }
  },

  equiper: {
    description: "Équipe ou déséquipe un objet d'un personnage.",
    params: {
      cible: { type: "string", description: "id du personnage", requis: true },
      objet: { type: "string", description: "id ou nom de l'objet", requis: true },
      equipe: { type: "boolean", description: "true pour équiper, false pour déséquiper", requis: true }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const o = trouverObjet(c, p.objet);
      if (typeof p.equipe !== "boolean") refuse("equipe doit être vrai ou faux");
      if (p.equipe && ["armures"].includes(o.categorie)) {
        for (const x of c.etat.inventaire.objets) if (x !== o && x.categorie === "armures") x.equipe = false;
      }
      o.equipe = p.equipe;
      return { objet: o.id, equipe: o.equipe, vitesse_m: R.vitesse(c) };
    }
  },

  deplacer_jeton: {
    description: "Déplace un jeton de la carte (une case = 1,5 m). Refusé si un mur, un autre jeton ou la distance autorisée par la vitesse l'empêche.",
    params: {
      jeton: { type: "string", description: "id du jeton (id du personnage pour un joueur)", requis: true },
      x: { type: "integer", description: "colonne de destination", requis: true },
      y: { type: "integer", description: "ligne de destination", requis: true },
      orientation: { type: "string", enum: ["face", "profil"], description: "orientation (face par défaut)" }
    },
    executer(partie, p) {
      const carte = partie.carte;
      const j = carte.jetons[p.jeton];
      if (!j) refuse("jeton inconnu: " + p.jeton);
      const orientation = p.orientation || j.orientation || "face";
      const murs = new Set(carte.murs.map((m) => m[0] + "," + m[1]));
      const occupe = new Set();
      for (const [id, o] of Object.entries(carte.jetons)) {
        if (id === p.jeton) continue;
        for (const [cx, cy] of cases(o.x, o.y, o.empreinte, o.orientation)) occupe.add(cx + "," + cy);
      }
      for (const [cx, cy] of cases(p.x, p.y, j.empreinte, orientation)) {
        if (cx < 0 || cy < 0 || cx >= carte.largeur || cy >= carte.hauteur) refuse("en dehors de la carte");
        if (murs.has(cx + "," + cy)) refuse("un mur bloque la case " + cx + "," + cy);
        if (occupe.has(cx + "," + cy)) refuse("la case " + cx + "," + cy + " est occupée");
      }
      const c = partie.personnages[p.jeton];
      if (c) {
        const dist = Math.max(Math.abs(p.x - j.x), Math.abs(p.y - j.y)) * 1.5;
        const v = R.vitesse(c);
        if (dist > v) refuse("trop loin: " + dist + " m demandés pour une vitesse de " + v + " m");
      }
      j.x = p.x; j.y = p.y; j.orientation = orientation;
      if (c) c.etat.position = { x: p.x, y: p.y };
      return { x: j.x, y: j.y };
    }
  },

  ajouter_objectif: {
    description: "Ajoute un objectif à la quête en cours.",
    params: { texte: { type: "string", description: "intitulé de l'objectif", requis: true } },
    executer(partie, p) {
      const obj = partie.quetes.objectifs;
      const o = { id: prochainId("obj", obj.map((x) => x.id)), texte: p.texte, fait: false };
      obj.push(o);
      return { id: o.id };
    }
  },

  valider_objectif: {
    description: "Marque un objectif comme accompli.",
    params: { id: { type: "string", description: "id de l'objectif", requis: true } },
    executer(partie, p) {
      const o = partie.quetes.objectifs.find((x) => x.id === p.id);
      if (!o) refuse("objectif inconnu: " + p.id);
      if (o.fait) refuse("objectif déjà accompli");
      o.fait = true;
      return { restants: partie.quetes.objectifs.filter((x) => !x.fait).length };
    }
  },

  ajouter_journal: {
    description: "Écrit une note dans le journal de quête (ce que les joueurs ont appris ou fait).",
    params: { texte: { type: "string", description: "la note", requis: true } },
    executer(partie, p) {
      if (!String(p.texte || "").trim()) refuse("note vide");
      partie.quetes.notes = partie.quetes.notes || [];
      partie.quetes.notes.push({ minute: partie.temps.minute, texte: p.texte });
      return {};
    }
  },

  avancer_temps: {
    description: "Fait passer du temps (en minutes). Les effets de durée en temps expirent. Pendant un combat, n'utilise pas cet outil: le temps se règle à la fin avec definir_combat.",
    params: { minutes: { type: "integer", description: "minutes écoulées (1 à 1440)", requis: true } },
    executer(partie, p) {
      if (!Number.isInteger(p.minutes) || p.minutes < 1 || p.minutes > 1440) refuse("minutes invalides");
      return passerTemps(partie, p.minutes);
    }
  },

  definir_combat: {
    description: "Ouvre ou ferme un combat. Un tour de combat dure 6 secondes: pendant le combat le temps n'avance pas (pas d'avancer_temps). À la fermeture, donne le nombre de tours écoulés: le temps passe de 1 minute par 10 tours (minimum 1 minute).",
    params: {
      actif: { type: "boolean", description: "true: le combat commence; false: il se termine", requis: true },
      tours: { type: "integer", description: "obligatoire quand actif = false: nombre de tours de combat écoulés" }
    },
    executer(partie, p) {
      if (typeof p.actif !== "boolean") refuse("actif doit être vrai ou faux");
      if (p.actif) {
        if (partie.combat) refuse("un combat est déjà en cours");
        partie.combat = { debut: partie.temps.minute, repliques: 0 };
        return { combat: true };
      }
      if (!partie.combat) refuse("aucun combat en cours");
      if (!Number.isInteger(p.tours) || p.tours < 1) refuse("tours obligatoire (entier, 1 ou plus) pour terminer un combat");
      const minutes = Math.max(1, Math.ceil(p.tours / 10));
      delete partie.combat;
      return { combat: false, ...passerTemps(partie, minutes) };
    }
  },

  lancer_sort: {
    description: "Un personnage lance un sort de la liste de ses sorts connus ou préparés. Un sort de niveau 1 consomme un emplacement; un tour de magie est gratuit.",
    params: {
      cible: { type: "string", description: "id du personnage qui lance le sort", requis: true },
      sort: { type: "string", description: "id du sort (ex: trait-de-feu)", requis: true }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const s = SORTS.find((x) => x.id === norm(p.sort).replace(/\s+/g, "-") || norm(x.nom) === norm(p.sort));
      if (!s) refuse("sort inconnu: " + p.sort);
      const bloc = c.base.sorts || {};
      const listes = (niv) => (niv === 0 ? bloc.tours_de_magie : [...(bloc.prepares || []), ...(bloc.connus || [])]) || [];
      const possede = listes(s.niveau).some((x) => norm(x) === norm(s.id) || norm(x) === norm(s.nom));
      if (!possede) refuse(c.base.nom + " ne connait pas " + s.nom);
      if (s.niveau === 0) return { sort: s.nom, effet: s.effet, emplacements_restants: R.emplacementsMax(c) - c.etat.emplacements_utilises };
      const max = R.emplacementsMax(c);
      if (c.etat.emplacements_utilises >= max) refuse("plus d'emplacement de sort disponible");
      c.etat.emplacements_utilises += 1;
      return { sort: s.nom, effet: s.effet, emplacements_restants: max - c.etat.emplacements_utilises };
    }
  },

  chuchoter: {
    description: "Envoie un message confidentiel à un seul joueur (ce que lui seul remarque, sait ou ressent). Les autres joueurs ne le voient pas.",
    params: {
      cible: { type: "string", description: "id du personnage destinataire", requis: true },
      texte: { type: "string", description: "le message, en français, une ou deux phrases", requis: true }
    },
    executer(partie, p) {
      perso(partie, p.cible);
      if (!p.texte || !String(p.texte).trim()) refuse("message vide");
      partie.texte.push({ qui: "mj", minute: partie.temps.minute, texte: String(p.texte).trim(), prive_a: p.cible });
      return { envoye_a: p.cible };
    }
  },

  demander_jet: {
    description: "Demande un jet de dé à un joueur. Le joueur le lance et le serveur tire le dé. Tu ne lances jamais les dés toi-même: tu attends le résultat.",
    params: {
      cible: { type: "string", description: "id du personnage qui lance", requis: true },
      type: { type: "string", enum: ["competence", "stat", "sauvegarde", "attaque", "degats", "libre"], description: "nature du jet", requis: true },
      nom: { type: "string", description: "nom de la compétence (ex: Perception) ou clé de caractéristique (sol, per, end, cha, int, agi, lot, zen); pour attaque, degats et libre: un libellé", requis: true },
      dd: { type: "integer", description: "difficulté à atteindre (facultatif; les jets de dégâts n'en ont pas)" },
      avantage: { type: "string", enum: ["normal", "avantage", "desavantage"], description: "mode du d20" },
      de: { type: "string", description: "dés pour degats et libre (ex: 1d8); d20 pour les autres" },
      bonus: { type: "integer", description: "bonus fixe pour attaque, degats et libre" },
      raison: { type: "string", description: "pourquoi ce jet, en une phrase" }
    },
    executer(partie, p) {
      const c = perso(partie, p.cible);
      const types = ["competence", "stat", "sauvegarde", "attaque", "degats", "libre"];
      if (!types.includes(p.type)) refuse("type de jet inconnu: " + p.type);
      R.modificateurJet(c, p.type, p.nom, p.bonus); // valide le nom
      const de = p.de || (["degats", "libre"].includes(p.type) ? null : "d20");
      if (!de) refuse("il faut préciser les dés (ex: 1d8)");
      D.lancer(de); // valide l'expression (le résultat est jeté)
      if (partie.jets_en_attente.some((j) => j.cible === p.cible)) refuse("un jet est déjà en attente pour " + c.base.nom);
      const jet = {
        id: prochainId("jet", partie.jets_en_attente.map((x) => x.id).concat(partie.journal.map((e) => (e.resultat && e.resultat.jet_id) || ""))),
        cible: p.cible, type: p.type, nom: p.nom, dd: p.dd == null ? null : p.dd,
        avantage: p.avantage || "normal", de, bonus: p.bonus || 0, raison: p.raison || ""
      };
      partie.jets_en_attente.push(jet);
      return { jet_id: jet.id };
    }
  }
};

function verifierParams(def, params) {
  const p = params || {};
  for (const [nom, s] of Object.entries(def.params)) {
    const v = p[nom];
    if (v == null) { if (s.requis) refuse("paramètre manquant: " + nom); continue; }
    if (s.type === "string" && typeof v !== "string") refuse(nom + " doit être un texte");
    if (s.type === "integer" && !Number.isInteger(v)) refuse(nom + " doit être un entier");
    if (s.type === "number" && typeof v !== "number") refuse(nom + " doit être un nombre");
    if (s.type === "boolean" && typeof v !== "boolean") refuse(nom + " doit être vrai ou faux");
    if (s.enum && !s.enum.includes(v)) refuse(nom + " doit être parmi: " + s.enum.join(", "));
  }
  for (const k of Object.keys(p)) if (!(k in def.params)) refuse("paramètre inconnu: " + k);
  return p;
}

// Applique une action: valide, exécute sur une copie, ne valide l'état que si tout a réussi.
// Renvoie { ok, resultat | erreur, entree }.
function appliquer(partie, nom, params, par) {
  const def = ACTIONS[nom];
  if (!def) return { ok: false, erreur: "action inconnue: " + nom };
  const avant = P.instantane(partie);
  try {
    const p = verifierParams(def, params);
    const resultat = def.executer(partie, p) || {};
    return { ok: true, resultat, entree: journaliser(partie, nom, p, par, resultat, avant) };
  } catch (e) {
    P.restaurer(partie, avant);
    return { ok: false, erreur: e.message };
  }
}

function journaliser(partie, action, params, par, resultat, avant, extra) {
  const n = (partie.journal.length ? partie.journal[partie.journal.length - 1].n : 0) + 1;
  const entree = Object.assign({
    n, minute: partie.temps.minute, action, par: par || "systeme", cible: params && (params.cible || params.jeton) || null,
    params, resultat, annulable: true, avant
  }, extra || {});
  partie.journal.push(entree);
  // seules les dernières entrées gardent leur instantané
  const annulables = partie.journal.filter((e) => e.avant);
  for (let i = 0; i < annulables.length - MAX_ANNULABLES; i++) { delete annulables[i].avant; annulables[i].annulable = false; }
  return entree;
}

// Annule la dernière action annulable (et restaure l'état d'avant).
function annuler(partie) {
  for (let i = partie.journal.length - 1; i >= 0; i--) {
    const e = partie.journal[i];
    if (e.annule) continue;
    if (!e.annulable || !e.avant) return { ok: false, erreur: "rien à annuler" };
    P.restaurer(partie, e.avant);
    e.annule = true; e.annulable = false; delete e.avant;
    // les entrées postérieures à celle annulée (déjà annulées) restent dans le journal
    return { ok: true, annule: e.n, action: e.action };
  }
  return { ok: false, erreur: "rien à annuler" };
}

// Résout un jet en attente: dés tirés côté serveur, résultat dans le journal.
function resoudreJet(partie, jetId, par) {
  const jet = partie.jets_en_attente.find((j) => j.id === jetId);
  if (!jet) return { ok: false, erreur: "jet introuvable: " + jetId };
  const c = perso(partie, jet.cible);
  const avant = P.instantane(partie);
  const mode = ["degats", "libre"].includes(jet.type) ? "normal" : jet.avantage;
  const mjMod = R.modificateurJet(c, jet.type, jet.nom, jet.bonus);
  let tirages, base, details = {};
  if (jet.de === "d20" || /^1?d20$/.test(jet.de)) {
    const r = D.d20(mode);
    tirages = r.tirages; base = r.retenu; details = { mode: r.mode, retenu: r.retenu };
  } else {
    const r = D.lancer(jet.de);
    tirages = r.tirages; base = r.total;
  }
  const total = base + mjMod;
  const critique = jet.de.endsWith("d20") ? (base === 20 ? "reussite" : base === 1 ? "echec" : null) : null;
  let reussi = null;
  if (jet.dd != null) reussi = critique === "reussite" && ["attaque"].includes(jet.type) ? true : critique === "echec" && jet.type === "attaque" ? false : total >= jet.dd;
  partie.jets_en_attente = partie.jets_en_attente.filter((j) => j !== jet);
  const resultat = { jet_id: jet.id, nom: jet.nom, type: jet.type, de: jet.de, tirages, ...details, modificateur: mjMod, total, dd: jet.dd, reussi, critique };
  const entree = journaliser(partie, "jet", { cible: jet.cible }, par || jet.cible, resultat, avant, { annulable: false });
  delete entree.avant;
  return { ok: true, resultat };
}

// Déclarations d'outils pour le MJ (format neutre, converti par l'adaptateur du modèle).
function declarationsOutils() {
  return Object.entries(ACTIONS).map(([nom, def]) => ({
    nom, description: def.description,
    parametres: Object.fromEntries(Object.entries(def.params).map(([k, s]) => [k, { type: s.type, description: s.description, enum: s.enum, requis: !!s.requis }]))
  }));
}

module.exports = { ACTIONS, appliquer, annuler, resoudreJet, declarationsOutils, SORTS, ErreurAction, MAX_ANNULABLES };
