"use strict";

// Adaptateur Gemini (API REST). Seul fichier à remplacer pour changer de modèle.
// Interface commune: generer({ systeme, messages, outils }) -> { texte, appels:[{nom,args}], parts }
// Messages neutres: {role:"user", texte} | {role:"mj", texte, appels, parts} | {role:"outil", reponses:[{nom, contenu}]}

function schemaOutils(outils) {
  return [{
    functionDeclarations: outils.map((o) => {
      const properties = {}; const required = [];
      for (const [k, s] of Object.entries(o.parametres)) {
        properties[k] = { type: s.type, description: s.description };
        if (s.enum) properties[k].enum = s.enum;
        if (s.requis) required.push(k);
      }
      return { name: o.nom, description: o.description, parameters: { type: "object", properties, required } };
    })
  }];
}

function versGemini(messages) {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", parts: [{ text: m.texte }] };
    if (m.role === "mj") {
      if (m.parts) return { role: "model", parts: m.parts }; // rejoue tel quel (signatures de réflexion comprises)
      const parts = [];
      if (m.texte) parts.push({ text: m.texte });
      for (const a of m.appels || []) parts.push({ functionCall: { name: a.nom, args: a.args || {} } });
      return { role: "model", parts };
    }
    return { role: "user", parts: m.reponses.map((r) => ({ functionResponse: { name: r.nom, response: r.contenu } })) };
  });
}

// Appelle un modèle: jusqu'à `essais` tentatives si Google est surchargé ou ne répond pas.
async function appelerModele(f, cle, nom, corps, essais) {
  let derniere;
  for (let i = 0; i < essais; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 1500));
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(nom) + ":generateContent";
    const t1 = Date.now();
    let r, txt;
    try {
      r = await f(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cle }, body: JSON.stringify(corps), signal: AbortSignal.timeout(15000) });
      txt = await r.text();
    } catch (e) {
      console.warn("Gemini " + nom + " sans réponse après " + Math.round((Date.now() - t1) / 1000) + " s (essai " + (i + 1) + "): " + e.message);
      derniere = new Error("Gemini ne répond pas"); continue;
    }
    let j; try { j = JSON.parse(txt); } catch { j = {}; }
    if (r.ok) { console.log("Gemini " + nom + " ok en " + Math.round((Date.now() - t1) / 100) / 10 + " s (essai " + (i + 1) + ")"); return j; }
    const msg = (j.error && j.error.message) || ("erreur Gemini " + r.status);
    if (r.status === 400 && corps.generationConfig.thinkingConfig && /think/i.test(msg)) {
      delete corps.generationConfig.thinkingConfig; i--; continue; // ce modèle ne connait pas ce réglage
    }
    console.warn("Gemini " + nom + " " + r.status + " (essai " + (i + 1) + "): " + msg.slice(0, 120));
    derniere = Object.assign(new Error(msg), { status: r.status });
    if (![429, 500, 502, 503, 504].includes(r.status)) throw derniere;
  }
  throw derniere;
}

// modele: modèle principal; secours: autres modèles essayés si le principal est surchargé.
// Certains modèles laissent fuiter leur raisonnement (en anglais) dans le texte: on coupe à la première trace.
const MARQUEURS_FUITE = [/dynamic_thought/i, /Key framing/i, /\n\s*Wait[,:]/, /\n\s*Let'?s (call|check|see|write|do)/i, /\n\s*Parameters for/i, /\n\s*\d+\.\s+(Short|Prompt|Narrative)\b/i, /\n\s*(Okay|Ok),? (so|let)/i, /\n\s*(So|Now),? (I|the|let)\b/];
function nettoyer(texte) {
  let fin = texte.length;
  for (const m of MARQUEURS_FUITE) { const r = m.exec(texte); if (r && r.index < fin) fin = r.index; }
  return texte.slice(0, fin).trim();
}

function creerGemini({ cle, modele, secours, fetchFn }) {
  const f = fetchFn || fetch;
  const chaine = [modele || "gemini-2.5-flash", ...(secours || [])];
  return {
    nom: "gemini:" + chaine.join(">"),
    async generer({ systeme, messages, outils }) {
      let j, derniere;
      for (let k = 0; k < chaine.length; k++) {
        const corps = {
          systemInstruction: { parts: [{ text: systeme }] },
          contents: versGemini(messages),
          tools: schemaOutils(outils),
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "low" } }
        };
        try { j = await appelerModele(f, cle, chaine[k], corps, k === chaine.length - 1 ? 3 : 2); break; }
        catch (e) { derniere = e; if (e.status && ![429, 500, 502, 503, 504].includes(e.status)) throw e; }
      }
      if (!j) throw derniere || new Error("Gemini indisponible");
      const cand = j.candidates && j.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const texte = nettoyer(parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim());
      const appels = parts.filter((p) => p.functionCall).map((p) => ({ nom: p.functionCall.name, args: p.functionCall.args || {} }));
      if (!texte && !appels.length) {
        const raison = (cand && cand.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || "inconnue";
        console.error("Gemini réponse vide:", JSON.stringify(j).slice(0, 600));
        throw new Error("Gemini n'a rien répondu (raison: " + raison + ")");
      }
      return { texte, appels, parts };
    }
  };
}

module.exports = { nettoyer, creerGemini, schemaOutils, versGemini };
