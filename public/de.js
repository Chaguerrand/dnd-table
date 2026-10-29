"use strict";
// Dé 3D en SVG. Les valeurs sont toujours décidées avant (par le serveur): l'animation ne fait que les montrer.
const De = (() => {
  const mul = (a, b) => {
    const r = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
    return r;
  };
  const app = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const axis = (ax, ang) => {
    const l = Math.hypot(ax[0], ax[1], ax[2]); const x = ax[0] / l, y = ax[1] / l, z = ax[2] / l;
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const rr = (a, b) => a + Math.random() * (b - a);
  const alea2 = () => Math.random() < 0.5;

  const cache = {};
  function forme(n) {
    if (cache[n]) return cache[n];
    let V = [], F = [];
    const angSort = (idx, axisV) => {
      const a = Math.abs(axisV[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const e1 = nrm(cross(axisV, a)); const e2 = cross(axisV, e1);
      return idx.slice().sort((p, q) => Math.atan2(dot(V[p], e2), dot(V[p], e1)) - Math.atan2(dot(V[q], e2), dot(V[q], e1)));
    };
    if (n === 4) {
      V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      F = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
    } else if (n === 6) {
      for (let i = 0; i < 8; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
      for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
        const idx = []; V.forEach((v, i) => { if (v[a] === s) idx.push(i); });
        const ax = [0, 0, 0]; ax[a] = s; F.push(angSort(idx, ax));
      }
    } else if (n === 8) {
      V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (const sx of [0, 1]) for (const sy of [2, 3]) for (const sz of [4, 5]) F.push([sx, sy, sz]);
    } else if (n === 10) {
      const h = 0.12, r = 1;
      const U = [], L = [];
      for (let i = 0; i < 5; i++) {
        const a = i * 2 * Math.PI / 5, b = a + Math.PI / 5;
        U.push([r * Math.cos(a), r * Math.sin(a), h]); L.push([r * Math.cos(b), r * Math.sin(b), -h]);
      }
      const nn = cross(sub(L[0], U[0]), sub(U[1], U[0]));
      const A = dot(nn, U[0]) / nn[2];
      V = [[0, 0, A], [0, 0, -A]].concat(U, L);
      for (let i = 0; i < 5; i++) {
        const i2 = (i + 1) % 5;
        F.push([0, 2 + i, 7 + i, 2 + i2]);
        F.push([1, 7 + i, 2 + i2, 7 + i2]);
      }
    } else if (n === 20 || n === 12) {
      const p = (1 + Math.sqrt(5)) / 2;
      const iv = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) { iv.push([0, a, b * p]); iv.push([a, b * p, 0]); iv.push([b * p, 0, a]); }
      const itri = [];
      for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
        const d = (x, y) => Math.hypot(...sub(iv[x], iv[y]));
        if (Math.abs(d(i, j) - 2) < 1e-6 && Math.abs(d(j, k) - 2) < 1e-6 && Math.abs(d(i, k) - 2) < 1e-6) itri.push([i, j, k]);
      }
      if (n === 20) { V = iv; F = itri; }
      else {
        V = itri.map((t) => nrm([iv[t[0]][0] + iv[t[1]][0] + iv[t[2]][0], iv[t[0]][1] + iv[t[1]][1] + iv[t[2]][1], iv[t[0]][2] + iv[t[1]][2] + iv[t[2]][2]]));
        for (let v = 0; v < 12; v++) {
          const idx = []; itri.forEach((t, i) => { if (t.indexOf(v) >= 0) idx.push(i); });
          F.push(angSort(idx, nrm(iv[v])));
        }
      }
    }
    let mx = 0; V.forEach((v) => { mx = Math.max(mx, Math.hypot(v[0], v[1], v[2])); });
    V = V.map((v) => [v[0] / mx, v[1] / mx, v[2] / mx]);
    const faces = F.map((idx) => {
      const c = [0, 0, 0]; idx.forEach((i) => { c[0] += V[i][0] / idx.length; c[1] += V[i][1] / idx.length; c[2] += V[i][2] / idx.length; });
      const nv = nrm(c);
      let up = n === 6 ? sub([(V[idx[0]][0] + V[idx[1]][0]) / 2, (V[idx[0]][1] + V[idx[1]][1]) / 2, (V[idx[0]][2] + V[idx[1]][2]) / 2], c) : sub(V[idx[0]], c);
      up = nrm(sub(up, nv.map((x) => x * dot(up, nv))));
      const right = cross(up, nv);
      let rin = 9;
      for (let i = 0; i < idx.length; i++) {
        const a = V[idx[i]], b = V[idx[(i + 1) % idx.length]];
        const e = nrm(sub(b, a)); const w = sub(c, a);
        const perp = sub(w, e.map((x) => x * dot(w, e)));
        rin = Math.min(rin, Math.hypot(perp[0], perp[1], perp[2]));
      }
      return { idx, c, n: nv, up, right, rin };
    });
    const val = new Array(faces.length).fill(0);
    if (n === 4) { for (let i = 0; i < 4; i++) val[i] = i + 1; }
    else {
      const opp = faces.map((f, i) => { let b = -1, bd = 9; faces.forEach((g, j) => { const d = dot(f.n, g.n) + 1; if (j !== i && d < bd) { bd = d; b = j; } }); return b; });
      let seed = n * 7919;
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const ks = []; for (let k = 1; k <= n / 2; k++) ks.push(k);
      for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = ks[i]; ks[i] = ks[j]; ks[j] = t; }
      let q = 0;
      for (let i = 0; i < faces.length; i++) if (!val[i]) { val[i] = ks[q]; val[opp[i]] = n + 1 - ks[q]; q++; }
    }
    faces.forEach((f, i) => { f.val = val[i]; });
    const byVal = {}; faces.forEach((f, i) => { byVal[f.val] = i; });
    return (cache[n] = { V, faces, byVal });
  }

  function emplacements(n) {
    const cols = n <= 3 ? n : Math.ceil(n / 2);
    const rows = n <= 3 ? 1 : 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = rows === 1 ? 0 : (i < cols ? 0 : 1);
      const inRow = rows === 1 ? n : (r === 0 ? cols : n - cols);
      const k = rows === 1 ? i : (r === 0 ? i : i - cols);
      out.push({ x: 480 * (k + 1) / (inRow + 1), y: rows === 1 ? 138 : (r === 0 ? 100 : 180) });
    }
    return out;
  }

  // valeurs: [{ faces, valeur, garde }]
  function creer(specs) {
    const n = specs.length;
    const S = n === 1 ? 62 : (n === 2 ? 54 : (n === 3 ? 46 : (n <= 4 ? 40 : 34)));
    const pos = emplacements(n);
    return specs.map((sp, i) => {
      const sh = forme(sp.faces);
      const f = sh.faces[sh.byVal[sp.valeur]];
      const base = [f.right[0], f.right[1], f.right[2], f.up[0], f.up[1], f.up[2], f.n[0], f.n[1], f.n[2]];
      const off = { 4: 0.6, 6: 0.5, 8: 0.5, 10: 0.28, 12: 0.4, 20: 0.2 }[sp.faces] || 0.3, th = off * 0.75, yw = off * 0.65;
      const tilt = mul([1, 0, 0, 0, Math.cos(th), Math.sin(th), 0, -Math.sin(th), Math.cos(th)], [Math.cos(yw), 0, Math.sin(yw), 0, 1, 0, -Math.sin(yw), 0, Math.cos(yw)]);
      const fin = pos[i];
      const rndPt = () => ({ x: rr(60, 420), y: rr(70, 190) });
      const near = (r) => ({ x: Math.max(40, Math.min(440, fin.x + rr(-r, r))), y: Math.max(60, Math.min(200, fin.y + rr(-r * 0.5, r * 0.5))) });
      const sx = alea2() ? -30 : 510;
      return {
        faces: sp.faces, valeur: sp.valeur, garde: sp.garde !== false, S,
        Rt: mul(tilt, base),
        a1: [rr(-1, 1), rr(-1, 1), rr(-1, 1)], a2: [rr(-1, 1), rr(-1, 1), rr(-1, 1)],
        A1: rr(5, 8) * Math.PI * (alea2() ? 1 : -1), A2: rr(3, 6) * Math.PI * (alea2() ? 1 : -1),
        wp: [{ x: sx, y: rr(60, 190) }, rndPt(), near(110), near(40), fin], fin
      };
    });
  }

  function place(d, t) {
    const cuts = [0, 0.28, 0.55, 0.80, 1];
    let k = 0; while (k < 3 && t > cuts[k + 1]) k++;
    const u = (t - cuts[k]) / (cuts[k + 1] - cuts[k]);
    const a = d.wp[k], b = d.wp[k + 1];
    const gx = a.x + (b.x - a.x) * u, gy = a.y + (b.y - a.y) * u;
    const hh = k === 0 ? 1.3 * (1 - u) * (1 - u) : [0, 0.6, 0.3, 0.12][k] * 4 * u * (1 - u);
    const f = Math.pow(1 - t, 1.5);
    const R = mul(d.Rt, mul(axis(d.a1, d.A1 * f), axis(d.a2, d.A2 * f)));
    return { gx, gy, h: hh, R };
  }

  const NS = "http://www.w3.org/2000/svg";
  function dessiner(svg, des, t) {
    const items = des.map((d) => Object.assign({ d }, place(d, t))).sort((p, q) => p.gy - q.gy);
    const L = nrm([-0.4, 0.7, 0.6]);
    let html = '<ellipse cx="240" cy="140" rx="214" ry="86" style="fill:var(--panel);stroke:var(--line2);stroke-width:2"/>';
    items.forEach((it) => {
      const d = it.d, sh = forme(d.faces);
      const sc = d.S * (1 + 0.12 * it.h);
      const X = it.gx, Y = it.gy - it.h * 80 - 4;
      html += '<ellipse cx="' + it.gx.toFixed(1) + '" cy="' + (it.gy + d.S * 0.78).toFixed(1) + '" rx="' + (d.S * 0.85 * (1 - 0.25 * Math.min(1, it.h))).toFixed(1) + '" ry="' + (d.S * 0.3).toFixed(1) + '" fill="#000" fill-opacity="' + (0.3 / (1 + 1.5 * it.h)).toFixed(3) + '"/>';
      const op = d.garde ? 1 : 0.4;
      sh.faces.forEach((f) => {
        const n2 = app(it.R, f.n);
        if (n2[2] <= 0.02) return;
        const pts = f.idx.map((i) => { const v = app(it.R, sh.V[i]); return (X + v[0] * sc).toFixed(1) + "," + (Y - v[1] * sc).toFixed(1); }).join(" ");
        const c2 = app(it.R, f.c), u2 = app(it.R, f.up), r2 = app(it.R, f.right);
        const lum = Math.max(0, dot(n2, L));
        const lab = String(f.val);
        const fs = f.rin * (lab.length > 1 ? 0.95 : 1.2) * sc;
        const kk = fs / 20;
        const tf = "matrix(" + [kk * r2[0], -kk * r2[1], -kk * u2[0], kk * u2[1], X + c2[0] * sc, Y - c2[1] * sc].map((x) => x.toFixed(3)).join(" ") + ")";
        const sOp = (lum > 0.55 ? (lum - 0.55) * 0.55 : (0.55 - lum) * 0.6).toFixed(3);
        html += '<g opacity="' + op + '"><polygon points="' + pts + '" style="fill:var(--accent);stroke:var(--ink);stroke-width:1;stroke-linejoin:round"/>' +
          '<polygon points="' + pts + '" fill="' + (lum > 0.55 ? "#fff" : "#000") + '" fill-opacity="' + sOp + '"/>' +
          '<text transform="' + tf + '" x="0" y="7" font-size="20" text-anchor="middle"' + ((lab === "6" || lab === "9") ? ' text-decoration="underline"' : "") + ' style="fill:var(--accent-ink);font-family:var(--font-title);font-weight:700">' + lab + "</text></g>";
      });
    });
    svg.innerHTML = html;
  }

  // Lance l'animation (1,7 s) puis appelle fin(). Renvoie une fonction pour passer l'animation.
  function lancer(svg, specs, fin) {
    const des = creer(specs);
    let reduit = false;
    try { reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduit = false; }
    if (reduit) { dessiner(svg, des, 1); if (fin) fin(); return () => {}; }
    const T = 1700, t0 = performance.now();
    let raf = null, fini = false;
    const terminer = () => { if (fini) return; fini = true; if (raf) cancelAnimationFrame(raf); dessiner(svg, des, 1); if (fin) fin(); };
    const pas = (now) => {
      const t = Math.min(1, (now - t0) / T);
      if (t >= 1) { terminer(); return; }
      dessiner(svg, des, t);
      raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return terminer;
  }

  // Dé posé, sans animation (affiché avant le lancer).
  function poser(svg, specs) { dessiner(svg, creer(specs), 1); }

  return { lancer, poser, NS };
})();
