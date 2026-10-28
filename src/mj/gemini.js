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

function creerGemini({ cle, modele, fetchFn }) {
  const f = fetchFn || fetch;
  const nom = modele || "gemini-2.5-flash";
  return {
    nom: "gemini:" + nom,
    async generer({ systeme, messages, outils }) {
      const corps = {
        systemInstruction: { parts: [{ text: systeme }] },
        contents: versGemini(messages),
        tools: schemaOutils(outils),
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
      };
      const attentes = [0, 2000, 5000, 9000]; // nouvelles tentatives si Google est surchargé
      let j, r;
      for (let i = 0; i < attentes.length; i++) {
        if (attentes[i]) await new Promise((ok) => setTimeout(ok, attentes[i]));
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(nom) + ":generateContent";
        r = await f(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cle }, body: JSON.stringify(corps) });
        const txt = await r.text();
        try { j = JSON.parse(txt); } catch { j = {}; }
        if (r.ok) break;
        const passager = [429, 500, 502, 503, 504].includes(r.status);
        if (!passager || i === attentes.length - 1) {
          const e = new Error((j.error && j.error.message) || ("erreur Gemini " + r.status));
          e.status = r.status; throw e;
        }
      }
      const cand = j.candidates && j.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const texte = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
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

module.exports = { creerGemini, schemaOutils, versGemini };
