"use strict";
const $ = (id) => document.getElementById(id);
const ORDRE = ["sol", "per", "end", "cha", "int", "agi", "lot", "zen"];
const NOMS = { sol: "Solidité", per: "Perception", end: "Endurance", cha: "Charisme", int: "Intelligence", agi: "Agilité", lot: "Loterie", zen: "Zen" };
const LETTRES = { sol: "S", per: "P", end: "E", cha: "C", int: "I", agi: "A", lot: "L", zen: "Z" };
const court = (k) => NOMS[k].slice(0, 3);
const CHAMPS = { vitesse_m: "Vitesse", armure: "Armure", attaque: "Attaque", degats: "Dégâts", initiative: "Initiative", pv_max: "PV max" };
const CATEGORIES = {
  armes: "Arme", armures: "Armure", boucliers: "Bouclier", munitions: "Munitions", potions: "Potion", parchemins: "Parchemin", nourriture: "Nourriture",
  outils: "Outil", vetements: "Vêtement", bijoux: "Bijou", "objets-magiques": "Objet magique", tresors: "Trésor", montures: "Monture", quete: "Quête", equipement: "Équipement", divers: "Divers"
};
const PLURIELS = {
  armes: "Armes", armures: "Armures", boucliers: "Boucliers", munitions: "Munitions", potions: "Potions", parchemins: "Parchemins", nourriture: "Nourriture",
  outils: "Outils", vetements: "Vêtements", bijoux: "Bijoux", "objets-magiques": "Objets magiques", tresors: "Trésors", montures: "Montures", quete: "Quête", equipement: "Équipement", divers: "Divers"
};
const ICONES = {
  armes: "M14 4l6-1-1 6L9 19l-4-4zM5 15l-2 2M7 17l-2 2", armures: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z", boucliers: "M5 4h14v7c0 5-3 8-7 10-4-2-7-5-7-10zM12 4v17",
  munitions: "M4 20L20 4M15 4h5v5M4 20l3-1-2-2z", potions: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  parchemins: "M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6M9 13h6",
  nourriture: "M12 8c-3-2-7 0-7 5 0 4 3 7 5 7 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-3 5-7 0-5-4-7-7-5zM12 8c0-2 1-4 3-5",
  outils: "M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z", vetements: "M8 4l-5 4 3 3 2-1v10h8V10l2 1 3-3-5-4a4 4 0 0 1-8 0z",
  bijoux: "M12 4l4 5-4 11-4-11zM8 9h8", "objets-magiques": "M12 3l2 5 5 1-4 4 1 6-4-3-4 3 1-6-4-4 5-1z", tresors: "M4 9l3-5h10l3 5-8 11zM4 9h16",
  montures: "M3 17h13l3-6h-5M7 17a2 2 0 1 0 0 .01M15 17a2 2 0 1 0 0 .01", quete: "M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM11 14l9-9M16 9l3 3",
  equipement: "M6 9a6 6 0 0 1 12 0v11H6zM9 14h6", divers: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"
};
const ONGLETS = [
  { id: "texte", label: "Texte", icone: '<path d="M4 6h16M4 12h16M4 18h10"/>' },
  { id: "carte", label: "Carte", icone: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>' },
  { id: "fiche", label: "Fiche", icone: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' },
  { id: "inv", label: "Objets", icone: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
  { id: "quetes", label: "Quêtes", icone: '<path d="M6 3v18"/><path d="M6 4h12l-3 4 3 4H6"/>' }
];
const THEMES = { parchemin: ["Parchemin", "Clair, papier et encre rouge."], commonwealth: ["Commonwealth", "Sombre, ambre et rayures de chantier."] };
const DISPOSITIONS = {
  auto: ["Automatique", "Onglets sur téléphone, colonnes sur grand écran."],
  onglets: ["Onglets", "Un panneau à la fois, barre en bas."],
  colonnes: ["Colonnes", "Tout est visible en même temps (grand écran)."],
  histoire: ["Histoire", "Le texte à gauche, le reste en onglets à droite (grand écran)."]
};
const ESSAI = {
  id: "korga",
  base: { nom: "Korga", niveau: 1, race: "Goliath", classe: "Guerrier", historique: "Soldat", taille: "Grande", vitesse: "10,5 m",
    competences: ["Athlétisme", "Perception"], stats_total: { sol: 16, per: 12, end: 14, cha: 10, int: 10, agi: 11, lot: 10, zen: 8 }, sorts: null },
  etat: { pv: 12, pv_max: 12, effets: [], inventaire: { po: 10, objets: ["Hache à deux mains", "Sac à dos", "Corde (15 m)"] }, emplacements_utilises: 0, position: null }
};
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

// Réglages de l'appareil (jamais indispensables)
function lireLocal(cle, defaut) { try { const v = localStorage.getItem(cle); return v == null ? defaut : v; } catch (e) { return defaut; } }
function ecrireLocal(cle, val) { try { localStorage.setItem(cle, val); } catch (e) { /* sans stockage, les réglages restent pour la session */ } }

const etat = {
  partie: null, perso: lireLocal("perso", ""), theme: lireLocal("theme", "commonwealth"), disposition: lireLocal("disposition", "auto"),
  onglet: lireLocal("onglet", "texte"), ficheOnglet: "base", ouvert: {}, filtre: "all", legende: true, jetEnCours: null, occupe: false,
  sorts: null, serveur: { mot_de_passe: false, version: "" }, reglagesOuverts: false, ajout: false, message: ""
};
etat.tableId = lireLocal("table", "");
etat.tables = []; etat.biblio = []; etat.moiCompte = null; etat.messageAccueil = "";

function echapper(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const sg = (n) => (n > 0 ? "+" + n : String(n));
const fmt = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const cle = (s) => norm(s).replace(/\s+/g, "-");

// La table courante est envoyée à chaque requête (en-tête X-Table).
function entetes(extra) { const h = Object.assign({}, extra || {}); if (etat.tableId) h["x-table"] = etat.tableId; return h; }
async function api(url, corps) {
  const r = await fetch(url, corps === undefined ? { headers: entetes() } : { method: "POST", headers: entetes({ "content-type": "application/json" }), body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.etape) { montrerConnexion(j.etape); throw new Error("connexion requise"); }
  if (!r.ok) throw Object.assign(new Error(j.erreur || ("erreur " + r.status)), { etape: j.etape });
  return j;
}
let modeCompte = "connexion";
function montrerConnexion(etape) {
  $("connexion").hidden = false; $("app").hidden = true; $("reglages").hidden = true; $("accueil").hidden = true; etat.reglagesOuverts = false;
  $("etape-table").hidden = etape !== "table"; $("etape-compte").hidden = etape !== "compte"; $("etape-aucune").hidden = etape !== "aucune";
  majModeCompte();
}
function majModeCompte() {
  const creer = modeCompte === "creation";
  $("titre-compte").textContent = creer ? "Créer ton compte" : "Connexion";
  $("valider-compte").textContent = creer ? "Créer mon compte" : "Me connecter";
  $("bascule-compte").textContent = creer ? "J'ai déjà un compte" : "Créer un compte";
  $("aide-code").hidden = !creer;
}

function persoActif() {
  const p = etat.partie; if (!p) return null;
  return Object.values(p.personnages).find((c) => c.a_moi) || null;
}

/* ---------- Thème et disposition ---------- */
function dispositionEffective() {
  let d = etat.disposition;
  if (d === "auto" || !DISPOSITIONS[d]) d = window.innerWidth >= 900 ? "colonnes" : "onglets";
  if ((d === "colonnes" || d === "histoire") && window.innerWidth < 700) d = "onglets";
  return d;
}
function appliquerMise() {
  document.documentElement.setAttribute("data-theme", THEMES[etat.theme] ? etat.theme : "commonwealth");
  const d = dispositionEffective();
  $("app").setAttribute("data-disp", d);
  if (d === "histoire" && etat.onglet === "texte") etat.onglet = "fiche";
  document.querySelectorAll(".panneau").forEach((el) => el.classList.toggle("actif", el.dataset.p === etat.onglet));
  $("onglets").innerHTML = ONGLETS.map((o) => '<button type="button" data-p="' + o.id + '" class="' + (o.id === etat.onglet ? "on" : "") + '" aria-label="' + o.label + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + o.icone + "</svg><span>" + o.label + "</span></button>").join("");
}

/* ---------- Rendu général ---------- */
function afficher(p) {
  etat.partie = p;
  $("connexion").hidden = true; $("app").hidden = false;
  appliquerMise();
  rendreTexte(); rendreCarte(); rendreFiche(); rendreInventaire(); rendreQuetes();
  if (etat.reglagesOuverts) rendreReglages();
  majControles();
}

function majControles() {
  const p = etat.partie;
  const jet = p && p.jets_en_attente.length > 0;
  const occ = etat.occupe;
  $("dire").disabled = occ || jet || !persoActif();
  $("texte").disabled = occ || jet || !persoActif();
  $("annuler").disabled = occ;
  $("annuler").hidden = !(p && p.moi && p.moi.role === "organisateur");
  const dernier = p && p.texte.length ? p.texte[p.texte.length - 1] : null;
  $("reprise").hidden = !(dernier && dernier.qui === "joueur" && !jet && !occ && !etat.jetEnCours);
  document.querySelectorAll("#zone-jet button").forEach((b) => { b.disabled = occ; });
  const c = persoActif();
  const att = $("attente");
  if (!occ) {
    const mo = p && p.mj_occupe;
    att.hidden = !mo; if (mo) att.textContent = mo.nom ? "Le MJ répond à " + mo.nom + "..." : "Le MJ est occupé un instant...";
  }
  $("qui-joue").textContent = c ? "Tu joues : " + c.base.nom : "Tu n'as pas encore de personnage à cette table : ouvre les réglages pour en créer un.";
}

function rendreTexte() {
  const p = etat.partie;
  $("histoire").innerHTML = p.texte.slice().reverse().map((t) =>
    '<div class="msg ' + (t.qui === "mj" ? "mj" : "joueur") + (t.prive_a || t.prive_de ? " prive" : "") + '">' + (t.prive_a || t.prive_de ? '<div class="etiquette-prive">Privé, toi seul le vois</div>' : "") + echapper(t.texte) +
    (t.duree_s != null ? '<div class="duree">Réponse en ' + String(t.duree_s).replace(".", ",") + " s</div>" : "") + "</div>").join("") ||
    '<div class="vide">Rien n\'a encore été dit. Écris ce que fait ton personnage.</div>';
  rendreJet();
}

/* ---------- Jet de dé ---------- */
function expressionDe(de) {
  const m = /^(\d*)d(\d+)$/.exec(String(de || "d20").toLowerCase());
  return { nb: m && m[1] ? parseInt(m[1], 10) : 1, faces: m ? parseInt(m[2], 10) : 20 };
}
function lignesResultat(res, jet) {
  const total = res.total;
  const detail = (res.tirages.length > 1 ? (res.mode && res.mode !== "normal" ? (res.mode === "avantage" ? "Avantage" : "Désavantage") + " : " + res.tirages.join(" et ") + ", on garde " + res.retenu : "Dés : " + res.tirages.join(" + ")) : "Dé : " + res.tirages[0]) +
    (res.modificateur ? ", modificateur " + sg(res.modificateur) : "");
  let verdict = "", note = "";
  if (res.dd != null) {
    verdict = '<span class="verdict ' + (res.reussi ? "ok" : "ko") + '">' + (res.reussi ? "Réussite" : "Échec") + "</span>";
    note = total + " contre " + res.dd + (res.critique === "reussite" ? ". Dé naturel 20." : res.critique === "echec" ? ". Dé naturel 1." : "");
  }
  return '<div class="resultat"><span class="total">' + total + "</span>" + verdict + "</div><div>" + echapper(detail) + "</div>" + (note ? '<div class="doux">' + echapper(note) + "</div>" : "");
}
let cleJet = "";
function rendreJet() {
  const zone = $("zone-jet");
  const p = etat.partie;
  const en = etat.jetEnCours;
  if (en) { return; } // la carte du jet en cours est gérée par lancerJet
  const jet = p.jets_en_attente[0];
  const monJet = !!jet && !!persoActif() && persoActif().id === jet.cible;
  const nouvelle = jet ? "jet:" + jet.id + ":" + (monJet ? "moi" : "autre") : "";
  if (nouvelle === cleJet) { return; }
  cleJet = nouvelle;
  if (!jet) { zone.innerHTML = ""; return; }
  const c = p.personnages[jet.cible];
  zone.innerHTML = '<div class="carte-jet"><h2>Jet demandé à ' + echapper(c ? c.base.nom : jet.cible) + "</h2>" +
    "<div><b>" + echapper(jet.nom) + "</b>" + (jet.dd != null ? " (difficulté " + jet.dd + ")" : "") + (jet.avantage !== "normal" ? " : " + echapper(jet.avantage) : "") + "</div>" +
    '<div class="doux">' + echapper(jet.raison) + "</div>" +
    '<button type="button" class="arene" id="arene" aria-label="Lancer le dé"><svg viewBox="0 0 480 250" aria-hidden="true" id="svg-de"></svg></button>' +
    '<div id="jet-bas">' + (monJet ? '<button type="button" class="btn" id="lancer">Lancer ' + echapper(jet.de) + "</button>" : '<div class="doux">En attente du lancer de ' + echapper(c ? c.base.nom : jet.cible) + ".</div>") + "</div></div>";
  poserRepos(jet);
  if (monJet) { const go = () => lancerJet(jet); $("lancer").onclick = go; $("arene").onclick = go; }
  majControles();
}
function poserRepos(jet) {
  const svg = $("svg-de"); if (!svg) return;
  const ex = expressionDe(jet.de);
  if ([4, 6, 8, 10, 12, 20].indexOf(ex.faces) < 0) { svg.innerHTML = ""; return; }
  const n = jet.de === "d20" && jet.avantage !== "normal" ? 2 : Math.min(ex.nb, 6);
  const specs = []; for (let i = 0; i < n; i++) specs.push({ faces: ex.faces, valeur: Math.max(1, Math.ceil(ex.faces / 2)), garde: true });
  De.poser(svg, specs);
}

async function lancerJet(jet) {
  if (etat.occupe) return;
  etat.occupe = true; majControles(); $("err").textContent = "";
  try {
    const r = await api("/api/jets/" + jet.id + "/lancer", { perso: jet.cible, sans_mj: true });
    const res = r.resultat;
    etat.partie = r.partie;
    etat.jetEnCours = { jet, res };
    const ex = expressionDe(jet.de);
    const zone = $("zone-jet");
    zone.innerHTML = '<div class="carte-jet"><h2>' + echapper(jet.nom) + '</h2><div class="arene" id="arene"><svg viewBox="0 0 480 250" aria-hidden="true" id="svg-de"></svg></div><div id="jet-bas"><div class="doux">Les dés roulent...</div></div></div>';
    const animable = [4, 6, 8, 10, 12, 20].indexOf(ex.faces) >= 0;
    const specs = res.tirages.map((v) => ({ faces: ex.faces, valeur: v, garde: true }));
    if (res.tirages.length === 2 && ex.faces === 20) {
      const i = res.tirages.indexOf(res.retenu);
      specs.forEach((s, k) => { s.garde = k === i; });
    }
    if (animable) await new Promise((ok) => { const passer = De.lancer($("svg-de"), specs, ok); $("arene").onclick = passer; });
    $("jet-bas").innerHTML = lignesResultat(res, jet);
    rendreTexte(); // la ligne du jet apparaît dans l'histoire
    await demanderSuite();
  } catch (e) {
    $("err").textContent = e.message;
    try { etat.jetEnCours = null; cleJet = ""; afficher(await api("/api/partie")); } catch (e2) { /* connexion perdue */ }
  }
  etat.jetEnCours = null; cleJet = "";
  etat.occupe = false;
  if (etat.partie) afficher(etat.partie);
}

async function demanderSuite() {
  const t0 = Date.now();
  const att = $("attente"); att.hidden = false;
  const minuteur = setInterval(() => { att.textContent = "Le MJ réfléchit... " + Math.round((Date.now() - t0) / 1000) + " s"; }, 1000);
  att.textContent = "Le MJ réfléchit... 0 s";
  try { const s = await api("/api/suite", {}); etat.partie = s.partie; }
  finally { clearInterval(minuteur); att.hidden = true; }
}

/* ---------- Actions du joueur ---------- */
async function agir(fn) {
  if (etat.occupe) return;
  etat.occupe = true; $("err").textContent = ""; majControles();
  const t0 = Date.now();
  const att = $("attente"); att.hidden = false; att.textContent = "Le MJ réfléchit... 0 s";
  const minuteur = setInterval(() => { att.textContent = "Le MJ réfléchit... " + Math.round((Date.now() - t0) / 1000) + " s"; }, 1000);
  try { await fn(); }
  catch (e) { $("err").textContent = e.message; if (etat.partie) { try { etat.partie = await api("/api/partie"); } catch (e2) { /* connexion perdue */ } } }
  clearInterval(minuteur); att.hidden = true;
  etat.occupe = false;
  if (etat.partie) afficher(etat.partie);
}

$("dire").onclick = () => {
  let t = $("texte").value.trim(); if (!t) return;
  const c = persoActif(); if (!c) return;
  const prive = /^\/dmj(\s|$)/i.test(t);
  if (prive) { t = t.replace(/^\/dmj\s*/i, "").trim(); if (!t) { $("err").textContent = "Écris ton message après /dmj."; return; } }
  agir(async () => {
    $("texte").value = "";
    cleJet = "";
    // ta phrase s'affiche tout de suite, avant la réponse du MJ
    etat.partie = { ...etat.partie, texte: [...etat.partie.texte, { qui: "joueur", texte: "[" + c.base.nom + "]" + (prive ? " (en privé au MJ)" : "") + " " + t, ...(prive ? { prive_de: c.id } : {}) }] };
    rendreTexte();
    try { const r = await api("/api/dire", { perso: c.id, texte: t, prive }); etat.partie = r.partie; }
    catch (e) { $("texte").value = (prive ? "/dmj " : "") + t; throw e; }
  });
};
$("texte").addEventListener("keydown", (e) => { if (e.key === "Enter") $("dire").click(); });
$("annuler").onclick = () => agir(async () => { const r = await api("/api/annuler", {}); etat.partie = r.partie; });
$("reprendre").onclick = () => agir(async () => { const r = await api("/api/suite", {}); etat.partie = r.partie; });

/* ---------- Carte ---------- */
function rendreCarte() {
  const p = etat.partie, k = p.carte, actif = persoActif();
  const L = k.largeur, H = k.hauteur;
  const pct = (v, tot) => (v / tot * 100) + "%";
  const murs = k.murs.map((m) => '<div class="mur" style="left:' + pct(m[0], L) + ";top:" + pct(m[1], H) + ";width:" + pct(1, L) + ";height:" + pct(1, H) + '"></div>').join("");
  const jetons = Object.keys(k.jetons).map((id) => {
    const j = k.jetons[id];
    let [prof, larg] = j.empreinte || [1, 1];
    if (j.orientation === "profil") [prof, larg] = [larg, prof];
    const c = p.personnages[id];
    let fond = "var(--ennemi)";
    if (c) fond = c.a_moi ? "var(--moi)" : "var(--info)";
    else if (j.camp === "allie") fond = "var(--pos)";
    const encre = "var(--token-ink)";
    const rond = prof === 1 && larg === 1;
    const nom = c ? c.base.nom : (j.nom || id);
    return '<div class="jeton" title="' + echapper(nom) + '" style="left:' + pct(j.x, L) + ";top:" + pct(j.y, H) + ";width:" + pct(larg, L) + ";height:" + pct(prof, H) + ";background:" + fond + ";color:" + encre + ";border-radius:" + (rond ? "999px" : "6px") + '">' + echapper(nom.slice(0, 4)) + "</div>";
  }).join("");
  const grille = "background-image:linear-gradient(to right,var(--map-grid) 1px,transparent 1px),linear-gradient(to bottom,var(--map-grid) 1px,transparent 1px);background-size:" + (100 / L) + "% " + (100 / H) + "%;";
  const pas = (fond, extra) => '<span class="pastille" aria-hidden="true" style="background:' + fond + ";" + (extra || "") + '"></span>';
  const ligne = (pastille, txt) => '<div class="l">' + pastille + "<span>" + txt + "</span></div>";
  const legende = etat.legende ? '<div class="legende">' +
    '<div class="groupe">La couleur dit qui c\'est</div><div class="lignes">' +
    ligne(pas("var(--moi)", "border-radius:999px"), "<strong>Orange</strong> : ton personnage.") +
    ligne(pas("var(--info)", "border-radius:999px"), "<strong>Bleu</strong> : un autre joueur de la table.") +
    ligne(pas("var(--pos)", "border-radius:999px"), "<strong>Vert</strong> : un allié ou un personnage non joueur amical.") +
    ligne(pas("var(--ennemi)", "border-radius:999px"), "<strong>Rouge</strong> : un ennemi.") + "</div>" +
    '<div class="groupe">La forme dit la taille</div><div class="lignes">' +
    ligne(pas("var(--muted)", "border-radius:999px"), "<strong>Rond</strong> : taille normale, une case.") +
    '<div class="l"><span class="pastille" aria-hidden="true" style="width:52px;background:var(--muted);border-radius:6px"></span><span><strong>Rectangle</strong> : grande créature sur 1 x 2 cases.</span></div></div>' +
    '<div class="groupe">Le décor</div><div class="lignes">' +
    ligne(pas("var(--map-wall)"), "<strong>Bloc sombre</strong> : un mur, on ne passe pas.") +
    ligne(pas("var(--map-floor)", "border:1px solid var(--map-grid)"), "<strong>Quadrillage</strong> : une case fait 1,5 m.") + "</div></div>" : "";
  $("c-carte").innerHTML = '<div class="plan" style="aspect-ratio:' + L + " / " + H + ";" + grille + '">' + murs + jetons + "</div>" +
    '<div><button type="button" class="btn sec" data-a="legende">' + (etat.legende ? "Masquer la légende" : "Afficher la légende") + "</button></div>" + legende;
}

/* ---------- Fiche ---------- */
function dureeTxt(e) {
  const d = e.duree || {};
  if (d.type === "permanent") return "Permanent";
  if (d.type === "repos") return "Jusqu'au repos";
  if (d.type === "scene") return "Scène";
  if (d.type === "quete") return "Quête";
  if (d.type === "temps") {
    const r = Math.max(0, d.fin_minute - etat.partie.temps.minute);
    return r >= 60 ? Math.floor(r / 60) + " h" + (r % 60 ? " " + (r % 60) + " min" : "") : r + " min";
  }
  return "";
}
function champTxt(ch) { return ch.indexOf("stat.") === 0 ? NOMS[ch.slice(5)] || ch : CHAMPS[ch] || ch; }
function classeCle(c) { return norm(c.base.classe); }

function rendreFiche() {
  const c = persoActif(), z = $("c-fiche");
  if (!c) { z.innerHTML = '<div class="vide">Aucun personnage. Ouvre les réglages pour en ajouter un.</div>'; return; }
  const k = c.calcul, b = c.base;
  const aSorts = k.emplacements_max > 0 || (b.sorts && (b.sorts.tours_de_magie || b.sorts.prepares));
  const onglets = [["base", "Base"]].concat(aSorts ? [["sorts", "Sorts"]] : [], k.pouvoirs.length ? [["pouvoirs", "Pouvoirs"]] : []);
  if (!onglets.some((o) => o[0] === etat.ficheOnglet)) etat.ficheOnglet = "base";
  const tete = '<div class="fiche-tete"><div><h1>' + echapper(b.nom) + '</h1><div class="doux">' + echapper([b.race, b.classe, "Niveau " + b.niveau, b.historique].filter(Boolean).join(" - ")) + "</div></div>" +
    '<div class="chiffres">' +
    '<div class="chiffre"><span class="l">PV</span><span class="v">' + c.etat.pv + " / " + k.pv_max + "</span></div>" +
    '<div class="chiffre"><span class="l">ARMURE</span><span class="v">' + k.armure + "</span></div>" +
    '<div class="chiffre"><span class="l">VITESSE</span><span class="v">' + fmt(k.vitesse_m) + " m</span></div>" +
    '<div class="chiffre"><span class="l">INITIATIVE</span><span class="v ' + (k.initiative < 0 ? "neg" : "") + '">' + sg(k.initiative) + "</span></div></div></div>";
  const nav = '<div style="display:flex;gap:8px">' + onglets.map((o) => '<button type="button" class="puce ' + (o[0] === etat.ficheOnglet ? "on" : "") + '" data-a="fiche-onglet" data-v="' + o[0] + '">' + o[1] + "</button>").join("") + "</div>";
  let corps = "";
  if (etat.ficheOnglet === "base") corps = ficheBase(c);
  else if (etat.ficheOnglet === "sorts") corps = ficheSorts(c);
  else corps = fichePouvoirs(c);
  z.innerHTML = tete + nav + corps;
}

function ficheBase(c) {
  const k = c.calcul, b = c.base;
  const perceptionPourZen = ["guerrier", "voleur"].includes(classeCle(c));
  const stats = ORDRE.map((s) => {
    const kk = s === "zen" && perceptionPourZen ? "per" : s;
    const creation = (b.stats_total && b.stats_total[kk]) || 10;
    const eff = c.etat.effets.filter((e) => e.champ === "stat." + kk);
    const total = k.stats[s], mod = k.modificateurs[s];
    const sub = eff.length ? eff.map((e) => sg(e.valeur) + " " + e.source).join(", ") : (kk !== s ? "Utilise la Perception" : "");
    const ouvert = !!etat.ouvert["stat-" + s];
    return '<div class="stat"><button type="button" data-a="ouvrir" data-v="stat-' + s + '"><span class="lettre">' + LETTRES[s] + '</span><span class="mid"><span style="font-weight:500">' + NOMS[s] + "</span>" +
      (sub ? '<span class="doux" style="color:' + (eff.some((e) => e.valeur < 0) ? "var(--neg)" : "var(--pos)") + '">' + echapper(sub) + "</span>" : "") +
      '</span><span class="tot">' + total + '</span><span class="mod ' + (mod < 0 ? "neg" : "") + '">' + sg(mod) + "</span></button>" +
      (ouvert ? '<div class="detail"><div><span class="doux">Création (base, race, classe)</span><span>' + creation + "</span></div>" +
        eff.map((e) => '<div><span class="doux">' + echapper(e.source) + '</span><span class="' + (e.valeur < 0 ? "neg" : "pos") + '">' + sg(e.valeur) + "</span></div>").join("") + "</div>" : "") + "</div>";
  }).join("");
  const effets = c.etat.effets.length ? c.etat.effets.map((e) => '<div class="effet ' + (e.valeur < 0 ? "malus" : "bonus") + '"><span><strong>' + sg(e.valeur) + " " + echapper(champTxt(e.champ)) + "</strong> - " + echapper(e.source) + '</span><span class="duree">' + echapper(dureeTxt(e)) + "</span></div>").join("") :
    '<div class="effet" style="background:var(--info-soft);color:var(--info)">Aucun bonus ni malus actif</div>';
  const jeton = etat.partie.carte.jetons[c.id];
  let [prof, larg] = (jeton && jeton.empreinte) || [1, 1];
  const cases = []; for (let i = 0; i < prof * larg; i++) cases.push("<i></i>");
  const comp = Object.keys(k.competences).sort((x, y) => x.localeCompare(y, "fr")).map((n) => {
    const v = k.competences[n];
    return '<div class="comp"><span>' + (v.maitrise ? "● " : "") + echapper(n) + ' <span class="doux">(' + court(v.stat) + ')</span></span><b class="' + (v.bonus < 0 ? "neg" : "") + '">' + sg(v.bonus) + "</b></div>";
  }).join("");
  const sauv = ORDRE.map((s) => {
    const mod = k.modificateurs[s], v = k.sauvegardes[s];
    const prof2 = v - mod !== 0;
    return '<div class="comp"><span>' + (prof2 ? "● " : "") + court(s) + "</span><b>" + sg(v) + "</b></div>";
  }).join("");
  const autres = Object.values(etat.partie.personnages).filter((x) => !x.a_moi);
  const compagnons = autres.length ? '<div class="boite"><h2>À la table</h2>' + autres.map((x) =>
    '<div class="depli"><div class="corps" style="padding-top:12px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + echapper(x.base.nom) + '</b><span class="doux">' + echapper([x.base.race, x.base.classe, "niveau " + x.base.niveau].join(", ")) + "</span></div>" +
    '<div class="tags"><span class="tag">PV ' + x.etat.pv + " / " + x.calcul.pv_max + "</span>" + (x.ki ? '<span class="tag">Ki ' + x.ki.restant + " / " + x.ki.max + "</span>" : "") + (x.joueur ? '<span class="tag info">' + echapper(x.joueur) + "</span>" : "") +
    (x.equipe && x.equipe.length ? x.equipe.map((n) => '<span class="tag">' + echapper(n) + "</span>").join("") : '<span class="doux">Rien de visible porté</span>') + "</div></div></div>").join("") + "</div>" : "";
  return compagnons + '<div class="boite"><div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px"><h2>Caractéristiques</h2><span class="doux">Toucher pour voir la composition</span></div>' + stats + "</div>" +
    '<div class="boite"><h2>Bonus et malus actifs</h2>' + effets + "</div>" +
    '<div class="boite"><h2>Taille et empreinte</h2><div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap"><div class="empreinte" style="grid-template-columns:repeat(' + larg + ',36px)">' + cases.join("") + '</div><div><b>' + echapper(b.taille || "Moyenne") + " : " + prof + " x " + larg + "</b></div></div>" +
    '<div class="doux">Profondeur x largeur. De profil : vitesse et portée réduites. Impossible à dépasser dans un couloir d\'une case.</div></div>' +
    '<div class="boite"><h2>Combat</h2><div class="chiffres"><div class="chiffre"><span class="l">MAÎTRISE</span><span class="v">' + sg(k.maitrise) + "</span></div></div>" +
    '<div class="doux">Sauvegardes (● = maîtrisée)</div><div class="grille">' + sauv + "</div></div>" +
    '<div class="boite"><h2>Compétences</h2><div class="doux">● = maîtrisée</div><div class="grille">' + comp + "</div></div>";
}

async function chargerSorts() {
  if (etat.sorts) return;
  try { etat.sorts = await api("/api/sorts"); rendreFiche(); } catch (e) { etat.sorts = []; }
}
function ficheSorts(c) {
  chargerSorts();
  const k = c.calcul, b = c.base, so = b.sorts || {};
  const carac = (so.caracteristique && ORDRE.includes(so.caracteristique)) ? so.caracteristique : (so.caracteristique ? ORDRE.find((s) => norm(NOMS[s]) === norm(so.caracteristique)) : null);
  const mod = carac ? k.modificateurs[carac] : 0;
  const resume = '<div class="chiffres">' + (carac ? '<div class="chiffre"><span class="l">CARACTÉRISTIQUE</span><span class="v">' + NOMS[carac] + "</span></div>" +
    '<div class="chiffre"><span class="l">DD DE SAUVEGARDE</span><span class="v">' + (8 + k.maitrise + mod) + "</span></div>" +
    '<div class="chiffre"><span class="l">ATTAQUE MAGIQUE</span><span class="v">' + sg(k.maitrise + mod) + "</span></div>" : "") + "</div>";
  const data = etat.sorts || [];
  const trouve = (nom) => data.find((d) => norm(d.nom) === norm(nom));
  const liste = (noms) => (noms || []).map((n) => {
    const d = trouve(n), id = "sort-" + cle(n), ouvert = !!etat.ouvert[id];
    return '<div class="depli"><button type="button" data-a="ouvrir" data-v="' + id + '"><span class="nom">' + echapper(n) + "</span>" + (d ? '<span class="badge">' + echapper(d.ecole) + "</span>" : "") + CHEVRON + "</button>" +
      (ouvert ? '<div class="corps"><div class="tags">' + (d ? '<span class="tag">' + echapper(d.effet) + "</span>" : '<span class="doux">Description à venir.</span>') + "</div></div>" : "") + "</div>";
  }).join("");
  const max = k.emplacements_max, utilises = c.etat.emplacements_utilises || 0;
  const pips = []; for (let i = 0; i < max; i++) pips.push('<span class="pip ' + (i < max - utilises ? "plein" : "") + '"></span>');
  const tours = so.tours_de_magie || [], n1 = so.prepares || so.connus || [];
  return resume + (tours.length ? '<div class="boite"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Tours de magie</h2><span class="doux">À volonté</span></div>' + liste(tours) + "</div>" : "") +
    (n1.length || max ? '<div class="boite"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2>Niveau 1</h2><div class="pips"><span class="doux">Emplacements ' + (max - utilises) + " / " + max + "</span>" + pips.join("") + "</div></div>" + liste(n1) + "</div>" : "");
}

function fichePouvoirs(c) {
  const l = c.calcul.pouvoirs.map((w) => {
    const id = "pouv-" + w.id, ouvert = !!etat.ouvert[id];
    return '<div class="depli"><button type="button" data-a="ouvrir" data-v="' + id + '"><span class="nom">' + echapper(w.nom) + '</span><span class="badge" style="background:var(--ink);color:var(--bg)">' + w.restant + " / " + w.max + "</span>" + CHEVRON + "</button>" +
      (ouvert ? '<div class="corps"><span class="doux" style="font-weight:600">Recharge : ' + (w.recharge === "court" ? "repos court" : "repos long") + "</span></div>" : "") + "</div>";
  }).join("");
  return '<div class="boite"><h2>Pouvoirs</h2>' + (l || '<div class="vide">Aucun pouvoir pour l\'instant.</div>') + "</div>";
}

/* ---------- Inventaire ---------- */
function rendreInventaire() {
  const c = persoActif(), z = $("c-inv");
  if (!c) { z.innerHTML = '<div class="vide">Aucun personnage.</div>'; return; }
  const inv = c.etat.inventaire, objets = inv.objets, ch = c.calcul.charge;
  const total = objets.reduce((s, o) => s + o.quantite, 0);
  const cats = []; objets.forEach((o) => { if (cats.indexOf(o.categorie) < 0) cats.push(o.categorie); });
  if (etat.filtre !== "all" && cats.indexOf(etat.filtre) < 0) etat.filtre = "all";
  const puces = [["all", "Tout", total]].concat(cats.map((cg) => [cg, PLURIELS[cg] || cg, objets.filter((o) => o.categorie === cg).reduce((s, o) => s + o.quantite, 0)]))
    .map((p) => '<button type="button" class="puce ' + (p[0] === etat.filtre ? "on" : "") + '" data-a="filtre" data-v="' + p[0] + '">' + echapper(p[1]) + ' <span style="opacity:.75">' + p[2] + "</span></button>").join("");
  const lignes = objets.filter((o) => etat.filtre === "all" || o.categorie === etat.filtre).map((o) => {
    const id = "obj-" + o.id, ouvert = !!etat.ouvert[id];
    const sol = c.calcul.stats.sol;
    const trop = o.equipe && o.solidite_requise && o.solidite_requise > sol;
    const st = o.stats ? Object.keys(o.stats).map((s) => '<span class="tag">' + echapper(s) + " : " + echapper(o.stats[s]) + "</span>") : [];
    if (o.solidite_requise) st.push('<span class="tag">Solidité requise : ' + o.solidite_requise + "</span>");
    if (trop) st.push('<span class="tag malus">Solidité insuffisante : vitesse -3 m</span>');
    (o.effets_portes || []).forEach((e) => st.push('<span class="tag ' + (e.valeur < 0 ? "malus" : "bonus") + '">' + sg(e.valeur) + " " + echapper(champTxt(e.champ)) + "</span>"));
    if (o.quete) st.push('<span class="tag info">Quête : ' + echapper(o.quete) + "</span>");
    const d = ICONES[o.categorie] || ICONES.divers;
    return '<div class="depli"><button type="button" data-a="ouvrir" data-v="' + id + '"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>' +
      '<span class="nom">' + echapper(o.nom) + (o.quantite > 1 ? " x" + o.quantite : "") + "</span>" + (o.equipe ? '<span class="badge" style="background:var(--accent);color:var(--accent-ink)">Équipé</span>' : "") +
      '<span class="badge">' + echapper(CATEGORIES[o.categorie] || o.categorie) + "</span>" + CHEVRON + "</button>" +
      (ouvert ? '<div class="corps"><div class="tags">' + st.join("") + '</div><div class="doux">Quantité : ' + o.quantite + " - " + fmt(o.poids_kg) + " kg" + (o.quantite > 1 ? " pièce (" + fmt(o.poids_kg * o.quantite) + " kg)" : "") + (o.poids_estime ? " (poids estimé)" : "") + "</div>" +
        '<div><button type="button" class="btn sec" data-a="equiper" data-v="' + echapper(o.id) + '" data-e="' + (o.equipe ? "0" : "1") + '">' + (o.equipe ? "Déséquiper" : "Équiper") + "</button></div></div>" : "") + "</div>";
  }).join("");
  const s = ch.seuils, max = s.max || 1, p100 = (v) => Math.min(100, v / max * 100);
  const couleur = ch.etat === "surcharge" ? "var(--neg)" : ch.etat === "encombre" ? "var(--warn)" : "var(--pos)";
  const lib = ch.etat === "surcharge" ? "Surchargé" : ch.etat === "encombre" ? "Encombré" : "Léger";
  const effet = ch.etat === "surcharge" ? "Vitesse -6 m." : ch.etat === "encombre" ? "Vitesse -3 m." : "Aucun malus.";
  z.innerHTML = '<div class="chiffres"><div class="chiffre"><span class="l">OR</span><span class="v">' + inv.po + ' po</span></div><div class="chiffre"><span class="l">OBJETS</span><span class="v">' + total + "</span></div></div>" +
    '<div class="boite"><div style="display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px"><span class="doux" style="font-weight:600">POIDS PORTÉ</span><span style="font-family:var(--font-title);font-size:20px;font-weight:700">' + fmt(ch.poids) + " / " + fmt(s.max) + " kg</span></div>" +
    '<div class="charge-barre"><span style="flex:0 0 ' + p100(s.encombre) + '%;background:var(--pos);opacity:.28"></span><span style="flex:0 0 ' + (p100(s.surcharge) - p100(s.encombre)) + '%;background:var(--warn);opacity:.28"></span><span style="flex:0 0 ' + (100 - p100(s.surcharge)) + '%;background:var(--neg);opacity:.28"></span><span class="charge-rempli" style="width:' + p100(ch.poids) + "%;background:" + couleur + '"></span></div>' +
    '<div class="graduations"><span style="left:' + p100(s.encombre) + '%">' + fmt(s.encombre) + ' kg</span><span style="left:' + p100(s.surcharge) + '%">' + fmt(s.surcharge) + ' kg</span></div>' +
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px"><span class="verdict" style="background:' + couleur + '">' + lib + '</span><span class="doux">' + effet + "</span></div>" +
    '<div class="doux">Solidité ' + c.calcul.stats.sol + ", seuils calculés par le serveur.</div></div>" +
    (objets.length ? '<div class="tags">' + puces + '</div><div style="display:flex;flex-direction:column;gap:6px">' + lignes + "</div>" : '<div class="vide">Le sac est vide.</div>');
}

/* ---------- Quêtes ---------- */
function rendreQuetes() {
  const p = etat.partie, o = p.quetes.objectifs;
  const min = p.temps.minute, jour = Math.floor(min / 1440) + 1, h = Math.floor((min % 1440) / 60), m = min % 60;
  const faits = o.filter((x) => x.fait).length;
  $("c-quetes").innerHTML = '<div class="chiffres"><div class="chiffre"><span class="l">JOUR</span><span class="v">' + jour + '</span></div><div class="chiffre"><span class="l">HEURE</span><span class="v">' + h + ":" + String(m).padStart(2, "0") + "</span></div>" +
    '<div class="chiffre"><span class="l">OBJECTIFS</span><span class="v">' + faits + " / " + o.length + "</span></div></div>" +
    (o.length ? o.slice().sort((a, b) => Number(a.fait) - Number(b.fait)).map((x) => '<div class="objectif ' + (x.fait ? "fait" : "") + '"><span class="case">' + (x.fait ? "&#10003;" : "") + '</span><span class="txt">' + echapper(x.texte) + "</span></div>").join("") :
      '<div class="vide">Aucune quête en cours. Le MJ en proposera au fil de l\'aventure.</div>');
}

/* ---------- Réglages ---------- */
function rendreReglages() {
  const p = etat.partie;
  const moi = (p && p.moi) || {};
  const orga = moi.role === "organisateur";
  const choix = (liste, actuel, action) => '<div class="choix">' + Object.keys(liste).map((k) => '<button type="button" class="' + (k === actuel ? "on" : "") + '" data-a="' + action + '" data-v="' + k + '"><b>' + echapper(liste[k][0]) + "</b><span>" + echapper(liste[k][1]) + "</span></button>").join("") + "</div>";
  const mien = persoActif();
  const persoBloc = mien ?
    '<div class="choix"><button type="button" class="on" style="cursor:default"><b>' + echapper(mien.base.nom) + "</b><span>" + echapper(mien.base.race + " " + mien.base.classe + ", niveau " + mien.base.niveau) + "</span></button></div>" :
    '<div class="doux">Tu n\'as pas encore de personnage à cette table.</div><a class="btn" href="/creation.html" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Créer un personnage</a><button type="button" class="btn sec" data-a="essai">Ajouter le personnage d\'essai</button>';
  const champ = (id, ph) => '<input id="' + id + '" type="password" maxlength="8" autocomplete="off" autocapitalize="off" placeholder="' + ph + '">';
  const compte = '<div class="boite"><h2>Compte</h2><div>Pseudo : <b>' + echapper(moi.pseudo || "") + "</b>" + (moi.superadmin ? ' <span class="tag info">Superadmin</span>' : orga ? ' <span class="tag info">Organisateur</span>' : "") + "</div>" +
    '<div class="doux">Changer mon code (8 lettres ou chiffres)</div>' + champ("code-ancien", "Code actuel") + champ("code-nouveau", "Nouveau code") +
    '<button type="button" class="btn sec" data-a="changer-code">Changer mon code</button>' +
    '<button type="button" class="btn sec" data-a="deconnexion">Me déconnecter</button></div>';
  let organisateur = "";
  if (orga) {
    const o = etat.orga;
    if (!o) organisateur = '<div class="boite"><h2>Organisateur</h2><div class="doux">Chargement...</div></div>';
    else organisateur = '<div class="boite"><h2>Organisateur</h2><div class="doux">Joueurs de la table</div>' +
      o.joueurs.map((j, i) => '<div class="depli"><div class="corps" style="padding-top:12px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + echapper(j.pseudo) + '</b><span class="doux">' + (j.personnages.map((x) => echapper(x.nom)).join(", ") || "aucun personnage") + "</span></div>" +
        (moi.superadmin ? '<input id="reinit-' + i + '" type="text" maxlength="8" autocomplete="off" autocapitalize="off" placeholder="Nouveau code (8 caractères)"><button type="button" class="btn sec" data-a="reinit" data-v="' + i + '">Réinitialiser son code</button>' : "") + "</div></div>").join("") +
      (o.sans_joueur.length ? '<div class="doux">Personnages sans joueur</div>' + o.sans_joueur.map((x, i) => '<div class="depli"><div class="corps" style="padding-top:12px"><b>' + echapper(x.nom) + '</b><select id="attr-' + i + '">' + o.joueurs.map((j) => '<option value="' + echapper(j.pseudo) + '">' + echapper(j.pseudo) + "</option>").join("") + '</select><button type="button" class="btn sec" data-a="attribuer" data-v="' + i + '">Attribuer à ce joueur</button></div></div>').join("") : "") + "</div>";
  }
  const tcur = (etat.tables || []).find((t) => t.id === etat.tableId);
  let tableBloc = "";
  if (orga && tcur) {
    const membres = (tcur.membres || []).map((m) => '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + echapper(m) + '</b><button type="button" class="btn sec" data-t="retirer" data-v="' + echapper(m) + '">Retirer</button></div>').join("");
    tableBloc = '<div class="boite"><h2>Table : ' + echapper(tcur.nom) + '</h2><div class="doux">Joueurs invités (l\'accès se fait sur invitation de pseudo)</div>' + (membres || '<div class="doux">Personne pour l\'instant.</div>') +
      '<input id="inviter-pseudo" type="text" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="Pseudo à inviter"><button type="button" class="btn" data-t="inviter">Inviter</button>' +
      (moi.superadmin ? '<div class="doux">Organisateur de la table' + (tcur.organisateur ? " (actuellement " + echapper(tcur.organisateur) + ")" : "") + '. Laisse vide pour reprendre la main.</div><input id="orga-pseudo" type="text" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="Pseudo de l\'organisateur"><button type="button" class="btn sec" data-t="organisateur">Désigner l\'organisateur</button>' : "") + "</div>";
  }
  $("c-reglages").innerHTML =
    '<div class="boite"><h2>Personnage</h2>' + persoBloc + "</div>" +
    compte + tableBloc + organisateur +
    '<div class="boite"><h2>Thème</h2>' + choix(THEMES, etat.theme, "theme") + "</div>" +
    (window.innerWidth >= 700 ? '<div class="boite"><h2>Disposition</h2>' + choix(DISPOSITIONS, etat.disposition, "disposition") + '<div class="doux">Pour grand écran. Sur téléphone, les onglets suffisent.</div></div>' : "") +
    (orga ? '<div class="boite"><h2>Sauvegarde</h2><div class="doux">Télécharge toute la partie dans un fichier, ou recharge un fichier. Charger une sauvegarde remplace la partie en cours.</div>' +
    '<button type="button" class="btn sec" data-a="telecharger">Télécharger la sauvegarde</button>' +
    '<button type="button" class="btn sec" data-a="charger-fichier">Charger une sauvegarde</button><input type="file" id="fichier" accept="application/json,.json" hidden></div>' : "") +
    (etat.message ? '<div class="erreur" id="msg-reglages">' + echapper(etat.message) + "</div>" : "") +
    '<div class="doux">Version ' + echapper(etat.serveur.version) + "</div>";
}
async function chargerOrga() {
  if (!etat.partie || !etat.partie.moi || etat.partie.moi.role !== "organisateur") return;
  try { etat.orga = await api("/api/compte"); etat.tables = await api("/api/tables"); if (etat.reglagesOuverts) rendreReglages(); } catch (e) { /* sans effet */ }
}
function ouvrirReglages(o) {
  etat.reglagesOuverts = o; $("reglages").hidden = !o; etat.message = "";
  if (o) { rendreReglages(); chargerOrga(); }
}
$("ouvrir-reglages").onclick = () => ouvrirReglages(true);
$("fermer-reglages").onclick = () => ouvrirReglages(false);

async function telecharger() {
  const j = await api("/api/sauvegarde");
  const blob = new Blob([JSON.stringify(j, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Clics (délégation) ---------- */
document.addEventListener("click", async (ev) => {
  const nav = ev.target.closest("#onglets button");
  if (nav) { etat.onglet = nav.dataset.p; ecrireLocal("onglet", etat.onglet); appliquerMise(); return; }
  const el = ev.target.closest("[data-a]");
  if (!el || !etat.partie && el.dataset.a !== "connecter") return;
  const a = el.dataset.a, v = el.dataset.v;
  const relance = () => { afficher(etat.partie); };
  try {
    if (a === "legende") { etat.legende = !etat.legende; rendreCarte(); }
    else if (a === "ouvrir") { etat.ouvert[v] = !etat.ouvert[v]; rendreFiche(); rendreInventaire(); }
    else if (a === "fiche-onglet") { etat.ficheOnglet = v; rendreFiche(); }
    else if (a === "filtre") { etat.filtre = v; rendreInventaire(); }
    else if (a === "equiper") {
      const c = persoActif();
      const r = await api("/api/action", { action: "equiper", params: { cible: c.id, objet: v, equipe: el.dataset.e === "1" } });
      etat.partie = r.partie; relance();
    }
    else if (a === "theme") { etat.theme = v; ecrireLocal("theme", v); relance(); }
    else if (a === "disposition") { etat.disposition = v; ecrireLocal("disposition", v); relance(); }
    else if (a === "essai") {
      await api("/api/personnages", ESSAI);
      etat.partie = await api("/api/partie"); relance();
    }
    else if (a === "changer-code") {
      await api("/api/compte/code", { ancien: $("code-ancien").value, nouveau: $("code-nouveau").value });
      etat.message = "Code changé."; rendreReglages();
    }
    else if (a === "deconnexion") { await api("/api/compte/deconnexion", {}); etat.partie = null; etat.orga = null; modeCompte = "connexion"; montrerConnexion("compte"); }
    else if (a === "reinit") {
      const j = etat.orga.joueurs[Number(v)];
      await api("/api/organisateur/reinitialiser", { pseudo: j.pseudo, code: $("reinit-" + v).value });
      etat.message = "Nouveau code enregistré pour " + j.pseudo + ". Transmets-le lui."; rendreReglages();
    }
    else if (a === "attribuer") {
      const x = etat.orga.sans_joueur[Number(v)];
      await api("/api/organisateur/attribuer", { perso: x.id, pseudo: $("attr-" + v).value });
      etat.partie = await api("/api/partie"); etat.message = x.nom + " est attribué."; afficher(etat.partie); chargerOrga();
    }
    else if (a === "telecharger") { await telecharger(); }
    else if (a === "charger-fichier") { $("fichier").click(); }
  } catch (e) {
    etat.message = e.message;
    if (etat.reglagesOuverts) rendreReglages(); else $("err").textContent = e.message;
  }
});
document.addEventListener("change", async (ev) => {
  if (ev.target.id !== "fichier" || !ev.target.files[0]) return;
  try {
    const texte = await ev.target.files[0].text();
    let o; try { o = JSON.parse(texte); } catch (e) { throw new Error("Ce fichier n'est pas une sauvegarde valide."); }
    if (!window.confirm("Remplacer la partie en cours par cette sauvegarde ?")) return;
    const r = await api("/api/sauvegarde", o);
    etat.partie = r.partie; etat.message = "Sauvegarde chargée."; cleJet = ""; afficher(etat.partie);
  } catch (e) { etat.message = e.message; rendreReglages(); }
});

$("entrer").onclick = async () => {
  $("err-connexion").textContent = "";
  try { await api("/api/connexion", { mot_de_passe: $("mdp").value }); await demarrer(); }
  catch (e) { if (e.message !== "connexion requise") $("err-connexion").textContent = e.message; }
};
$("deco-aucune").onclick = async () => { await api("/api/compte/deconnexion", {}).catch(() => {}); modeCompte = "connexion"; montrerConnexion("compte"); };
$("mdp").addEventListener("keydown", (e) => { if (e.key === "Enter") $("entrer").click(); });
$("valider-compte").onclick = async () => {
  $("err-compte").textContent = "";
  try {
    await api(modeCompte === "creation" ? "/api/compte/creer" : "/api/compte/connexion", { pseudo: $("pseudo").value, code: $("code").value });
    $("code").value = ""; modeCompte = "connexion";
    await demarrer();
  } catch (e) { if (e.message !== "connexion requise") $("err-compte").textContent = e.message; }
};
$("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("valider-compte").click(); });
$("bascule-compte").onclick = () => { modeCompte = modeCompte === "creation" ? "connexion" : "creation"; $("err-compte").textContent = ""; majModeCompte(); };
// Sondage léger: les autres joueurs voient les nouveautés sans recharger.
async function sonder() {
  if (!etat.partie || etat.occupe || document.hidden || etat.jetEnCours) return;
  try {
    const occ = etat.partie.mj_occupe ? etat.partie.mj_occupe.perso || "" : "";
    const r = await fetch("/api/partie?depuis=" + etat.partie.rev + "&occ=" + encodeURIComponent(occ), { headers: entetes() });
    if (!r.ok || etat.occupe || etat.jetEnCours) return;
    const j = await r.json();
    if (j.inchange) return;
    afficher(j);
  } catch (e) { /* réseau coupé: on réessaiera */ }
}
setInterval(sonder, 4000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) sonder(); });
window.addEventListener("resize", () => { if (etat.partie) appliquerMise(); });

/* ---------- Tables: accueil, entrée, invitations ---------- */
function choisirTable(id) { etat.tableId = id || ""; ecrireLocal("table", etat.tableId); etat.partie = null; etat.orga = null; cleJet = ""; }
async function entrerTable(id) {
  choisirTable(id);
  const p = await api("/api/partie");
  $("accueil").hidden = true;
  afficher(p);
  chargerOrga();
}
async function chargerAccueil() {
  const [c, t, b] = await Promise.all([api("/api/compte"), api("/api/tables"), api("/api/personnages")]);
  etat.moiCompte = c.moi; etat.tables = t; etat.biblio = b;
}
function rendreAccueil() {
  const moi = etat.moiCompte || {};
  $("fermer-accueil").hidden = !etat.partie;
  const cartes = etat.tables.map((t) => {
    const choixPerso = etat.biblio.length ?
      '<select id="choix-' + echapper(t.id) + '">' + etat.biblio.map((p) => '<option value="' + echapper(p.id) + '">' + echapper(p.nom + " (" + p.race + " " + p.classe + ", niveau " + p.niveau + ")") + "</option>").join("") + "</select>" +
      '<button type="button" class="btn sec" data-t="rejoindre" data-v="' + echapper(t.id) + '">Rejoindre avec ce personnage</button>' : "";
    const sansPerso = !t.mon_perso ? '<div class="doux">Tu n\'as pas de personnage à cette table.</div>' + choixPerso +
      '<a class="btn sec" data-t="creer-perso" data-v="' + echapper(t.id) + '" href="/creation.html" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Créer un nouveau personnage</a>' : "";
    return '<div class="boite"><h2>' + echapper(t.nom) + '</h2><div class="tags"><span class="tag ' + (t.role === "organisateur" ? "info" : "") + '">' + (t.role === "organisateur" ? "Organisateur" : "Joueur") + "</span>" +
      (t.organisateur ? '<span class="tag">Orga : ' + echapper(t.organisateur) + "</span>" : "") + (t.mon_perso ? '<span class="tag">' + echapper(t.mon_perso.nom) + "</span>" : "") + "</div>" +
      sansPerso + '<button type="button" class="btn" data-t="entrer" data-v="' + echapper(t.id) + '">Entrer sur la table</button></div>';
  }).join("");
  const vide = !etat.tables.length ? '<div class="boite"><h2>Aucune table</h2><div class="doux">Tu es connecté en tant que <b>' + echapper(moi.pseudo || "") + "</b>, mais tu n'as été invité à aucune table. Donne ce pseudo à l'organisateur : il t'invite, puis recharge cette page.</div></div>" : "";
  const creer = moi.superadmin ? '<div class="boite"><h2>Créer une table</h2><div class="doux">Une table = une quête. Tu en es l\'organisateur, et tu peux en désigner un autre ensuite.</div><input id="nom-table" type="text" maxlength="60" placeholder="Nom de la table"><button type="button" class="btn" data-t="creer-table">Créer la table</button></div>' : "";
  $("c-accueil").innerHTML = cartes + vide + creer + (etat.messageAccueil ? '<div class="' + (/créée/.test(etat.messageAccueil) ? "doux" : "erreur") + '">' + echapper(etat.messageAccueil) + "</div>" : "") +
    '<div class="boite"><div>Connecté : <b>' + echapper(moi.pseudo || "") + '</b></div><button type="button" class="btn sec" data-t="deconnexion">Me déconnecter</button></div>';
}
async function montrerAccueil() {
  $("connexion").hidden = true; $("reglages").hidden = true; etat.reglagesOuverts = false;
  $("app").hidden = true; $("accueil").hidden = false;
  try { await chargerAccueil(); } catch (e) { return; }
  rendreAccueil();
}
async function demarrer() {
  let tables, compte;
  try { [compte, tables] = await Promise.all([api("/api/compte"), api("/api/tables")]); } catch (e) { return; }
  etat.moiCompte = compte.moi; etat.tables = tables;
  const connue = tables.find((t) => t.id === etat.tableId);
  if (connue) return entrerTable(connue.id).catch(() => montrerAccueil());
  // une seule table et pas superadmin: on y entre directement
  if (tables.length === 1 && !compte.moi.superadmin) return entrerTable(tables[0].id).catch(() => montrerAccueil());
  return montrerAccueil();
}
// Actions des écrans de tables (attribut data-t).
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-t]");
  if (!el) return;
  const a = el.dataset.t, v = el.dataset.v;
  const rafraichir = async () => { await chargerAccueil(); if (!$("accueil").hidden) rendreAccueil(); if (etat.reglagesOuverts) rendreReglages(); };
  try {
    etat.messageAccueil = ""; etat.message = "";
    if (a === "entrer") { await entrerTable(v); }
    else if (a === "creer-perso") { ecrireLocal("table", v); /* le lien ouvre la page de création, qui rejoint cette table */ }
    else if (a === "creer-table") {
      const t = await api("/api/tables", { nom: $("nom-table").value });
      await rafraichir(); etat.messageAccueil = "Table « " + t.nom + " » créée."; rendreAccueil();
    }
    else if (a === "rejoindre") {
      await api("/api/tables/" + v + "/rejoindre", { perso: $("choix-" + v).value });
      await entrerTable(v);
    }
    else if (a === "inviter") {
      await api("/api/tables/" + etat.tableId + "/inviter", { pseudo: $("inviter-pseudo").value });
      etat.message = "Invitation envoyée."; await rafraichir();
    }
    else if (a === "retirer") {
      await api("/api/tables/" + etat.tableId + "/retirer", { pseudo: v });
      etat.message = v + " est retiré de la table."; await rafraichir();
    }
    else if (a === "organisateur") {
      await api("/api/tables/" + etat.tableId + "/organisateur", { pseudo: $("orga-pseudo").value });
      etat.message = "Organisateur mis à jour."; await rafraichir();
    }
    else if (a === "deconnexion") { await api("/api/compte/deconnexion", {}); choisirTable(""); modeCompte = "connexion"; $("accueil").hidden = true; montrerConnexion("compte"); }
  } catch (e) {
    if (e.message === "connexion requise") return;
    etat.message = e.message; etat.messageAccueil = e.message;
    if (!$("accueil").hidden) rendreAccueil(); else if (etat.reglagesOuverts) rendreReglages();
  }
});
$("ouvrir-accueil").onclick = () => montrerAccueil();
$("fermer-accueil").onclick = () => { $("accueil").hidden = true; $("app").hidden = false; };

fetch("/sante").then((r) => r.json()).then((j) => { etat.serveur = { mot_de_passe: !!j.mot_de_passe, version: j.version }; $("version").textContent = "Version " + j.version; }).catch(() => {});
document.documentElement.setAttribute("data-theme", THEMES[etat.theme] ? etat.theme : "commonwealth");
demarrer().catch(() => {});
