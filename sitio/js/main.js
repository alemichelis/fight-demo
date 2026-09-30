(function () {
  'use strict';
  // idioma: /js/idioma.js traduce el HTML; lo que se escribe letra por letra o se arma acá pasa por tr()
  var EN = window.DX_IDIOMA === 'en';
  var tr = window.t || function (s) { return s; };
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* =====================================================================
     1. Small helpers
     ===================================================================== */
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixHex(a, b, t) {
    var A = hex(a), B = hex(b), out = '#';
    for (var i = 0; i < 3; i++) out += Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
    return out;
  }
  function rgba(h, a) { var A = hex(h); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function noise1(seed) {
    var r = rng(seed), N = 256, v = new Float32Array(N);
    for (var i = 0; i < N; i++) v[i] = r();
    return function (x) {
      var i0 = Math.floor(x), f = x - i0;
      var a = v[((i0 % N) + N) % N], b = v[(((i0 + 1) % N) + N) % N];
      var t = (1 - Math.cos(f * Math.PI)) * 0.5;
      return a + (b - a) * t;
    };
  }
  function fbm(n, x, oct) {
    var s = 0, amp = 1, f = 1, m = 0;
    for (var i = 0; i < oct; i++) { s += n(x * f) * amp; m += amp; amp *= 0.5; f *= 2.07; }
    return s / m;
  }
  function ss(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  var grainTile = null;
  function grainOver(ctx, w, h) {
    if (!grainTile) {
      grainTile = mk(128, 128);
      var gx = grainTile.getContext('2d'), d = gx.createImageData(128, 128);
      for (var i = 0; i < d.data.length; i += 4) {
        var v = Math.random() * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 16;
      }
      gx.putImageData(d, 0, 0);
    }
    if (!ctx._grain) ctx._grain = ctx.createPattern(grainTile, 'repeat');
    ctx.fillStyle = ctx._grain;
    ctx.fillRect(0, 0, w, h);
  }

  /* =====================================================================
     2. Painted 2D landscapes (service cards + hero fallback)
     ===================================================================== */
  var PALS = {
    atardecer: { name: 'Atardecer', sky: ['#2a2031', '#7d5566', '#e0a684', '#f7d3a8'], sun: '#ffe6bd', sunPos: [0.64, 0.46], far: '#c79d9c', near: '#1a1215', fog: '#ebc6b2', leaf: '#dc8a3c', leafDark: '#7c3f1b' },
    neon:      { name: 'Neón',      sky: ['#0b0a20', '#261a52', '#732d78', '#e25b8f'], sun: '#ffa3cb', sunPos: [0.3, 0.5],  far: '#6a3d88', near: '#0b0813', fog: '#9c4c8d', leaf: '#3fbfae', leafDark: '#15534c', stars: true },
    niebla:    { name: 'Niebla',    sky: ['#46504c', '#9a9a8b', '#d9cfbc', '#eee2cb'], sun: '#fff4dc', sunPos: [0.5, 0.36], far: '#8d968b', near: '#18201c', fog: '#ddd6c5', leaf: '#b9a24c', leafDark: '#544a1f', mesa: false },
    violeta:   { name: 'Violeta',   sky: ['#321833', '#86395c', '#e57f4e', '#ffc47e'], sun: '#fff1c4', sunPos: [0.76, 0.56], far: '#9a5877', near: '#1e0e1c', fog: '#dc8a7c', leaf: '#f0a14f', leafDark: '#6e321b' },
    aurora:    { name: 'Aurora',    sky: ['#0c1823', '#1c4555', '#6aaea3', '#d6ecdc'], sun: '#ecfff6', sunPos: [0.22, 0.42], far: '#5c8b8f', near: '#0a1318', fog: '#a8d4ca', leaf: '#e3a75c', leafDark: '#6b4520', stars: true }
  };
  var PAL_KEYS = Object.keys(PALS);

  function buildFog(w, h, baseY, pal, t, R) {
    var bandH = h * 0.22, c = mk(w * 2, bandH), x = c.getContext('2d');
    var a = 0.5 * (1 - t) + 0.12;
    for (var k = 0; k < 16; k++) {
      var bx = R() * w, by = bandH * (0.35 + R() * 0.35);
      var rx = w * (0.12 + R() * 0.18), ry = bandH * (0.22 + R() * 0.25);
      for (var d = -1; d <= 1; d++) {
        x.save();
        x.translate(bx + w + d * w, by);
        x.scale(1, ry / rx);
        var g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, rgba(pal.fog, a));
        g.addColorStop(1, rgba(pal.fog, 0));
        x.fillStyle = g;
        x.beginPath(); x.arc(0, 0, rx, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
    return { c: c, y: baseY - bandH * 0.45, speed: 0.012 + t * 0.02 };
  }

  function buildScene(w, h, pal, seed, animated) {
    var R = rng(seed * 7 + 3);
    var sky = mk(w, h), sx = sky.getContext('2d');
    var g = sx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.sky[0]); g.addColorStop(0.36, pal.sky[1]);
    g.addColorStop(0.62, pal.sky[2]); g.addColorStop(0.8, pal.sky[3]); g.addColorStop(1, pal.sky[3]);
    sx.fillStyle = g; sx.fillRect(0, 0, w, h);
    if (pal.stars) {
      var count = Math.round((w * h) / 4200);
      for (var s = 0; s < count; s++) {
        var stx = R() * w, sty = R() * h * 0.5, sr = R() * 1.1 + 0.25;
        sx.fillStyle = 'rgba(255,255,255,' + ((0.25 + R() * 0.6) * (1 - sty / (h * 0.5))).toFixed(3) + ')';
        sx.beginPath(); sx.arc(stx, sty, sr * (h / 700 + 0.5), 0, Math.PI * 2); sx.fill();
      }
    }
    var cx = pal.sunPos[0] * w, cy = pal.sunPos[1] * h;
    var rg = sx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
    rg.addColorStop(0, rgba(pal.sun, 0.75)); rg.addColorStop(0.12, rgba(pal.sun, 0.35));
    rg.addColorStop(0.45, rgba(pal.sun, 0.08)); rg.addColorStop(1, rgba(pal.sun, 0));
    sx.fillStyle = rg; sx.fillRect(0, 0, w, h);
    var sunR = h * 0.05;
    rg = sx.createRadialGradient(cx, cy, 0, cx, cy, sunR);
    rg.addColorStop(0, rgba(pal.sun, 1)); rg.addColorStop(0.7, rgba(pal.sun, 0.95)); rg.addColorStop(1, rgba(pal.sun, 0));
    sx.fillStyle = rg; sx.beginPath(); sx.arc(cx, cy, sunR, 0, Math.PI * 2); sx.fill();

    var layers = [], fogs = [], N = 5, k = w / 1100;
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      var depth = animated ? (4 + t * t * 34) * k : 0;
      var pad = Math.ceil(depth) + 4;
      var W = w + pad * 2;
      var c = mk(W, h), x = c.getContext('2d');
      var nz = noise1(seed * 13 + i * 101), nz2 = noise1(seed * 17 + i * 37);
      var baseY = h * (0.52 + t * 0.3);
      var amp = h * (0.17 + t * 0.07);
      var unit = h * (0.85 - t * 0.35);
      var off = R() * 200;
      var mesa = pal.mesa !== false && i === 1;
      var step = 3, ys = [], minY = h;
      for (var px = 0; px <= W + step; px += step) {
        var nx = px / unit + off;
        var n = fbm(nz, nx, 4), y;
        if (mesa) {
          var p = ss(0.5, 0.57, n);
          y = baseY - (p * 0.95 + (fbm(nz2, nx * 3.5, 3) - 0.5) * 0.18 + n * 0.2) * amp * 1.5;
        } else {
          y = baseY - (n - 0.28) * amp * 1.7;
        }
        ys.push(y); if (y < minY) minY = y;
      }
      var col = mixHex(pal.far, pal.near, Math.pow(t, 0.85));
      var lg = x.createLinearGradient(0, minY, 0, baseY + h * 0.18);
      lg.addColorStop(0, mixHex(col, pal.sun, 0.1 * (1 - t)));
      lg.addColorStop(0.45, col);
      lg.addColorStop(1, mixHex(col, pal.fog, 0.55 * (1 - t) + 0.05));
      x.fillStyle = lg;
      x.beginPath(); x.moveTo(0, h);
      for (var q = 0; q < ys.length; q++) x.lineTo(q * step, ys[q]);
      x.lineTo(W, h); x.closePath(); x.fill();
      x.globalCompositeOperation = 'source-atop';
      var sg = x.createRadialGradient(cx + pad, cy, 0, cx + pad, cy, w * 0.7);
      sg.addColorStop(0, rgba(pal.sun, 0.28 * (1 - t) + 0.06));
      sg.addColorStop(1, rgba(pal.sun, 0));
      x.fillStyle = sg; x.fillRect(0, 0, W, h);
      x.globalCompositeOperation = 'source-over';
      x.strokeStyle = rgba(pal.sun, 0.22 * (1 - t) + 0.06);
      x.lineWidth = Math.max(1, h / 500);
      x.beginPath();
      for (var q2 = 0; q2 < ys.length; q2++) { if (q2) x.lineTo(q2 * step, ys[q2]); else x.moveTo(0, ys[0]); }
      x.stroke();
      if (i >= 3) {
        var sc = (h / 560) * (i === 4 ? 1.35 : 0.8);
        var leaf = i === 4 ? pal.leaf : mixHex(pal.leaf, pal.fog, 0.35);
        var dark = i === 4 ? pal.leafDark : mixHex(pal.leafDark, col, 0.4);
        var clusters = Math.round(W / ((i === 4 ? 46 : 30) * Math.max(0.5, h / 560)));
        for (var cl = 0; cl < clusters; cl++) {
          var fx = R() * W, fy = ys[Math.min(ys.length - 1, Math.round(fx / step))];
          var m = 3 + Math.floor(R() * 5);
          for (var j = 0; j < m; j++) {
            var bx = fx + (R() - 0.5) * 26 * sc, by = fy + (R() * 16 - 3) * sc, br = (5 + R() * 11) * sc;
            var bg = x.createRadialGradient(bx - br * 0.3, by - br * 0.45, br * 0.1, bx, by, br);
            bg.addColorStop(0, leaf); bg.addColorStop(1, dark);
            x.fillStyle = bg; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
          }
        }
      }
      layers.push({ c: c, depth: depth, pad: pad });
      if (i < N - 2) fogs[i] = buildFog(w, h, baseY, pal, t, R);
    }
    return { w: w, h: h, sky: sky, layers: layers, fogs: fogs };
  }

  function drawScene(ctx, S, px, py, time, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(S.sky, 0, 0);
    for (var i = 0; i < S.layers.length; i++) {
      var L = S.layers[i];
      ctx.drawImage(L.c, -L.pad + px * L.depth, Math.max(0, (py + 1) * 0.5 * L.depth * 0.25));
      var F = S.fogs[i];
      if (F) {
        var o = (((time * F.speed * S.w) % S.w) + S.w) % S.w;
        ctx.drawImage(F.c, -o, F.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  var statics = Array.prototype.slice.call(document.querySelectorAll('canvas[data-scene]'));
  function renderStatic(cv) {
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (!w || !h || (cv.width === w && cv.height === h && cv._done)) return;
    cv.width = w; cv.height = h;
    var seed = +cv.getAttribute('data-seed') || 1;
    var S = buildScene(w, h, PALS[cv.getAttribute('data-scene')], seed, false);
    var c = cv.getContext('2d');
    c._grain = null;
    drawScene(c, S, 0, 0, seed * 4.7, 1);
    grainOver(c, w, h);
    cv._done = true;
  }

  /* =====================================================================
     3. Beat engine (Musicverse) — shared by the hero and the spark card
     ===================================================================== */
  var BPM = 124, SPB = 60 / BPM;
  var actx = null, master = null, noiseBuf = null, playing = false, schedT = 0, stepIdx = 0, timerId = null, audioStart = 0;
  var sparkNoise = noise1(99);

  function beatClock() { return (playing && actx) ? actx.currentTime - audioStart : performance.now() / 1000; }
  function beatPhase() { var t = beatClock(); return (((t % SPB) + SPB) % SPB) / SPB; }
  function beatEnvelope() {
    if (playing) return Math.exp(-beatPhase() * 5.5);
    var t = performance.now() / 1000;
    return 0.1 + 0.06 * Math.sin(t * 1.3);
  }
  function ensureAudio() {
    if (actx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { actx = new AC(); } catch (e) { return false; }
    master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function env(g, t, peak, dec) { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec); }
  function kick(t) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.95, 0.38); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.42);
  }
  function hat(t, v) {
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7500;
    env(g, t, v, 0.05); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.08);
  }
  function clap(t) {
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    env(g, t, 0.45, 0.18); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.22);
  }
  function bass(t, freq) {
    var o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 420;
    env(g, t, 0.32, 0.2); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.24);
  }
  var BASS = [55, 55, 65.41, 49];
  function scheduler() {
    while (schedT < actx.currentTime + 0.12) {
      var s16 = stepIdx % 16, bar = Math.floor(stepIdx / 16) % 4;
      if (s16 % 4 === 0) kick(schedT);
      hat(schedT, s16 % 4 === 2 ? 0.14 : 0.04);
      if (s16 === 4 || s16 === 12) clap(schedT);
      if (s16 % 4 === 2) bass(schedT, BASS[bar]);
      schedT += SPB / 4; stepIdx++;
    }
  }

  /* =====================================================================
     4. Hero — Three.js world (with 2D fallback)
     ===================================================================== */
  var heroWin = document.getElementById('heroWindow');
  var heroCanvas = document.getElementById('heroCanvas');
  var pointer = { tx: 0, ty: 0 };
  heroWin.addEventListener('pointermove', function (e) {
    var r = heroWin.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  heroWin.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; });

  var GLSL_NOISE = [
    'float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}',
    'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(hash12(i),hash12(i+vec2(1.,0.)),u.x),mix(hash12(i+vec2(0.,1.)),hash12(i+vec2(1.,1.)),u.x),u.y);}',
    'float fbm2(vec2 p){float s=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){s+=a*vnoise(p);p=m*p;a*=.5;}return s;}',
    'float ridge2(vec2 p){float s=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){float n=1.-abs(vnoise(p)*2.-1.);s+=a*n*n;p=m*p;a*=.5;}return s;}'
  ].join('\n');

  var GLSL_SIMPLEX = [
    'vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    ' const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);',
    ' vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);',
    ' vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
    ' vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
    ' i=mod289(i);',
    ' vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));',
    ' float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;',
    ' vec4 j=p-49.*floor(p*ns.z*ns.z);',
    ' vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);',
    ' vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);',
    ' vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
    ' vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));',
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    ' vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
    ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    ' p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    ' vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;',
    ' return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  var WORLD_DEFS = {
    atardecer: { skyTop: '#221a2c', horizon: '#d98a6c', sun: '#ffc98c', fog: '#8a5e5e', rockA: '#7a4d4a', rockB: '#1e1317', leaf: '#e0862f', accent: '#ffb070', accent2: '#b48cff', stars: 0.15, aurora: 0, el: 0.26, az: 0.0, sunI: 1.5 },
    neon:      { skyTop: '#06051a', horizon: '#a8356c', sun: '#ff6fb0', fog: '#3e1a4c', rockA: '#40265f', rockB: '#0a0613', leaf: '#39d6c3', accent: '#4ef2ff', accent2: '#ff4fa0', stars: 1, aurora: 0.35, el: 0.18, az: -0.05, sunI: 1.6 },
    niebla:    { skyTop: '#46514c', horizon: '#c9bea8', sun: '#fff1d6', fog: '#8f8a7c', rockA: '#6b7768', rockB: '#1a221e', leaf: '#c2a84e', accent: '#ffc68f', accent2: '#8fe3c8', stars: 0, aurora: 0, el: 0.28, az: 0.04, sunI: 1.3 },
    violeta:   { skyTop: '#240d2a', horizon: '#d8733f', sun: '#ffd98c', fog: '#7e4152', rockA: '#7a3b5b', rockB: '#1a0b19', leaf: '#f5a24a', accent: '#ff9a5e', accent2: '#d27dff', stars: 0.25, aurora: 0, el: 0.16, az: 0.06, sunI: 1.8 },
    aurora:    { skyTop: '#040f19', horizon: '#4a857f', sun: '#dffcf0', fog: '#2f5456', rockA: '#3a5e68', rockB: '#071016', leaf: '#e0a45a', accent: '#6ff7d2', accent2: '#8aa8ff', stars: 1, aurora: 1, el: 0.14, az: -0.06, sunI: 1.2 }
  };

  function initThreeHero() {
    var T = window.THREE;
    if (!T || !T.EffectComposer || !T.RenderPass || !T.ShaderPass || !T.UnrealBloomPass) return null;
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: heroCanvas, antialias: false, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    if (!renderer || !renderer.getContext()) return null;
    renderer.setClearColor(0x140d13, 1);
    renderer.toneMapping = T.NoToneMapping;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(52, 1.6, 0.1, 1600);

    var U = {
      uTime: { value: 0 }, uSpeed: { value: 3.2 }, uBeat: { value: 0.1 }, uPR: { value: 1 },
      uSunDir: { value: new T.Vector3(0.14, 0.1, -1).normalize() },
      uSunCol: { value: new T.Color() }, uSkyTop: { value: new T.Color() }, uHorizon: { value: new T.Color() },
      uFog: { value: new T.Color() }, uRockA: { value: new T.Color() }, uRockB: { value: new T.Color() },
      uLeaf: { value: new T.Color() }, uAccent: { value: new T.Color() }, uAccent2: { value: new T.Color() },
      uStars: { value: 0 }, uAurora: { value: 0 },
      uWave: { value: 0 }, uWaveOn: { value: 0 },
      uPortal: { value: new T.Vector3(0, 20, -80) }
    };

    function lin(h) { return new T.Color(h).convertSRGBToLinear(); }
    var worlds = {};
    Object.keys(WORLD_DEFS).forEach(function (k) {
      var d = WORLD_DEFS[k];
      worlds[k] = {
        skyTop: lin(d.skyTop), horizon: lin(d.horizon), sunCol: lin(d.sun).multiplyScalar(d.sunI), fog: lin(d.fog),
        rockA: lin(d.rockA), rockB: lin(d.rockB), leaf: lin(d.leaf), accent: lin(d.accent), accent2: lin(d.accent2),
        stars: d.stars, aurora: d.aurora,
        sunDir: new T.Vector3(Math.sin(d.az), d.el, -Math.cos(d.az)).normalize()
      };
    });
    var worldKey = 'atardecer';
    function applyWorld(w, k) {
      U.uSkyTop.value.lerp(w.skyTop, k); U.uHorizon.value.lerp(w.horizon, k); U.uSunCol.value.lerp(w.sunCol, k);
      U.uFog.value.lerp(w.fog, k); U.uRockA.value.lerp(w.rockA, k); U.uRockB.value.lerp(w.rockB, k);
      U.uLeaf.value.lerp(w.leaf, k); U.uAccent.value.lerp(w.accent, k); U.uAccent2.value.lerp(w.accent2, k);
      U.uStars.value += (w.stars - U.uStars.value) * k; U.uAurora.value += (w.aurora - U.uAurora.value) * k;
      U.uSunDir.value.lerp(w.sunDir, k).normalize();
    }
    applyWorld(worlds[worldKey], 1);

    /* ---- Sky ---- */
    var SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }';
    var SKY_FS = [
      'uniform vec3 uSunDir,uSunCol,uSkyTop,uHorizon,uFog,uAccent,uAccent2; uniform float uTime,uStars,uAurora;',
      'varying vec3 vDir;',
      GLSL_NOISE,
      'float hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}',
      'void main(){',
      ' vec3 d = normalize(vDir); float h = d.y;',
      ' vec3 col = mix(uHorizon, uSkyTop, pow(smoothstep(-0.02, 0.55, h), 0.6));',
      ' float sd = max(dot(d, uSunDir), 0.0);',
      ' col += uSunCol * (pow(sd, 8.0)*0.1 + pow(sd, 60.0)*0.28 + pow(sd, 500.0)*0.7);',
      ' col += uSunCol * smoothstep(0.99935, 0.99968, sd) * 3.0;',
      ' col = mix(col, uFog + uSunCol*pow(sd,4.0)*0.2, (1.0 - smoothstep(-0.05, 0.07, h))*0.85);',
      ' if (h > 0.0) {',
      '  vec2 uv = d.xz / (h + 0.1);',
      '  float c = fbm2(uv*1.15 + vec2(uTime*0.01, uTime*0.004));',
      '  float c2 = fbm2(uv*3.0 - vec2(uTime*0.02, 0.0));',
      '  float dens = smoothstep(0.5, 0.82, c*0.8 + c2*0.3) * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.22, 0.55, h));',
      '  vec3 lit = mix(uFog*0.75, uSunCol*1.1, pow(sd, 2.5)*0.9 + 0.1);',
      '  col = mix(col, lit, dens*0.62) + uSunCol*pow(sd, 8.0)*(1.0-dens)*dens*1.4;',
      ' }',
      ' vec3 sp = d*220.0; vec3 id = floor(sp); vec3 f = fract(sp) - 0.5; float r = hash13(id);',
      ' float star = step(0.9982, r) * smoothstep(0.35, 0.0, length(f)) * (0.6 + 0.4*sin(uTime*2.0 + r*80.0));',
      ' col += vec3(star) * uStars * smoothstep(0.06, 0.35, h) * 1.8;',
      ' if (uAurora > 0.001 && h > 0.0) {',
      '  vec2 au = d.xz / (h + 0.25);',
      '  float wv = au.x*1.4 + fbm2(au*0.6 + vec2(0.0, uTime*0.05))*5.0;',
      '  float curtain = pow(0.5 + 0.5*sin(wv), 6.0);',
      '  float vert = smoothstep(0.08, 0.25, h) * (1.0 - smoothstep(0.35, 0.75, h));',
      '  float shimmer = 0.6 + 0.4*vnoise(vec2(au.x*8.0, uTime*0.6));',
      '  col += mix(uAccent, uAccent2, smoothstep(0.2, 0.6, h)) * curtain * vert * shimmer * uAurora * 1.3;',
      ' }',
      ' gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    var sky = new T.Mesh(new T.SphereGeometry(900, 48, 24), new T.ShaderMaterial({ uniforms: U, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: T.BackSide, depthWrite: false }));
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);

    /* ---- Terrain ---- */
    var TERRAIN_VS = [
      'uniform float uTime, uSpeed;',
      'varying vec3 vW; varying vec3 vN; varying float vH; varying vec2 vP;',
      GLSL_NOISE,
      'float H(vec2 xz){',
      ' vec2 p = vec2(xz.x, xz.y - uTime*uSpeed);',
      ' float ax = abs(xz.x);',
      ' float n1 = fbm2(p*0.011 + 7.3);',
      ' float mask = smoothstep(5.0 + n1*10.0, 36.0 + n1*26.0, ax);',
      ' float h = fbm2(p*0.017)*62.0 + ridge2(p*0.034)*30.0 - 20.0;',
      ' h = max(h, 0.0) * mask;',
      ' float s = 7.5; float k = h/s; float fl = floor(k); float fr = k - fl;',
      ' h = mix(h, (fl + smoothstep(0.6, 0.94, fr))*s, 0.7);',
      ' h += vnoise(p*0.09)*1.4 + vnoise(p*0.35)*0.3;',
      ' return h;',
      '}',
      'void main(){',
      ' vec4 w = modelMatrix * vec4(position, 1.0);',
      ' float e = 1.1;',
      ' float h = H(w.xz); float hx = H(w.xz + vec2(e, 0.0)); float hz = H(w.xz + vec2(0.0, e));',
      ' vN = normalize(vec3(h - hx, e, h - hz));',
      ' w.y = h; vW = w.xyz; vH = h; vP = vec2(w.x, w.z - uTime*uSpeed);',
      ' gl_Position = projectionMatrix * viewMatrix * w;',
      '}'
    ].join('\n');
    var TERRAIN_FS = [
      'uniform vec3 uSunDir,uSunCol,uSkyTop,uHorizon,uFog,uRockA,uRockB,uLeaf,uAccent,uAccent2,uPortal;',
      'uniform float uWave,uWaveOn,uBeat,uTime;',
      'varying vec3 vW; varying vec3 vN; varying float vH; varying vec2 vP;',
      GLSL_NOISE,
      'void main(){',
      ' vec3 n = normalize(vN); float slope = 1.0 - n.y;',
      ' float tex = fbm2(vP*0.06);',
      ' float strata = 0.5 + 0.5*sin(vH*1.35 + tex*5.0);',
      ' vec3 rock = mix(uRockB, uRockA, 0.25 + strata*0.55 + tex*0.2);',
      ' float shrub = smoothstep(0.58, 0.74, fbm2(vP*0.16 + 11.0)) * (1.0 - smoothstep(0.12, 0.32, slope));',
      ' vec3 flatc = mix(uRockA*0.75, uRockB*1.4, tex);',
      ' vec3 alb = mix(flatc, rock, smoothstep(0.14, 0.4, slope));',
      ' alb = mix(alb, uLeaf*0.85, shrub*0.85);',
      ' vec3 V = normalize(cameraPosition - vW);',
      ' float dif = max(dot(n, uSunDir), 0.0);',
      ' vec3 amb = mix(uFog*0.5, uSkyTop*0.9 + uHorizon*0.2, 0.5 + 0.5*n.y) * 0.55;',
      ' float back = max(dot(-V, uSunDir), 0.0);',
      ' float rim = pow(1.0 - max(dot(n, V), 0.0), 4.0) * back*back;',
      ' vec3 col = alb * (uSunCol*dif*1.25 + amb);',
      ' col += uSunCol * rim * 0.9 * (0.3 + shrub);',
      ' col += uLeaf * shrub * back*back*back * 0.35;',
      ' vec3 Lp = uPortal - vW; float dl = length(Lp); Lp /= dl;',
      ' vec3 pc = mix(uAccent, uAccent2, 0.35);',
      ' col += alb * pc * max(dot(n, Lp), 0.0) * (260.0 / (dl*dl*0.35 + 60.0)) * (0.7 + uBeat*1.4);',
      ' float lv = vH/5.0; float fw = fwidth(lv);',
      ' float iso = 1.0 - smoothstep(0.0, fw*1.5, min(fract(lv), 1.0 - fract(lv)));',
      ' iso *= smoothstep(1.0, 3.0, vH);',
      ' float dist = length(vW - cameraPosition);',
      ' col += uAccent * iso * 0.22 * exp(-dist*0.009);',
      ' float dP = length(vW.xz - uPortal.xz);',
      ' float wv = exp(-pow((dP - uWave)/2.4, 2.0)) * uWaveOn * (1.0 - smoothstep(70.0, 200.0, uWave));',
      ' col += uAccent * wv * (0.9 + iso*6.0) * 1.6;',
      ' float fogAmt = 1.0 - exp(-dist*0.0036);',
      ' float mist = exp(-max(vH, 0.0)*0.25) * 0.35 * smoothstep(30.0, 160.0, dist);',
      ' float sa = pow(back, 6.0);',
      ' vec3 fogC = mix(uFog, uSunCol*0.6, sa*0.15);',
      ' col = mix(col, fogC, clamp(fogAmt + mist*(1.0 - fogAmt), 0.0, 1.0));',
      ' gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    var tg = new T.PlaneGeometry(760, 600, 340, 400);
    tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -250);
    var terrainMat = new T.ShaderMaterial({ uniforms: U, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS });
    terrainMat.extensions.derivatives = true;
    var terrain = new T.Mesh(tg, terrainMat);
    terrain.frustumCulled = false;
    scene.add(terrain);

    /* ---- Portal: halo, vortex, rings, orb ---- */
    var portal = new T.Group();
    portal.position.copy(U.uPortal.value);
    portal.scale.setScalar(1.5);
    scene.add(portal);

    var BASIC_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }';

    var halo = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({
      uniforms: U, vertexShader: BASIC_VS, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      fragmentShader: 'uniform vec3 uAccent,uAccent2; uniform float uBeat; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; float g = pow(max(1.0-r,0.0), 2.6); gl_FragColor = vec4(mix(uAccent,uAccent2,0.4)*g*(0.12+uBeat*0.3), 1.0); }'
    }));
    halo.scale.set(80, 80, 1); halo.position.z = -3;
    portal.add(halo);

    var disc = new T.Mesh(new T.CircleGeometry(9.5, 128), new T.ShaderMaterial({
      uniforms: U, vertexShader: BASIC_VS, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      fragmentShader: [
        'uniform vec3 uAccent,uAccent2,uSunCol; uniform float uTime,uBeat; varying vec2 vUv;',
        GLSL_NOISE,
        'void main(){',
        ' vec2 p = vUv*2.0 - 1.0; float r = length(p); if (r > 1.0) discard;',
        ' float ang = atan(p.y, p.x);',
        ' float sw = ang + r*5.0 - uTime*0.8;',
        ' float n = fbm2(vec2(cos(sw), sin(sw))*1.6*r + vec2(r*3.0 - uTime*0.4, uTime*0.1));',
        ' float rings = 0.5 + 0.5*sin(r*32.0 - uTime*4.0 + n*6.0);',
        ' vec3 col = mix(uAccent2, uAccent, n) * (0.35 + rings*0.65) * (1.25 - r) * (1.1 + uBeat*1.4);',
        ' col += uSunCol * pow(1.0 - r, 6.0) * 1.6;',
        ' gl_FragColor = vec4(col * smoothstep(1.0, 0.86, r), 1.0);',
        '}'
      ].join('\n')
    }));
    disc.position.z = -0.6;
    portal.add(disc);

    var ring = new T.Mesh(new T.TorusGeometry(10, 0.32, 24, 256), new T.ShaderMaterial({
      uniforms: U, vertexShader: BASIC_VS,
      fragmentShader: [
        'uniform vec3 uAccent,uAccent2; uniform float uTime,uBeat; varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        ' float a = vUv.x;',
        ' float flow = 0.5 + 0.5*sin(a*6.2831*14.0 - uTime*3.0);',
        ' float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);',
        ' vec3 c = mix(uAccent, uAccent2, 0.5 + 0.5*sin(a*6.2831*2.0 + uTime*0.6));',
        ' gl_FragColor = vec4(c * (1.1 + flow*1.6 + fres*2.2) * (1.0 + uBeat*1.6), 1.0);',
        '}'
      ].join('\n')
    }));
    portal.add(ring);

    var ring2 = new T.Mesh(new T.TorusGeometry(11.6, 0.07, 8, 320), new T.ShaderMaterial({
      uniforms: U, vertexShader: BASIC_VS, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      fragmentShader: 'uniform vec3 uAccent,uAccent2; uniform float uBeat; varying vec2 vUv; void main(){ float dash = step(0.45, fract(vUv.x*72.0)); gl_FragColor = vec4(mix(uAccent2,uAccent,0.3)*dash*(1.6+uBeat*2.0), 1.0); }'
    }));
    portal.add(ring2);

    var ORB_VS = [
      'uniform float uTime, uBeat;',
      'varying vec3 vW; varying vec3 vN; varying float vD;',
      GLSL_SIMPLEX,
      'float disp(vec3 q){ return (snoise(q*1.5 + vec3(0.0, uTime*0.22, 0.0)) + 0.35*snoise(q*3.6 - uTime*0.3)) * (0.1 + uBeat*0.17); }',
      'void main(){',
      ' vec3 p = normalize(position);',
      ' vec3 t = normalize(abs(p.y) < 0.99 ? cross(p, vec3(0.0,1.0,0.0)) : cross(p, vec3(1.0,0.0,0.0)));',
      ' vec3 b = cross(p, t);',
      ' float e = 0.015;',
      ' vec3 p1 = normalize(p + t*e); vec3 p2 = normalize(p + b*e);',
      ' float d0 = disp(p);',
      ' vec3 q0 = p*(1.0 + d0); vec3 q1 = p1*(1.0 + disp(p1)); vec3 q2 = p2*(1.0 + disp(p2));',
      ' vec3 nrm = normalize(cross(q1 - q0, q2 - q0)); if (dot(nrm, p) < 0.0) nrm = -nrm;',
      ' vD = d0;',
      ' vec4 w = modelMatrix * vec4(q0, 1.0); vW = w.xyz;',
      ' vN = normalize(mat3(modelMatrix) * nrm);',
      ' gl_Position = projectionMatrix * viewMatrix * w;',
      '}'
    ].join('\n');
    var ORB_FS = [
      'uniform vec3 uSkyTop,uHorizon,uSunCol,uSunDir,uAccent,uAccent2; uniform float uTime,uBeat;',
      'varying vec3 vW; varying vec3 vN; varying float vD;',
      'vec3 skyA(vec3 d){ vec3 c = mix(uHorizon, uSkyTop, smoothstep(-0.1, 0.6, d.y)); c += uSunCol*pow(max(dot(d, uSunDir), 0.0), 12.0)*2.0; return c; }',
      'void main(){',
      ' vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);',
      ' float ndv = max(dot(N, V), 0.0); float fres = pow(1.0 - ndv, 3.0);',
      ' vec3 R = reflect(-V, N); vec3 refl = skyA(R);',
      ' float th = ndv*2.2 + vD*4.0 + uTime*0.15;',
      ' vec3 rainbow = 0.5 + 0.5*cos(6.2831*(th + vec3(0.0, 0.33, 0.67)));',
      ' vec3 irid = mix(mix(uAccent, uAccent2, 0.5 + 0.5*sin(th*6.2831)), rainbow, 0.35);',
      ' vec3 col = uAccent2*0.05 + refl*mix(0.18, 1.0, fres)*0.9 + irid*(0.25 + fres*1.6);',
      ' col += mix(uAccent, uAccent2, fres) * fres * (1.2 + uBeat*3.0);',
      ' col += uSunCol * pow(max(dot(R, uSunDir), 0.0), 90.0) * 5.0;',
      ' gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    var orb = new T.Mesh(new T.IcosahedronGeometry(1, 40), new T.ShaderMaterial({ uniforms: U, vertexShader: ORB_VS, fragmentShader: ORB_FS }));
    orb.scale.setScalar(3.5);
    portal.add(orb);

    /* ---- Particles spiralling into the portal ---- */
    var PCOUNT = 3600;
    var pg = new T.BufferGeometry();
    var pRnd = new Float32Array(PCOUNT * 4), pPos = new Float32Array(PCOUNT * 3);
    var PR = rng(77);
    for (var i = 0; i < PCOUNT * 4; i++) pRnd[i] = PR();
    pg.setAttribute('position', new T.BufferAttribute(pPos, 3));
    pg.setAttribute('aRnd', new T.BufferAttribute(pRnd, 4));
    var particles = new T.Points(pg, new T.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: [
        'attribute vec4 aRnd; uniform float uTime, uPR, uBeat; uniform vec3 uPortal;',
        'varying float vA; varying float vMix;',
        'void main(){',
        ' float life = fract(uTime*(0.025 + aRnd.x*0.045) + aRnd.y);',
        ' float r = mix(75.0*(0.35 + aRnd.z), 0.8, pow(life, 1.35));',
        ' float ang = aRnd.w*6.2831 + life*6.2831*(1.4 + aRnd.x*2.0);',
        ' vec3 p = uPortal + vec3(cos(ang)*r, sin(ang)*r*0.5 + (aRnd.z - 0.5)*8.0*(1.0 - life), (aRnd.x - 0.5)*36.0*(1.0 - life) + 12.0*(1.0 - life));',
        ' vec4 mv = viewMatrix * vec4(p, 1.0);',
        ' gl_PointSize = min((1.2 + aRnd.z*2.6) * uPR * (130.0 / -mv.z) * (1.0 + uBeat*0.7), 28.0*uPR);',
        ' gl_Position = projectionMatrix * mv;',
        ' vA = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.86, 1.0, life)) * (0.5 + life);',
        ' vMix = aRnd.z;',
        '}'
      ].join('\n'),
      fragmentShader: 'uniform vec3 uAccent, uSunCol; varying float vA; varying float vMix; void main(){ float d = length(gl_PointCoord - 0.5); float s = smoothstep(0.5, 0.0, d); s *= s; gl_FragColor = vec4(mix(uAccent, uSunCol*0.8, vMix) * s * vA * 1.8, 1.0); }'
    }));
    particles.frustumCulled = false;
    scene.add(particles);

    /* ---- Floating rock shards ---- */
    var shardMat = new T.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: [
        'uniform vec3 uSunDir,uSunCol,uSkyTop,uFog,uRockA,uAccent,uAccent2,uPortal; uniform float uBeat,uTime;',
        'varying vec3 vW;',
        'void main(){',
        ' vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); vec3 V = normalize(cameraPosition - vW); if (dot(n, V) < 0.0) n = -n;',
        ' vec3 alb = uRockA*0.8;',
        ' vec3 col = alb*(uSunCol*max(dot(n, uSunDir), 0.0)*1.1 + uSkyTop*0.4 + uFog*0.15);',
        ' vec3 Lp = uPortal - vW; float dl = length(Lp); Lp /= dl;',
        ' col += alb*mix(uAccent, uAccent2, 0.35)*max(dot(n, Lp), 0.0)*(300.0/(dl*dl*0.3 + 40.0))*(0.7 + uBeat*1.4);',
        ' col += mix(uAccent, uSunCol, 0.5)*pow(1.0 - max(dot(n, V), 0.0), 3.0)*0.6;',
        ' float vein = smoothstep(0.965, 1.0, 0.5 + 0.5*sin(vW.y*3.0 + vW.x*2.0 + uTime*0.6));',
        ' col += uAccent*vein*1.4;',
        ' col = mix(col, uFog, 1.0 - exp(-length(vW - cameraPosition)*0.004));',
        ' gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    shardMat.extensions.derivatives = true;
    var shards = [];
    var SR = rng(5);
    for (var s = 0; s < 8; s++) {
      var mesh = new T.Mesh(new T.DodecahedronGeometry(1, 0), shardMat);
      var sc = 1.2 + SR() * 2.6;
      mesh.scale.set(sc * (0.7 + SR() * 0.6), sc * (1.1 + SR() * 1.2), sc * (0.7 + SR() * 0.6));
      shards.push({ m: mesh, a: SR() * Math.PI * 2, r: 17 + SR() * 16, y: 6 + SR() * 24, sp: (SR() > 0.5 ? 1 : -1) * (0.03 + SR() * 0.05), ph: SR() * 10, rx: SR() * 0.4, ry: SR() * 0.4 });
      scene.add(mesh);
    }

    /* ---- Post-processing ---- */
    var canHalf = renderer.capabilities.isWebGL2 || renderer.extensions.has('EXT_color_buffer_half_float');
    var rt = new T.WebGLRenderTarget(2, 2, { type: canHalf ? T.HalfFloatType : T.UnsignedByteType, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    var composer = new T.EffectComposer(renderer, rt);
    composer.addPass(new T.RenderPass(scene, camera));
    var bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.68, 0.5, 1.4);
    composer.addPass(bloom);
    var finalPass = new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uRes: { value: new T.Vector2(1, 1) }, uTime: { value: 0 }, uSunScr: { value: new T.Vector2(0.5, 0.6) }, uSunVis: { value: 0 }, uExposure: { value: 0.85 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime; uniform vec2 uSunScr; uniform float uSunVis; uniform float uExposure;',
        'varying vec2 vUv;',
        'vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }',
        'float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }',
        'void main(){',
        ' vec2 uv = vUv; vec2 cc = uv - 0.5;',
        ' float ca = 0.016*dot(cc, cc);',
        ' vec3 col = vec3(texture2D(tDiffuse, uv + cc*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - cc*ca).b);',
        ' if (uSunVis > 0.001) {',
        '  vec2 delta = (uSunScr - uv) / 24.0; vec2 p = uv; float decay = 1.0; vec3 acc = vec3(0.0);',
        '  for (int i = 0; i < 24; i++) { p += delta; vec3 s = texture2D(tDiffuse, p).rgb; acc += s*max(lum(s) - 2.0, 0.0)*decay; decay *= 0.94; }',
        '  col += acc*0.014*uSunVis;',
        ' }',
        ' col = aces(col*uExposure);',
        ' col = pow(col, vec3(1.0/2.2));',
        ' float vig = smoothstep(1.05, 0.3, length(cc*vec2(1.0, 0.85)));',
        ' col *= mix(0.68, 1.0, vig);',
        ' float gr = fract(sin(dot(uv*uRes + fract(uTime)*311.0, vec2(12.9898, 78.233)))*43758.5453);',
        ' col += (gr - 0.5)*0.03;',
        ' gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    composer.addPass(finalPass);
    var FU = finalPass.uniforms;

    /* ---- Sizing with adaptive resolution ---- */
    var pr = Math.min(1.5, window.devicePixelRatio || 1);
    var W = 0, Hh = 0;
    function resize() {
      var r = heroWin.getBoundingClientRect();
      W = Math.max(2, Math.round(r.width)); Hh = Math.max(2, Math.round(r.height));
      renderer.setPixelRatio(pr);
      renderer.setSize(W, Hh, false);
      composer.setPixelRatio(pr);
      composer.setSize(W, Hh);
      FU.uRes.value.set(W * pr, Hh * pr);
      U.uPR.value = pr;
      camera.aspect = W / Hh;
      camera.fov = camera.aspect < 1 ? 66 : camera.aspect < 1.4 ? 58 : 52;
      camera.updateProjectionMatrix();
    }

    /* ---- Frame ---- */
    var t0 = performance.now(), waveStart = -100, lastBar = -1;
    var cam = { x: 0, y: 0 }, sunTmp = new T.Vector3();
    var perfAcc = 0, perfN = 0;
    function frame(now, dt) {
      var t = (now - t0) / 1000;
      U.uTime.value = t; FU.uTime.value = t;
      applyWorld(worlds[worldKey], 1 - Math.exp(-dt * 2.4));
      var e = beatEnvelope();
      U.uBeat.value += (e - U.uBeat.value) * Math.min(1, dt * 18);

      if (playing) {
        var bar = Math.floor(beatClock() / (SPB * 4));
        if (bar !== lastBar) { lastBar = bar; waveStart = t; }
      } else if (t - waveStart > 7) { waveStart = t; }
      U.uWave.value = (t - waveStart) * 42; U.uWaveOn.value = 1;

      cam.x += (pointer.tx - cam.x) * 0.035; cam.y += (pointer.ty - cam.y) * 0.035;
      var r = heroWin.getBoundingClientRect();
      var dive = clamp01(-r.top / Math.max(1, r.height));
      var lookX = camera.aspect > 1.25 ? -40 : -4;
      camera.position.set(cam.x * 7 + Math.sin(t * 0.13) * 2.2, 12.5 - cam.y * 3 + Math.sin(t * 0.21) * 0.8, 40 - dive * 18);
      camera.lookAt(lookX - cam.x * 3, 18 + cam.y * 1.5, -80);
      sky.position.copy(camera.position);

      ring.rotation.z = t * 0.05; ring2.rotation.z = -t * 0.12;
      orb.rotation.y = t * 0.2; orb.rotation.x = Math.sin(t * 0.3) * 0.2;
      var pulse = 1 + U.uBeat.value * 0.05;
      ring.scale.setScalar(pulse);
      for (var k = 0; k < shards.length; k++) {
        var S = shards[k], a = S.a + t * S.sp;
        S.m.position.set(U.uPortal.value.x + Math.cos(a) * S.r, S.y + Math.sin(t * 0.5 + S.ph) * 1.6, U.uPortal.value.z + Math.sin(a) * S.r * 0.55 + 6);
        S.m.rotation.set(t * S.rx, t * S.ry, 0);
      }

      sunTmp.copy(U.uSunDir.value).multiplyScalar(600).add(camera.position).project(camera);
      FU.uSunScr.value.set(sunTmp.x * 0.5 + 0.5, sunTmp.y * 0.5 + 0.5);
      var edge = Math.max(Math.abs(sunTmp.x), Math.abs(sunTmp.y));
      FU.uSunVis.value = sunTmp.z < 1 ? clamp01((1.6 - edge) / 0.6) : 0;

      composer.render();

      perfAcc += dt; perfN++;
      if (perfN >= 90) {
        var avg = perfAcc / perfN;
        if (avg > 0.028 && pr > 0.75) { pr = Math.max(0.75, pr - 0.25); resize(); }
        perfAcc = 0; perfN = 0;
      }
    }

    resize();
    return {
      resize: resize,
      frame: frame,
      setWorld: function (key) { worldKey = key; if (RM) { applyWorld(worlds[key], 1); frame(t0 + 8000, 0.016); } },
      renderOnce: function () { frame(t0 + 8000, 0.016); }
    };
  }

  function init2DHero() {
    var hctx = heroCanvas.getContext('2d');
    if (!hctx) return null;
    var hero = { S: null, prev: null, fade: 1, px: 0, py: 0, pal: 'atardecer', w: 0, h: 0 };
    function seedFor(key) { return 11 + PAL_KEYS.indexOf(key) * 5; }
    function render(time) {
      if (!hero.S) return;
      var idle = RM ? 0 : Math.sin(time * 0.18) * 0.3;
      var px = Math.max(-1, Math.min(1, hero.px + idle));
      if (hero.prev) { drawScene(hctx, hero.prev, px, hero.py, time, 1); drawScene(hctx, hero.S, px, hero.py, time, hero.fade); }
      else drawScene(hctx, hero.S, px, hero.py, time, 1);
      grainOver(hctx, hero.w, hero.h);
    }
    function resize() {
      var r = heroWin.getBoundingClientRect();
      var dpr = Math.min(1.5, window.devicePixelRatio || 1);
      var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (!w || !h || (w === hero.w && h === hero.h && hero.S)) return;
      hero.w = w; hero.h = h; heroCanvas.width = w; heroCanvas.height = h; hctx._grain = null;
      hero.S = buildScene(w, h, PALS[hero.pal], seedFor(hero.pal), !RM); hero.prev = null; hero.fade = 1;
      render(performance.now() / 1000);
    }
    resize();
    return {
      resize: resize,
      frame: function (now, dt) {
        hero.px += (-pointer.tx - hero.px) * 0.04; hero.py += (pointer.ty - hero.py) * 0.04;
        if (hero.prev) { hero.fade = Math.min(1, hero.fade + dt * 1.4); if (hero.fade >= 1) hero.prev = null; }
        render(now / 1000);
      },
      setWorld: function (key) {
        if (key === hero.pal || !hero.w) return;
        hero.pal = key;
        var next = buildScene(hero.w, hero.h, PALS[key], seedFor(key), !RM);
        if (RM) { hero.S = next; hero.prev = null; render(0); return; }
        hero.prev = hero.S; hero.S = next; hero.fade = 0;
      },
      renderOnce: function () { render(0); }
    };
  }

  var heroImpl = null;
  try { heroImpl = initThreeHero(); } catch (err) { heroImpl = null; if (window.console) console.warn('Hero WebGL no disponible:', err); }
  if (!heroImpl) heroImpl = init2DHero();

  var worldBtns = Array.prototype.slice.call(document.querySelectorAll('.world-btn'));
  worldBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-world');
      worldBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.getElementById('worldName').textContent = PALS[key].name;
      if (heroImpl) heroImpl.setWorld(key);
    });
  });

  /* =====================================================================
     5. Avatar studio — holographic point cloud built from an SDF head
     ===================================================================== */
  function sstep(a, b, v) { var t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
    var x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
    var k0 = Math.sqrt(x * x + y * y + z * z);
    var k1 = Math.sqrt(x * x / (rx * rx) + y * y / (ry * ry) + z * z / (rz * rz));
    return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
  }
  function sdCap(px, py, pz, ax, ay, az, bx, by, bz, r) {
    var pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
    var h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    var dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  }
  function sdSph(px, py, pz, cx, cy, cz, r) { var dx = px - cx, dy = py - cy, dz = pz - cz; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; }
  function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }
  function headSDF(x, y, z) {
    var ax = Math.abs(x);
    var d = sdEll(x, y, z, 0, 0.2, -0.04, 0.46, 0.55, 0.55);
    d = smin(d, sdEll(x, y, z, 0, -0.1, 0.07, 0.37, 0.43, 0.44), 0.12);
    d = smin(d, sdEll(x, y, z, 0, -0.4, 0.2, 0.17, 0.13, 0.15), 0.1);
    d = smin(d, sdEll(ax, y, z, 0.23, 0.0, 0.25, 0.14, 0.1, 0.14), 0.08);
    d = smin(d, sdCap(ax, y, z, 0.0, 0.17, 0.44, 0.22, 0.16, 0.4, 0.055), 0.06);
    d = smax(d, -sdSph(ax, y, z, 0.16, 0.07, 0.5, 0.085), 0.04);
    d = smin(d, sdSph(ax, y, z, 0.16, 0.065, 0.42, 0.072), 0.02);
    d = smin(d, sdCap(x, y, z, 0, 0.08, 0.48, 0, -0.09, 0.57, 0.05), 0.05);
    d = smin(d, sdEll(x, y, z, 0, -0.1, 0.555, 0.075, 0.055, 0.06), 0.04);
    d = smin(d, sdCap(ax, y, z, 0.0, -0.2, 0.495, 0.1, -0.205, 0.465, 0.032), 0.03);
    d = smin(d, sdCap(ax, y, z, 0.0, -0.265, 0.48, 0.085, -0.26, 0.45, 0.033), 0.03);
    d = smin(d, sdEll(ax, y, z, 0.455, 0.02, 0.0, 0.055, 0.14, 0.09), 0.04);
    d = smin(d, sdCap(x, y, z, 0, -0.42, -0.06, 0, -1.02, -0.03, 0.19), 0.12);
    d = smin(d, sdEll(x, y, z, 0, -1.18, -0.03, 0.92, 0.26, 0.34), 0.2);
    d = smin(d, sdEll(x, y, z, 0, -1.45, 0.03, 0.78, 0.36, 0.38), 0.15);
    return d;
  }
  function generateHead(N, seed) {
    var a = seed >>> 0;
    function R() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), rnd = new Float32Array(N), jaw = new Float32Array(N);
    var i = 0, tries = 0, h = 0.0015;
    while (i < N && tries < N * 8) {
      tries++;
      var x, y, z;
      if (R() < 0.6) { x = (R() * 2 - 1) * 0.56; y = -0.62 + R() * 1.42; z = -0.62 + R() * 1.26; }
      else { x = (R() * 2 - 1) * 1.0; y = -1.78 + R() * 1.3; z = -0.45 + R() * 0.95; }
      var d = 0;
      for (var it = 0; it < 7; it++) {
        d = headSDF(x, y, z);
        var f1 = headSDF(x + h, y - h, z - h), f2 = headSDF(x - h, y - h, z + h), f3 = headSDF(x - h, y + h, z - h), f4 = headSDF(x + h, y + h, z + h);
        var gx = f1 - f2 - f3 + f4, gy = -f1 - f2 + f3 + f4, gz = -f1 + f2 - f3 + f4;
        var gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        x -= gx / gl * d; y -= gy / gl * d; z -= gz / gl * d;
        if (Math.abs(d) < 0.0006) break;
      }
      if (Math.abs(d) > 0.003 || y < -1.74 || y > 0.8) continue;
      if (z < -0.05 && y > -0.55 && R() < 0.3) continue;
      if (y < -0.95 && R() < 0.4) continue;
      var g1 = headSDF(x + h, y - h, z - h), g2 = headSDF(x - h, y - h, z + h), g3 = headSDF(x - h, y + h, z - h), g4 = headSDF(x + h, y + h, z + h);
      var nx = g1 - g2 - g3 + g4, ny = -g1 - g2 + g3 + g4, nz = -g1 + g2 - g3 + g4;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      nor[i * 3] = nx / nl; nor[i * 3 + 1] = ny / nl; nor[i * 3 + 2] = nz / nl;
      rnd[i] = R();
      jaw[i] = sstep(-0.215, -0.265, y) * sstep(-0.64, -0.5, y) * sstep(0.12, 0.3, z) * (1 - sstep(0.24, 0.38, Math.abs(x)));
      i++;
    }
    return { n: i, pos: pos, nor: nor, rnd: rnd, jaw: jaw };
  }
  function requestHead(N, seed, cb) {
    var src = [sstep, sdEll, sdCap, sdSph, smin, smax, headSDF, generateHead].map(function (f) { return f.toString(); }).join('\n') +
      '\nself.onmessage=function(e){var r=generateHead(e.data.n,e.data.seed);self.postMessage(r,[r.pos.buffer,r.nor.buffer,r.rnd.buffer,r.jaw.buffer]);};';
    try {
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      var wk = new Worker(url);
      var done = false;
      wk.onmessage = function (e) { done = true; cb(e.data); wk.terminate(); URL.revokeObjectURL(url); };
      wk.onerror = function () { if (!done) { done = true; wk.terminate(); cb(generateHead(Math.round(N * 0.55), seed)); } };
      wk.postMessage({ n: N, seed: seed });
    } catch (e) {
      setTimeout(function () { cb(generateHead(Math.round(N * 0.55), seed)); }, 30);
    }
  }

  var STUDIO_PHRASES = [
    'Hola, soy Dax, un avatar de Daxenworld.',
    'Puedo recibir a tus visitantes, responder preguntas y mostrar tus productos.',
    'Me entrenan con la información de tu marca y hablo en tu idioma.',
    'Me podés usar en la web, en mobile, en eventos o por pixel streaming.'
  ].map(tr);

  function initStudio() {
    var T = window.THREE;
    var view = document.getElementById('studioView');
    var canvas = document.getElementById('studioCanvas');
    if (!T) return null;
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch (e) { return null; }
    if (!renderer || !renderer.getContext()) return null;
    renderer.setClearColor(0x130d12, 1);
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, -0.4, 5.1);
    camera.lookAt(0, -0.46, 0);

    var HU = {
      uTime: { value: 0 }, uColor: { value: new T.Color('#f29a4b') }, uColor2: { value: new T.Color('#ffe2bf') },
      uSize: { value: 1 }, uPR: { value: 1 }, uJaw: { value: 0 }, uScanY: { value: 0 }, uScanOn: { value: 0 },
      uDisperse: { value: 0 }, uAlpha: { value: 1 }
    };
    var tgtC1 = HU.uColor.value.clone(), tgtC2 = HU.uColor2.value.clone();

    var bg = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
      uniforms: HU, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform vec3 uColor; uniform float uTime; varying vec2 vUv;',
        'void main(){',
        ' vec2 p = vUv - vec2(0.5, 0.56); p.x *= 1.25;',
        ' float d = length(p);',
        ' vec3 c = mix(vec3(0.24, 0.165, 0.227), vec3(0.114, 0.082, 0.11), smoothstep(0.0, 0.55, d));',
        ' c = mix(c, vec3(0.075, 0.051, 0.071), smoothstep(0.5, 0.95, d));',
        ' c += uColor * 0.07 * (1.0 - smoothstep(0.0, 0.6, d));',
        ' float grid = max(smoothstep(0.985, 1.0, fract(vUv.x*28.0)), smoothstep(0.985, 1.0, fract(vUv.y*22.0)));',
        ' c += uColor * grid * 0.025 * (1.0 - smoothstep(0.2, 0.8, d));',
        ' gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    }));
    bg.frustumCulled = false; bg.renderOrder = -100;
    scene.add(bg);

    var bust = new T.Group();
    scene.add(bust);

    var holoMat = new T.ShaderMaterial({
      uniforms: HU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: [
        'attribute vec3 aNormal; attribute float aRnd; attribute float aJaw;',
        'uniform float uTime, uSize, uPR, uJaw, uDisperse;',
        'varying float vFres; varying float vY; varying float vRnd;',
        'float h11(float n){ return fract(sin(n)*43758.5453); }',
        'void main(){',
        ' vec3 p = position;',
        ' p.y -= uJaw*aJaw*0.05; p.z -= uJaw*aJaw*0.012;',
        ' float slice = floor(p.y*22.0);',
        ' float g = step(0.992, h11(slice*7.13 + floor(uTime*7.0)));',
        ' p.x += g*(h11(slice + floor(uTime*20.0)) - 0.5)*0.12;',
        ' vec3 rd = normalize(aNormal*0.6 + vec3(h11(aRnd*91.3) - 0.5, h11(aRnd*47.1) - 0.25, h11(aRnd*13.7) - 0.5)*1.4);',
        ' p += rd*uDisperse*(0.5 + h11(aRnd*71.9)*1.5);',
        ' p += vec3(sin(uTime*0.7 + aRnd*40.0), cos(uTime*0.9 + aRnd*30.0), sin(uTime*0.5 + aRnd*20.0))*0.06*uDisperse;',
        ' vec4 mv = modelViewMatrix*vec4(p, 1.0);',
        ' vec3 n = normalize(normalMatrix*aNormal);',
        ' vFres = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 2.2);',
        ' vY = position.y; vRnd = aRnd;',
        ' gl_PointSize = uSize*uPR*(0.55 + h11(aRnd*17.0)*0.9)*(11.0 / -mv.z);',
        ' gl_Position = projectionMatrix*mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor, uColor2; uniform float uTime, uScanY, uScanOn, uAlpha;',
        'varying float vFres; varying float vY; varying float vRnd;',
        'void main(){',
        ' vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;',
        ' float soft = smoothstep(0.5, 0.05, d);',
        ' float lines = 0.55 + 0.45*sin(vY*140.0 - uTime*5.0);',
        ' float flick = 0.82 + 0.18*sin(uTime*19.0 + vRnd*60.0);',
        ' float a = (0.16 + vFres*0.95)*lines*flick;',
        ' a *= smoothstep(-1.74, -1.1, vY);',
        ' vec3 col = mix(uColor, uColor2, clamp(vFres*1.2, 0.0, 1.0));',
        ' if (uScanOn > 0.5) {',
        '  float line = exp(-pow((vY - uScanY)*30.0, 2.0));',
        '  float below = smoothstep(uScanY + 0.02, uScanY - 0.02, vY);',
        '  a = a*(0.08 + 0.92*below) + line*1.4;',
        '  col = mix(col, uColor2, line);',
        ' }',
        ' gl_FragColor = vec4(col*a*soft*uAlpha, 1.0);',
        '}'
      ].join('\n')
    });
    var points = null, total = 0;

    var base = new T.Mesh(new T.PlaneGeometry(3.4, 3.4), new T.ShaderMaterial({
      uniforms: HU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 uColor, uColor2; uniform float uTime; varying vec2 vUv;',
        'void main(){',
        ' vec2 p = vUv*2.0 - 1.0; float r = length(p); if (r > 1.0) discard;',
        ' float rings = smoothstep(0.035, 0.0, abs(fract(r*6.0 - uTime*0.25) - 0.5) - 0.465);',
        ' float edge = smoothstep(0.02, 0.0, abs(r - 0.72)) + smoothstep(0.015, 0.0, abs(r - 0.97))*0.6;',
        ' float ang = atan(p.y, p.x);',
        ' float ticks = step(0.5, fract(ang*20.0/6.2831 + uTime*0.05))*smoothstep(0.02, 0.0, abs(r - 0.86));',
        ' float glow = pow(max(1.0 - r, 0.0), 2.0)*0.55;',
        ' vec3 col = uColor*(rings*0.35*(1.0 - r) + glow) + uColor2*(edge*0.8 + ticks*0.6);',
        ' gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    }));
    base.rotation.x = -Math.PI / 2; base.position.y = -1.74;
    scene.add(base);

    var cone = new T.Mesh(new T.CylinderGeometry(0.85, 1.3, 2.3, 64, 1, true), new T.ShaderMaterial({
      uniforms: HU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5); float a = pow(1.0 - vUv.y, 1.8)*0.14*(0.35 + f); float l = 0.7 + 0.3*sin(vUv.y*80.0 - uTime*4.0); gl_FragColor = vec4(uColor*a*l, 1.0); }'
    }));
    cone.position.y = -0.59;
    scene.add(cone);

    var ringMat = new T.MeshBasicMaterial({ color: HU.uColor2.value, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
    var r1 = new T.Mesh(new T.TorusGeometry(0.74, 0.0035, 6, 180), ringMat);
    var r2 = new T.Mesh(new T.TorusGeometry(0.82, 0.0025, 6, 180), ringMat);
    r1.position.y = 0.12; r2.position.y = 0.05;
    scene.add(r1); scene.add(r2);

    var DUST = 500, dg = new T.BufferGeometry(), dp = new Float32Array(DUST * 3), dr = new Float32Array(DUST);
    var DR = rng(31);
    for (var i = 0; i < DUST; i++) {
      var ang = DR() * Math.PI * 2, rad = 0.3 + DR() * 1.3;
      dp[i * 3] = Math.cos(ang) * rad; dp[i * 3 + 1] = -1.7 + DR() * 2.6; dp[i * 3 + 2] = Math.sin(ang) * rad; dr[i] = DR();
    }
    dg.setAttribute('position', new T.BufferAttribute(dp, 3));
    dg.setAttribute('aRnd', new T.BufferAttribute(dr, 1));
    var dust = new T.Points(dg, new T.ShaderMaterial({
      uniforms: HU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute float aRnd; uniform float uTime, uPR; varying float vA; void main(){ vec3 p = position; p.y = -1.7 + mod(p.y + 1.7 + uTime*(0.04 + aRnd*0.08), 2.6); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = uPR*(1.0 + aRnd*2.0)*(6.0 / -mv.z); vA = smoothstep(-1.7, -1.2, p.y)*(1.0 - smoothstep(0.5, 0.9, p.y))*(0.3 + aRnd*0.7); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor2; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor2*smoothstep(0.5, 0.0, d)*vA*0.7, 1.0); }'
    }));
    scene.add(dust);

    var ptLabel = document.getElementById('ptCount');
    var detail = document.getElementById('detail');
    function applyDetail() {
      var v = +detail.value;
      detail.style.setProperty('--p', ((v - 25) / 75 * 100) + '%');
      HU.uSize.value = 0.85 + (1 - v / 100) * 1.1;
      if (points) {
        var count = Math.round(total * v / 100);
        points.geometry.setDrawRange(0, count);
        ptLabel.textContent = count.toLocaleString(EN ? 'en-US' : 'es-AR') + (EN ? ' points' : ' puntos');
      }
    }
    detail.addEventListener('input', applyDetail);

    var mode = 'holo', scanStart = 0, introScan = false, disperseT = 0;
    var t0 = performance.now();
    function nowT() { return (performance.now() - t0) / 1000; }

    requestHead(32000, 7, function (res) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(res.pos, 3));
      g.setAttribute('aNormal', new T.BufferAttribute(res.nor, 3));
      g.setAttribute('aRnd', new T.BufferAttribute(res.rnd, 1));
      g.setAttribute('aJaw', new T.BufferAttribute(res.jaw, 1));
      total = res.n;
      g.setDrawRange(0, total);
      points = new T.Points(g, holoMat);
      points.frustumCulled = false;
      bust.add(points);
      applyDetail();
      if (!RM) { introScan = true; scanStart = nowT(); }
      if (RM) renderOnce();
    });

    Array.prototype.slice.call(document.querySelectorAll('.swatch')).forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        all.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        tgtC1.set(b.getAttribute('data-c1')); tgtC2.set(b.getAttribute('data-c2'));
        if (RM) { HU.uColor.value.copy(tgtC1); HU.uColor2.value.copy(tgtC2); renderOnce(); }
      });
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-mode]')).forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        all.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        mode = b.getAttribute('data-mode');
        introScan = false;
        if (mode === 'scan') scanStart = nowT();
        if (RM) { HU.uDisperse.value = mode === 'particles' ? 1 : 0; HU.uScanOn.value = mode === 'scan' ? 1 : 0; HU.uScanY.value = 0.2; renderOnce(); }
      });
    });

    var pointerS = { tx: 0, ty: 0, over: false }, rot = { x: 0, y: 0 };
    view.addEventListener('pointermove', function (e) {
      var r = view.getBoundingClientRect();
      pointerS.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointerS.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointerS.over = true;
    });
    view.addEventListener('pointerleave', function () { pointerS.over = false; });

    var talking = false, jaw = 0;
    function resize() {
      var r = view.getBoundingClientRect();
      var w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
      var p = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(p); renderer.setSize(w, h, false);
      HU.uPR.value = p;
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.8 ? 38 : 30;
      camera.updateProjectionMatrix();
      if (RM) renderOnce();
    }
    function frame(now, dt) {
      var t = nowT();
      HU.uTime.value = t;
      var k = 1 - Math.exp(-dt * 4);
      HU.uColor.value.lerp(tgtC1, k); HU.uColor2.value.lerp(tgtC2, k);
      var tx = pointerS.over ? pointerS.tx * 0.7 : Math.sin(t * 0.35) * 0.45;
      var ty = pointerS.over ? pointerS.ty * 0.18 : Math.sin(t * 0.23) * 0.05;
      rot.y += (tx - rot.y) * Math.min(1, dt * 3); rot.x += (ty - rot.x) * Math.min(1, dt * 3);
      bust.rotation.set(rot.x, rot.y, 0);
      bust.position.y = Math.sin(t * 0.8) * 0.015;
      r1.rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.25, 0, t * 0.6);
      r2.rotation.set(Math.PI / 2 - Math.sin(t * 0.4) * 0.2, t * 0.3, -t * 0.4);

      var dTarget = mode === 'particles' ? 1 : 0;
      HU.uDisperse.value += (dTarget - HU.uDisperse.value) * Math.min(1, dt * 1.8);

      if (introScan) {
        var p = (t - scanStart) / 2.4;
        HU.uScanOn.value = 1; HU.uScanY.value = -1.8 + p * 2.7;
        if (p >= 1) { introScan = false; if (mode !== 'scan') HU.uScanOn.value = 0; }
      } else if (mode === 'scan') {
        HU.uScanOn.value = 1; HU.uScanY.value = -1.8 + ((t - scanStart) / 3.4 % 1) * 2.7;
      } else {
        HU.uScanOn.value = 0;
      }

      var target = talking ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13.0) * Math.sin(t * 5.3 + 1.0)) : 0;
      jaw += (target - jaw) * Math.min(1, dt * 16);
      HU.uJaw.value = jaw;
      renderer.render(scene, camera);
    }
    function renderOnce() { frame(performance.now(), 0.016); }
    resize();
    return {
      resize: resize, frame: frame, renderOnce: renderOnce,
      setTalking: function (v) { talking = v; if (RM) renderOnce(); }
    };
  }

  var studioImpl = null;
  try { studioImpl = initStudio(); } catch (err) { studioImpl = null; if (window.console) console.warn('Estudio WebGL no disponible:', err); }
  if (!studioImpl) {
    document.getElementById('studioFallback').hidden = false;
    document.getElementById('ptCount').textContent = '—';
  }

  /* Talk: subtitles, voice bars, optional speech synthesis */
  var talkBtn = document.getElementById('talkBtn');
  var voiceToggle = document.getElementById('voiceToggle');
  var studioSub = document.getElementById('studioSub');
  var studioBars = Array.prototype.slice.call(document.querySelectorAll('#studioVoice span'));
  var phraseIdx = 0, talkToken = 0;
  function setBars(bars, active) {
    bars.forEach(function (b, i) { b.style.height = active ? (20 + Math.random() * 80) + '%' : (16 + Math.abs(Math.sin(i * 1.3)) * 14) + '%'; });
  }
  setBars(studioBars, false);
  voiceToggle.addEventListener('click', function () {
    var on = voiceToggle.getAttribute('aria-pressed') !== 'true';
    voiceToggle.setAttribute('aria-pressed', String(on));
    voiceToggle.textContent = tr(on ? 'Con audio' : 'Sin audio');
    if (!on && window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  });
  function pickVoice() {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      if (EN) return vs.filter(function (v) { return /en[-_](US|GB)/i.test(v.lang); })[0] || vs.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
      return vs.filter(function (v) { return /es[-_](AR|US|419|MX)/i.test(v.lang); })[0] || vs.filter(function (v) { return /^es/i.test(v.lang); })[0] || null;
    } catch (e) { return null; }
  }
  if (window.speechSynthesis) { try { window.speechSynthesis.getVoices(); } catch (e) {} }
  talkBtn.addEventListener('click', function () {
    var token = ++talkToken;
    var text = STUDIO_PHRASES[phraseIdx % STUDIO_PHRASES.length]; phraseIdx++;
    var typingDone = false, speechActive = false;
    function maybeStop() {
      if (token !== talkToken) return;
      if (typingDone && !speechActive) { if (studioImpl) studioImpl.setTalking(false); setBars(studioBars, false); }
    }
    if (studioImpl) studioImpl.setTalking(true);
    if (voiceToggle.getAttribute('aria-pressed') === 'true' && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = EN ? 'en-US' : 'es-AR'; var v = pickVoice(); if (v) u.voice = v;
        u.rate = 1.02; u.pitch = 1;
        u.onstart = function () { speechActive = true; };
        u.onend = u.onerror = function () { speechActive = false; maybeStop(); };
        window.speechSynthesis.speak(u);
      } catch (e) { speechActive = false; }
    }
    var n = 0;
    (function type() {
      if (token !== talkToken) return;
      n++;
      studioSub.textContent = text.slice(0, n);
      if (n % 2) setBars(studioBars, true);
      if (n < text.length) setTimeout(type, 42);
      else { typingDone = true; setTimeout(maybeStop, 350); setTimeout(function () { if (token === talkToken) { speechActive = false; maybeStop(); } }, 9000); }
    })();
  });

  /* =====================================================================
     6. Spark card, hero avatar card, brief builder
     ===================================================================== */
  var spark = document.getElementById('spark'), sctx = spark.getContext('2d'), sdpr = 1;
  var bpmEl = document.getElementById('bpm');
  function energyAt(tt) {
    var ph = (((tt % SPB) + SPB) % SPB) / SPB;
    return 0.16 + Math.exp(-ph * 7) * (playing ? 0.72 : 0.44) + sparkNoise(tt * 3 + 50) * 0.12;
  }
  function sizeSpark() {
    var r = spark.getBoundingClientRect();
    sdpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(r.width * sdpr), h = Math.round(r.height * sdpr);
    if (w && h && (spark.width !== w || spark.height !== h)) { spark.width = w; spark.height = h; }
    drawSpark();
  }
  function drawSpark() {
    var w = spark.width, h = spark.height;
    if (w < 2) return;
    var x = sctx, now = beatClock(), span = 2.6, pts = [];
    x.clearRect(0, 0, w, h);
    x.beginPath(); x.moveTo(0, h);
    for (var px = 0; px <= w; px += 3) {
      var tt = now - span + (px / w) * span;
      var y = h - energyAt(tt) * h * 0.88;
      pts.push([px, y]); x.lineTo(px, y);
    }
    x.lineTo(w, h); x.closePath();
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(242,154,75,0.75)'); g.addColorStop(1, 'rgba(242,154,75,0)');
    x.fillStyle = g; x.fill();
    x.beginPath();
    for (var i = 0; i < pts.length; i++) { if (i) x.lineTo(pts[i][0], pts[i][1]); else x.moveTo(pts[i][0], pts[i][1]); }
    x.strokeStyle = '#F7C79B'; x.lineWidth = 1.5 * sdpr; x.stroke();
    var last = pts[pts.length - 1];
    x.fillStyle = '#FFE3C4'; x.beginPath(); x.arc(last[0] - 3 * sdpr, last[1], 3 * sdpr, 0, Math.PI * 2); x.fill();
    if (playing) {
      bpmEl.style.transform = 'scale(' + (1 + 0.06 * Math.exp(-beatPhase() * 8)).toFixed(3) + ')';
    } else {
      bpmEl.style.transform = '';
    }
  }

  var playBtn = document.getElementById('playBtn');
  function setPlayUI(on) {
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pausar el beat' : 'Escuchar un beat a 124 BPM');
    var ip = playBtn.querySelector('.i-play'), ipa = playBtn.querySelector('.i-pause');
    if (on) { ip.setAttribute('hidden', ''); ipa.removeAttribute('hidden'); }
    else { ipa.setAttribute('hidden', ''); ip.removeAttribute('hidden'); }
  }
  playBtn.addEventListener('click', function () {
    if (playing) {
      playing = false; clearInterval(timerId); setPlayUI(false);
      if (RM) drawSpark();
      return;
    }
    if (!ensureAudio()) { playBtn.disabled = true; playBtn.title = tr('Tu navegador no permite reproducir audio'); return; }
    if (actx.state === 'suspended') actx.resume();
    audioStart = actx.currentTime + 0.06; schedT = audioStart; stepIdx = 0;
    playing = true; timerId = setInterval(scheduler, 25); scheduler(); setPlayUI(true);
    if (RM) drawSpark();
  });

  var phrases = [
    'Hola, soy Dax. ¿Qué mundo armamos hoy?',
    'Hablo con tu público por voz o por texto, en tiempo real.',
    'Me encontrás en la web, en mobile o por pixel streaming.'
  ].map(tr);
  var sayEl = document.getElementById('sayText');
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function talkLoop() {
    var i = 0;
    for (;;) {
      await sleep(3400);
      var cur = phrases[i];
      for (var n = cur.length; n >= 0; n -= 2) { sayEl.textContent = cur.slice(0, n); await sleep(12); }
      i = (i + 1) % phrases.length;
      var nx = phrases[i];
      for (var m = 1; m <= nx.length; m++) { sayEl.textContent = nx.slice(0, m); await sleep(32); }
    }
  }
  if (!RM) talkLoop();

  var EMAIL = 'alemichelis@daxenworld.com';
  var svcChips = Array.prototype.slice.call(document.querySelectorAll('[data-svc]'));
  var delChips = Array.prototype.slice.call(document.querySelectorAll('[data-del]'));
  var nameIn = document.getElementById('fName'), ideaIn = document.getElementById('fIdea');
  var msgEl = document.getElementById('msg'), mailLink = document.getElementById('mailLink'), statusEl = document.getElementById('status');
  function compose() {
    var svcs = svcChips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; }).map(function (c) { return c.getAttribute('data-svc'); });
    var del = delChips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; }).map(function (c) { return c.getAttribute('data-del'); })[0] || 'A definir';
    var name = nameIn.value.trim(), idea = ideaIn.value.trim();
    if (EN) return 'Hi Daxenworld' + (name ? ', this is ' + name : '') + '.\n\n' +
      'I’m interested in: ' + (svcs.length ? svcs.map(tr).join(', ') : 'not sure yet') + '.\n' +
      'Delivery: ' + tr(del) + '.\n\n' +
      'The idea: ' + (idea || '(tell us here what you want to build, for whom and by when)');
    return 'Hola Daxenworld' + (name ? ', soy ' + name : '') + '.\n\n' +
      'Me interesa: ' + (svcs.length ? svcs.join(', ') : 'todavía no lo sé') + '.\n' +
      'Entrega: ' + del + '.\n\n' +
      'La idea: ' + (idea || '(contá acá qué querés construir, para quién y para cuándo)');
  }
  function update() {
    var text = compose();
    msgEl.textContent = text;
    mailLink.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(EN ? 'Project with Daxenworld' : 'Proyecto con Daxenworld') + '&body=' + encodeURIComponent(text);
  }
  svcChips.forEach(function (c) {
    c.addEventListener('click', function () { c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true')); update(); });
  });
  delChips.forEach(function (c) {
    c.addEventListener('click', function () { delChips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); }); update(); });
  });
  nameIn.addEventListener('input', update);
  ideaIn.addEventListener('input', update);
  Array.prototype.slice.call(document.querySelectorAll('[data-preselect]')).forEach(function (a) {
    a.addEventListener('click', function () {
      var want = a.getAttribute('data-preselect');
      svcChips.forEach(function (c) { if (c.getAttribute('data-svc') === want) c.setAttribute('aria-pressed', 'true'); });
      update();
    });
  });
  update();

  var statusTimer = null;
  function say(text) {
    statusEl.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 3000);
  }
  function selectText(el) {
    var range = document.createRange(); range.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  function copy(text, el, okMsg) {
    var fallback = function () { selectText(el); say(tr('Texto seleccionado: copialo con Ctrl+C o ⌘+C.')); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { say(okMsg); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  document.getElementById('copyMsg').addEventListener('click', function () { copy(compose(), msgEl, tr('Mensaje copiado. Pegalo en un mail a ' + EMAIL + '.')); });
  document.getElementById('copyEmail').addEventListener('click', function () { copy(EMAIL, document.getElementById('email'), tr('Email copiado.')); });

  /* =====================================================================
     7. Loop, visibility, layout
     ===================================================================== */
  var heroVisible = true, studioVisible = false, running = false, last = 0;
  function loop(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (heroImpl && heroVisible) { heroImpl.frame(now, dt); drawSpark(); }
    if (studioImpl && studioVisible) studioImpl.frame(now, dt);
    requestAnimationFrame(loop);
  }
  function updateRunning() {
    if (RM) return;
    var want = (heroVisible || studioVisible) && !document.hidden;
    if (want && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
    else if (!want) running = false;
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; updateRunning(); }).observe(document.getElementById('inicio'));
    new IntersectionObserver(function (en) { studioVisible = en[0].isIntersecting; updateRunning(); }, { rootMargin: '100px' }).observe(document.getElementById('studioView'));
  } else { studioVisible = true; }
  document.addEventListener('visibilitychange', updateRunning);

  function layoutAll() {
    if (heroImpl) heroImpl.resize();
    if (studioImpl) studioImpl.resize();
    statics.forEach(renderStatic);
    sizeSpark();
    if (RM) { if (heroImpl) heroImpl.renderOnce(); if (studioImpl) studioImpl.renderOnce(); }
  }
  layoutAll();
  updateRunning();

  var resizeTimer = null;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(layoutAll, 160); }
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(onResize);
    ro.observe(heroWin); ro.observe(document.getElementById('studioView'));
    statics.forEach(function (cv) { ro.observe(cv); });
    ro.observe(spark);
  } else {
    window.addEventListener('resize', onResize);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutAll);
})();
