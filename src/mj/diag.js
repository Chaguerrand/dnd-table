"use strict";
// Diagnostic facultatif (variable GEMINI_DIAG): liste les modèles et mesure leur vitesse, résultats dans les logs.
async function lancerDiag(cle, modeles) {
  const h = { "content-type": "application/json", "x-goog-api-key": cle };
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: h, signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const noms = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace("models/", ""));
    console.log("DIAG modèles disponibles (" + r.status + "): " + noms.join(", "));
  } catch (e) { console.log("DIAG liste impossible: " + e.message); }
  await Promise.all(modeles.map(async (m) => {
    for (const reflexion of [true, false]) {
      for (let i = 0; i < 1; i++) {
        const t = Date.now();
        const gc = { maxOutputTokens: 300 };
        if (reflexion) gc.thinkingConfig = { thinkingLevel: "low" };
        try {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", {
            method: "POST", headers: h, signal: AbortSignal.timeout(40000),
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Décris en deux phrases une porte de donjon." }] }], generationConfig: gc })
          });
          const txt = await r.text();
          console.log("DIAG " + m + (reflexion ? " low" : " defaut") + " essai" + (i + 1) + ": HTTP " + r.status + " en " + ((Date.now() - t) / 1000).toFixed(1) + " s" + (r.ok ? "" : " - " + txt.slice(0, 140).replace(/\s+/g, " ")));
        } catch (e) { console.log("DIAG " + m + (reflexion ? " low" : " defaut") + " essai" + (i + 1) + ": " + e.message + " après " + ((Date.now() - t) / 1000).toFixed(1) + " s"); }
      }
    }
  }));
  console.log("DIAG terminé");
}
module.exports = { lancerDiag };
