// SPDX-License-Identifier: AGPL-3.0-or-later
// La gràfica de la previsió (ADR 0096) i el que necessita per dibuixar-se: el
// cel, la pluja i el perill de cada hora. La fan servir la portada (casa.js:
// la gràfica, la vista en gran i les taules) i «Consultes» (consultes.js: la
// d'«Avui» i la de «Demà»), perquè el dibuix sigui un de sol (Juanjo,
// 17-10-2026). Es carrega després de comu.js i abans de la pàgina.

// Si l'hora és de pluja, segons la probabilitat i no segons els mil·límetres
// del model més plujós: «pluja» si és més probable que plogui que no (50 % o
// més) i «possible» des del 20 %, els mateixos llindars que config.py. Sense
// probabilitat, manen els mil·límetres.
const PROB_PLUJA = 0.5;
const PROB_POSSIBLE = 0.2;
// Només a la gràfica: de 10 al 20 % plou una de cada set hores, i per sota
// del 20 % queia una de cada cinc hores de pluja (arxiu 2024-2026; Juanjo,
// 16-10-2026). La taula no ho distingeix: al cel, «possible pluja» és des del 20 %.
const PROB_POCA = 0.1;
function plujaHora(f) {
  const p = f.probabilitat;
  if (f.plou_ara || (p == null ? f.pluja_mm >= 0.2 : p >= PROB_PLUJA)) return 'pluja';
  return p != null && p >= PROB_POSSIBLE ? 'possible' : null;
}
function plujaGrafica(f) {
  const p = f.probabilitat;
  return plujaHora(f) || (p != null && p >= PROB_POCA ? 'poca' : null);
}

// Descripció del cel i la icona que hi correspon. Els mil·límetres diuen com
// seria la pluja, no si n'hi haurà: sense prou probabilitat, només els
// núvols. De nit, la lluna en lloc del sol (a mitja hora del tram).
// Les paraules són les del manual d'estil de Meteocat (ADR 0043). Intensitat
// en una hora (el manual la dona per 30 minuts, aquí el doble): pluja
// moderada des de 6 mm, forta des de 40, torrencial des de 80; neu moderada
// des de 2 cm, forta des de 10. Tipus pels codis de temps d'Open-Meteo.
const INTENSITAT_PLUJA = [6, 40, 80];
const INTENSITAT_NEU = [2, 10];
const esNeu = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const esGelant = (c) => c === 56 || c === 57 || c === 66 || c === 67;
const esCalamarsa = (c) => c === 96 || c === 99;

function cel(f) {
  const nit = alturaSol(new Date(new Date(f.hora).getTime() + 18e5)) < 0;
  const pluja = plujaHora(f);
  const tempesta = f.codi >= 95;
  if (pluja === 'pluja') {
    if (tempesta) return esCalamarsa(f.codi) ? [T('Tempesta amb calamarsa'), 'i-cloud-hail'] : [T('Tempesta'), 'i-cloud-lightning'];
    if (esNeu(f.codi)) {
      const cm = f.neu || 0;
      return [cm >= INTENSITAT_NEU[1] ? T('Neu forta') : cm >= INTENSITAT_NEU[0] ? T('Neu moderada') : T('Neu feble'), 'i-cloud-snow'];
    }
    if (esGelant(f.codi)) return [T('Pluja gelant'), 'i-cloud-rain'];
    const mm = f.pluja_mm || 0;
    if (mm >= INTENSITAT_PLUJA[2]) return [T('Pluja torrencial'), 'i-cloud-rain-wind'];
    if (mm >= INTENSITAT_PLUJA[1]) return [T('Pluja forta'), 'i-cloud-rain-wind'];
    if (mm >= INTENSITAT_PLUJA[0]) return [T('Pluja moderada'), 'i-cloud-rain'];
    return [T('Pluja feble'), 'i-cloud-drizzle'];
  }
  if (pluja === 'possible') {
    if (esNeu(f.codi)) return [T('Possible neu'), 'i-cloud-snow'];
    return [tempesta ? T('Possible tempesta') : T('Possible pluja'), nit ? 'i-cloud-moon-rain' : 'i-cloud-sun-rain'];
  }
  if (esBoira(f)) return [T('Boira'), 'i-cloud-fog'];
  if (f.nuvols == null) return ['', null];
  // Si algun model hi posa pluja (0,2 mm o més, el que ja mulla), el cel no
  // pot sortir serè encara que la probabilitat sigui baixa: com a mínim, núvols.
  return celNuvols(nuvolsHora(f), nit);
}

const nuvolsHora = (f) => ((f.pluja_mm || 0) >= 0.2 ? Math.max(f.nuvols, 50) : f.nuvols);
const esBoira = (f) => f.codi === 45 || f.codi === 48;

// Per vuitens de cel tapat: serè 0, poc 1-2, mig 3-5, molt 6-7, cobert 8.
function celNuvols(nuvols, nit) {
  if (nuvols < 20) return [T('Serè'), nit ? 'i-moon-cel' : 'i-sun'];
  if (nuvols < 45) return [T('Poc ennuvolat'), nit ? 'i-cloud-moon' : 'i-cloud-sun'];
  if (nuvols < 70) return [T('Mig ennuvolat'), 'i-cloud'];
  if (nuvols < 85) return [T('Molt ennuvolat'), 'i-cloudy'];
  return [T('Cobert'), 'i-cloudy'];
}

// La part alta del barri, quan la diferència arriba a un grau (ADR 0087):
// «+2» al costat de la temperatura del tram i, a «Ara», una
// línia amb la mesurada ara.
// Arrodonit: 0,9 compta com un grau (Juanjo, 13-10-2026).
function arrodoneixAlta(n) {
  if (n == null) return 0;
  const r = Math.sign(n) * Math.round(Math.abs(n));
  return Math.abs(r) >= 1 ? r : 0;
}

// Avisos de Meteocat i de l'AEMET (el que Meteocat no cobreix, ADR 0093) en
// trams d'hores seguides del mateix tram del dia amb el mateix avís: per a cada hora, el tram que hi comença ({nivell, tipus, hores}),
// undefined si la cobreix un tram que ha començat abans, o null si no n'hi ha.
const ORDRE_NIVELL = ['groc', 'taronja', 'vermell'];

// El perill d'una hora: els avisos de l'AEMET i els que calcula aquesta web
// (riscos.py, ADR 0018) per a aquella hora, amb el nivell més alt (Juanjo,
// 12-10-2026: «la franja de peligro … tiene que estar destacada también …
// pluja forta en sí no indica ningún peligro especial»; ADR 0076).
// NOM_RISC, a comu.js: també el fa servir el bloc «Avisos actius» plegat (ADR 0094).

function riscosHora(f, riscos, ara = new Date()) {
  const ini = new Date(f.hora);
  const fi = new Date(f.fins);
  return (riscos || []).filter((r) => (r.origen === 'previsio'
    ? r.des_de && new Date(r.des_de) < fi && new Date(r.fins) > ini
    : ini <= ara && ara < fi));
}

// Es diu el nivell més alt i només el que el dona: amb un avís groc de
// l'AEMET per pluja i un de taronja de la web, «taronja: pluja molt forta».
// El fenomen de cada risc de la web, per no dir-lo dues vegades amb l'avís
// oficial del mateix fenomen («pluja intensa» de la web i «pluja» de l'AEMET).
const FENOMEN_RISC = { pluja_30min: 'pluja', pluja_3h: 'pluja', pluja_24h: 'pluja', ratxa: 'vent', neu_24h: 'neu' };

function elementsPerill(f) {
  return [...(f.avisos || []).flatMap((a) => a.tipus.map((t) => ({ nivell: a.nivell, nom: TD(t), font: a.font || 'aemet', fenomen: t }))),
    ...(f.riscos_hora || []).map((r) => ({ nivell: r.nivell, nom: NOM_RISC()[r.tipus] || r.tipus, font: 'web',
      fenomen: FENOMEN_RISC[r.tipus] || r.tipus }))];
}

function delNivellMesAlt(elements) {
  if (!elements.length) return null;
  const nivell = elements.map((a) => a.nivell).sort((a, b) => ORDRE_NIVELL.indexOf(b) - ORDRE_NIVELL.indexOf(a))[0];
  const daquest = elements.filter((a) => a.nivell === nivell);
  const noms = [...new Set(daquest.map((a) => a.nom))].sort();
  const fonts = ['meteocat', 'aemet', 'web'].filter((x) => daquest.some((a) => a.font === x)).join('');
  // Cada nivell i cada font amb els seus fenòmens, del nivell més alt al més
  // baix: el color és el del més alt, però el text els diu tots (Juanjo,
  // 17-10-2026: amb perill alt de Meteocat per pluja i avís groc de l'AEMET
  // per tempestes, «que la franja diga las dos cosas»). Cada fenomen, una
  // sola vegada, al seu nivell més alt: un groc de l'AEMET per pluja no es
  // diu sota un taronja de pluja intensa de la web.
  const nivells = ORDRE_NIVELL.filter((nv) => elements.some((a) => a.nivell === nv)).reverse();
  const dits = new Set();
  const perFont = nivells.flatMap((nv) => {
    const aquests = elements.filter((a) => a.nivell === nv && !dits.has(a.fenomen || a.nom));
    aquests.forEach((a) => dits.add(a.fenomen || a.nom));
    return ['meteocat', 'aemet', 'web'].map((x) => [x, [...new Set(aquests.filter((a) => a.font === x).map((a) => a.nom))].sort(), nv])
      .filter(([, n]) => n.length);
  });
  return { nivell, noms, fonts, perFont };
}

function avisHora(f) {
  const p = delNivellMesAlt(elementsPerill(f));
  return p && { ...p, clau: p.perFont.map(([font, noms, nv]) => `${nv}|${font}|${noms.join(',')}`).join(';') };
}

function tramsAvis(hores) {
  const res = [];
  let obert = null;
  for (const f of hores) {
    const a = avisHora(f);
    if (a && obert && obert.clau === a.clau) {
      obert.hores += 1;
      res.push(undefined);
    } else {
      obert = a && { ...a, hores: 1 };
      res.push(obert);
    }
  }
  return res;
}

// Cada gràfica, els seus identificadors (els retalls del text dels avisos).
let COMPTADOR_GRAFIQUES = 0;

// Les barres d'avisos de la gràfica: cada avís (font, nivell i fenomen) en
// les hores seguides que dura, i els fenòmens d'un mateix avís que duren el
// mateix, junts («Avís groc (AEMET): pluja, tempestes»). Cada fenomen, a cada
// hora, només al seu nivell més alt, com a la franja de les taules (avisHora).
function barresAvis(hores) {
  const obertes = new Map();
  const res = [];
  hores.forEach((f, i) => {
    const p = avisHora(f);
    const ara = new Set();
    for (const [font, noms, nivell] of (p ? p.perFont : [])) {
      for (const nom of noms) {
        const clau = `${font}|${nivell}|${nom}`;
        ara.add(clau);
        const b = obertes.get(clau);
        if (b && b.fi === i) b.fi = i + 1;
        else {
          const nova = { font, nivell, nom, ini: i, fi: i + 1 };
          obertes.set(clau, nova);
          res.push(nova);
        }
      }
    }
  });
  const juntes = [];
  for (const b of res) {
    const igual = juntes.find((j) => j.font === b.font && j.nivell === b.nivell && j.ini === b.ini && j.fi === b.fi);
    if (igual) igual.noms.push(b.nom);
    else juntes.push({ font: b.font, nivell: b.nivell, ini: b.ini, fi: b.fi, noms: [b.nom] });
  }
  const ordre = (nv) => ORDRE_NIVELL.indexOf(nv);
  return juntes
    .sort((a, b) => ordre(b.nivell) - ordre(a.nivell) || a.ini - b.ini)
    .map((j) => ({ ini: j.ini, fi: j.fi, p: { nivell: j.nivell, perFont: [[j.font, j.noms.sort(), j.nivell]] } }));
}

// El perill dit com el diu cada font: Meteocat, en grau de perill (moderat,
// alt, molt alt); l'AEMET i aquesta web, en colors (ADR 0093). El complet, amb
// d'on surt cada cosa; el curt, per a la franja i l'etiqueta del tram.
const GRAU_METEOCAT = () => ({ groc: T('moderat'), taronja: T('alt'), vermell: T('molt alt') });

function perFonts(p) {
  return p.perFont || [[p.fonts, p.noms]];
}

function textPerill(p) {
  return perFonts(p).map(([font, noms, nv = p.nivell]) => {
    const que = noms.join(T(' i '));
    const nivell = TD(nv);
    // Qui avisa, primer (Juanjo, 17-10-2026).
    if (font === 'meteocat') return T`Meteocat: perill ${GRAU_METEOCAT()[nv]} per ${que}`;
    if (font === 'web') return T`Temps a Montflorit: avís ${nivell} per ${que} (no oficial)`;
    return T`AEMET: avís ${nivell} per ${que}`;
  }).join('; ');
}

// «Perill alt: pluja», «Avís groc: tempestes»; si n'hi ha de les dues maneres
// o de diversos nivells, juntes, del nivell més alt al més baix. Amb ambFont,
// també d'on surt cada un, «Perill alt (Meteocat): pluja» (la franja de la
// gràfica; Juanjo, 17-10-2026: «añade el origen: meteocat, aemet, etc»).
const NOM_FONT = () => ({ meteocat: 'Meteocat', aemet: 'AEMET', web: T('aquesta aplicació') });
function partsPerill(p, ambQue = true, ambFont = false) {
  const parts = new Map();
  for (const [font, noms, nv = p.nivell] of perFonts(p)) {
    const origen = ambFont && NOM_FONT()[font] ? ` (${NOM_FONT()[font]})` : '';
    const nom = (font === 'meteocat' ? T`Perill ${GRAU_METEOCAT()[nv]}` : T`Avís ${TD(nv)}`) + origen;
    const abans = parts.get(nom);
    parts.set(nom, { nivell: nv, que: [...new Set([...(abans ? abans.que : []), ...noms])] });
  }
  return [...parts].map(([nom, { nivell, que }]) => ({ nivell, text: ambQue ? `${nom}: ${que.join(', ')}` : nom }));
}

function textPerillCurt(p, ambQue = true, ambFont = false) {
  return partsPerill(p, ambQue, ambFont).map((x) => x.text).join(' · ');
}

// --- La gràfica de la previsió (Juanjo, 16-10-2026: «un resumen visual …
// muy visual y muy claro»). Un meteograma, de l'hora en curs fins al final de
// la taula: la franja de perill, el cel cada 3 h, la temperatura i la
// probabilitat de pluja, amb el mateix eix d'hores. Les dades, les de la
// taula; la gràfica no diu res que no sigui a sota, tret de la fitxa de
// cada hora, que hi afegeix la part alta i l'UV. ---
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(nom, atributs = {}, text = null) {
  const e = document.createElementNS(SVG_NS, nom);
  for (const [k, v] of Object.entries(atributs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// L'alçada de la barra de pluja, en mil·límetres, proporcional al sostre
// rotulat (Juanjo, 17-10-2026: amb 3,7 mm i el sostre a 10 mm, la barra
// arribava al 61 % i no al 37 %: era d'arrel quadrada, perquè 1 o 2 mm no
// desapareguessin; amb el sostre per esglaons, 1 mm ja és el 10 %, i les
// barres baixes tenen 3 px com a mínim). Dalt de tot, l'esglaó que cobreix la pluja més forta de la
// gràfica, 10 mm com a mínim: les barres omplen més l'espai (Juanjo,
// 17-10-2026: «las columnas me parecen cortas… no sería mejor una escala
// variable?»), però en esglaons fixos i amb el sostre rotulat, perquè un dia
// de plovisqueig no sembli un diluvi. Del 40 amunt (el llindar taronja),
// també el color ho diu.
const MM_ESGLAONS = [10, 20, 40, 80, 160];
const sostrePluja = (files) => {
  const max = Math.max(0, ...files.filter((f) => plujaGrafica(f)).map((f) => f.pluja_mm || 0));
  return MM_ESGLAONS.find((e) => max <= e) || MM_ESGLAONS[MM_ESGLAONS.length - 1];
};
const alcadaPluja = (mm, sostre) => Math.min(1, Math.max(0, mm) / sostre);
// La pluja forta i la torrencial, amb color propi: les intensitats del manual
// d'estil de Meteocat, les mateixes paraules que la columna «Cel» de la taula
// (INTENSITAT_PLUJA; ADR 0043). L'avís, a la franja de dalt (Juanjo,
// 16-10-2026: «no hay unas etiquetas normalizadas?»).
function intensitatPluja(mm) {
  if (mm >= INTENSITAT_PLUJA[2]) return 'torrencial';
  if (mm >= INTENSITAT_PLUJA[1]) return 'forta';
  return null;
}

// El cel d'un bloc de 3 h: la pluja, si n'hi ha en alguna hora; si no, la del mig.
function celBloc(files) {
  const amb = files.map((f) => [f, cel(f)]).filter(([, c]) => c[1]);
  if (!amb.length) return null;
  const plujoses = amb.filter(([f]) => plujaHora(f));
  if (plujoses.length) return plujoses.sort(([a], [b]) => (b.probabilitat || 0) - (a.probabilitat || 0))[0][1];
  return amb[Math.floor(amb.length / 2)][1];
}

// La línia de temperatura, suau (Juanjo, 16-10-2026: «tiene picos… que
// parezca más profesional»): corba cúbica monòtona (Fritsch i Carlson, la
// «monotoneX» de d3), que passa per cada hora i no fa pujades ni baixades
// que no siguin a les dades.
function corbaSuau(p) {
  const n = p.length;
  const f = (v) => v.toFixed(1);
  if (n < 3) return 'M' + p.map(([a, b]) => `${f(a)},${f(b)}`).join(' L');
  const h = [], s = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(p[i + 1][0] - p[i][0]);
    s.push((p[i + 1][1] - p[i][1]) / h[i]);
  }
  const m = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) { m[i] = 0; continue; }
    const q = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    m[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(q));
  }
  m[0] = (3 * s[0] - m[1]) / 2;
  m[n - 1] = (3 * s[n - 2] - m[n - 2]) / 2;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const t = h[i] / 3;
    d += ` C${f(p[i][0] + t)},${f(p[i][1] + m[i] * t)} ${f(p[i + 1][0] - t)},${f(p[i + 1][1] - m[i + 1] * t)} ${f(p[i + 1][0])},${f(p[i + 1][1])}`;
  }
  return d;
}

// Les hores de la gràfica, per a la vista gran (vistaGrafica).
let HORES_GRAFICA = null;

function grafica(hores) {
  const ara = new Date();
  const files = (hores || []).filter((f) => new Date(f.fins) > ara && f.temperatura != null);
  if (files.length < 6) return null;
  HORES_GRAFICA = hores;
  // Les hores, sempre totes: el període depèn del lloc de la gràfica, no de
  // les «Opcions» (Juanjo, 17-10-2026: «lo que no afectará a todas las
  // gráficas es el periodo que se visualizará»).
  return figuraGrafica(files,
    T('Gràfica de la previsió: perill, cel, temperatura i probabilitat de pluja. Les mateixes dades són a les taules de sota.'));
}

function figuraGrafica(files, peu) {
  const fig = element('figure', 'grafica');
  fig.append(element('figcaption', 'visualment-amagat', peu));
  fig._files = files;
  return fig;
}

// Des d'aquesta hora, el resum del dia ja és el de demà (bot.HORA_DEMA).
const HORA_DEMA = 18;

// La gràfica del dia de què parla el resum, a «Consultes» i a la imatge que
// l'acompanya a Telegram i als avisos (grafica_imatge.py; Juanjo,
// 17-10-2026): la d'«Avui», d'ara a mitjanit; la de «Demà», com el text del
// bot (bot.resum), de la nit d'avui (des de HORA_DEMA) al final de demà.
// Amb menys de 3 hores, cap.
function graficaDia(hores, riscos, dia, ara = new Date()) {
  const dies = (n, h = 0) => new Date(ara.getFullYear(), ara.getMonth(), ara.getDate() + n, h);
  const [des, fins] = dia === 'dema' ? [dies(0, HORA_DEMA), dies(2)] : [ara, dies(1)];
  const files = (hores || []).filter((f) => new Date(f.fins) > ara && new Date(f.fins) > des
    && new Date(f.hora) < fins && f.temperatura != null);
  if (files.length < 3) return null;
  for (const f of files) f.riscos_hora = riscosHora(f, riscos, ara);
  const fig = figuraGrafica(files, T('Gràfica de la previsió hora a hora: perill, cel, temperatura i probabilitat de pluja.'));
  // A «Consultes», la càmera al final de la llegenda (botoImatge).
  fig._botoImatge = true;
  return fig;
}

function dibuixaGrafica(fig) {
  const files = fig._files;
  // A la vista gran: més alçada i, si es tria, el vent (vistaGrafica).
  const opcions = fig._opcions || {};
  const W = fig.clientWidth;
  if (!W || !files.length) return;
  const n = files.length;
  const col = W / n;
  const x = (i) => i * col;
  // El cel, la temperatura i les hores de l'eix, cada hora si hi ha lloc
  // (Juanjo, 17-10-2026: «la gráfica está bastante vacía, mejor que salga
  // cada hora»); si no, cada 2 o cada 3.
  const pas = col >= 30 ? 1 : col >= 18 ? 2 : 3;
  const hora = (f) => new Date(f.hora).getHours();
  // A la pàgina des del principi: el text dels avisos s'ha de poder mesurar.
  const g = svg('svg', { width: W, 'aria-hidden': 'true' });
  fig.querySelector('svg')?.remove();
  fig.prepend(g);
  const mesura = (text) => {
    const prova = svg('g', { class: 'g-avis' });
    const t = svg('text', {}, text);
    prova.append(t);
    g.append(prova);
    const llarg = t.getComputedTextLength();
    prova.remove();
    return llarg;
  };
  // Els avisos: una barra per avís, de les hores que dura, amb el seu nivell,
  // el seu origen i el seu text enganxat (Juanjo, 17-10-2026: «por qué aemet
  // tormentas sale repetido?», amb el groc de tempestes partit entre la franja
  // del taronja de Meteocat i la de l'endemà). Les que coincideixen, en files;
  // cada barra va a la primera fila on hi cap amb el seu text. El text,
  // sencer (nivell, origen i fenomen), comença dins de la barra i, el que no hi
  // cap, continua fora amb el color del text de la pàgina (Juanjo, 17-10-2026:
  // «y si metes dentro el texto? el que no quepa sigue por fuera con el cambio
  // de color necesario para verse bien»); vora la dreta de la gràfica, acaba
  // on acaba la barra i el que no hi cap queda a l'esquerra. Sencer, també
  // en tocar-la.
  const barres = barresAvis(files).map((b) => ({ ...b, x0: x(b.ini) + 1, x1: x(b.fi) - 1 }));
  const files_ = [];
  for (const b of barres) {
    const text = textPerillCurt(b.p, true, true);
    const llarg = mesura(text);
    const tx = b.x0 + 5 + llarg <= W ? b.x0 + 5 : Math.max(0, Math.min(b.x1 - 5 - llarg, W - llarg));
    const lloc = { text, tx, llarg, ocupa: [Math.min(b.x0, tx), Math.max(b.x1, tx + llarg)] };
    const [a, z] = lloc.ocupa;
    // Una barra pot anar just darrere de l'altra (el groc de demà després del
    // taronja d'avui), però no damunt seu ni del seu text.
    let fila = files_.findIndex((o) => o.every(([c, d]) => z + 2 <= c || a >= d + 2));
    if (fila < 0) fila = files_.push([]) - 1;
    files_[fila].push(lloc.ocupa);
    Object.assign(b, lloc, { fila });
  }
  const ambAvis = barres.length > 0;
  // Les files de la gràfica, de dalt a baix.
  const yAvis = 0;
  const hBarra = 20;
  const hAvis = ambAvis ? files_.length * (hBarra + 3) - 3 : 0;
  const yDia = hAvis + (ambAvis ? 6 : 0);
  const yCel = yDia + 16;
  const hCel = 28;
  // La temperatura i la pluja comparteixen la zona: les barres darrere de la
  // línia, com als meteogrames habituals (Juanjo, 16-10-2026).
  // El cel queda a part, a dalt: les barres no hi arriben (Juanjo, 16-10-2026).
  // Sota cada icona, la temperatura d'aquella hora (Juanjo, 16-10-2026: «no
  // quedaría bien la temperatura bajo el cielo?»).
  const yXifra = yCel + hCel + 13;
  const yTemp = yXifra + 12;
  const hTemp = opcions.gran ? Math.round(Math.min(260, Math.max(110, innerHeight * 0.32))) : 100;
  const yPluja = yTemp;
  const hPluja = hTemp;
  // El vent, a sota de la pluja, amb el mateix eix d'hores.
  // A la vista en gran, el que s'hi tria; a la resta, el que s'hi va triar
  // (per defecte, amb vent). Sense dades de vent, res.
  const ambVent = (opcions.gran ? opcions.vent : opcions.vent ?? ambVentTriat()) && files.some((f) => f.vent != null);
  const hVent = ambVent ? (opcions.gran ? 70 : 50) : 0;
  // La temperatura de la part alta, una segona corba, si es tria (Juanjo,
  // 17-10-2026): com el vent, la tria de la vista en gran val per a totes;
  // per defecte, no.
  const ambAlta = (opcions.gran ? opcions.alta : opcions.alta ?? altaTriada()) && files.some((f) => f.dif_alta != null);
  // I la de la part baixa (la de l'estació, vora la riera), que es pot treure
  // per a qui no la necessita (Juanjo, 17-10-2026); per defecte, sí.
  const ambBaixa = opcions.gran ? opcions.baixa !== false : opcions.baixa ?? baixaTriada();
  // La xifra de sota cada icona: la de baix; sense, la de dalt.
  const tempXifra = (f) => (f.temperatura == null ? null : ambBaixa ? f.temperatura
    : ambAlta && !f.mesura ? f.temperatura + (f.dif_alta || 0) : null);
  const yVent = yPluja + hPluja + (hVent ? 12 : 0);
  const baix = hVent ? yVent + hVent : yPluja + hPluja;
  const yEix = baix + 16;
  const H = yEix + 4;
  g.setAttribute('height', H);
  g.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // La nit, ombrejada, de la posta a la sortida (a mitja hora de cada tram),
  // en un sol rectangle per nit.
  const esNit = files.map((f) => alturaSol(new Date(new Date(f.hora).getTime() + 18e5)) < 0);
  for (let i = 0; i < n; i++) {
    if (!esNit[i] || (i && esNit[i - 1])) continue;
    let j = i;
    while (j < n && esNit[j]) j++;
    g.append(svg('rect', { class: 'g-nit', x: x(i), y: yCel - 2, width: x(j) - x(i), height: baix - yCel + 2 }));
  }

  // Mitjanit: la ratlla que separa els dies, i el nom de cada dia.
  // Cada dia pel seu nom, segons la data: de nit, la taula arriba fins a
  // demà passat (Juanjo, 17-10-2026: «el 2º demà debería haber sido demà
  // passat»). El primer nom, només si hi cap abans de mitjanit: si no, ja
  // s'entén («si avui no cabe no se escriba nada»).
  const nomDia = (f) => {
    const d = new Date(f.hora);
    const avui = new Date();
    const dies = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate())
      - new Date(avui.getFullYear(), avui.getMonth(), avui.getDate())) / 864e5);
    // Els dies de l'historial (enrere), «Ahir» o el nom del dia de la setmana.
    if (dies < -1) return d.toLocaleDateString(IDIOMA.codi === 'es' ? 'es' : 'ca', { weekday: 'long' });
    return dies === -1 ? T('Ahir') : dies === 0 ? T('Avui') : dies === 1 ? T('Demà') : T('Demà passat');
  };
  const mitjanits = files.map((f, i) => (i && hora(f) === 0 ? i : null)).filter((i) => i != null);
  const primer = svg('text', { class: 'g-dia', x: 2, y: yDia + 11 }, nomDia(files[0]));
  g.append(primer);
  if (mitjanits.length && 2 + primer.getComputedTextLength() + 8 > x(mitjanits[0])) primer.remove();
  for (const i of mitjanits) {
    g.append(svg('line', { class: 'g-mitjanit', x1: x(i), x2: x(i), y1: yDia, y2: baix }));
    g.append(svg('text', { class: 'g-dia', x: x(i) + 4, y: yDia + 11 }, nomDia(files[i])));
  }

  // Les barres dels avisos. El text que surt de la barra es dibuixa dues
  // vegades, retallat: dins, fosc sobre el color; fora, del color del text.
  const id = `g-${++COMPTADOR_GRAFIQUES}`;
  const defsAvis = svg('defs');
  g.append(defsAvis);
  barres.forEach((b, k) => {
    const grup = svg('g', { class: `g-avis ${b.p.nivell}` });
    const y = yAvis + b.fila * (hBarra + 3);
    grup.append(svg('rect', { x: b.x0, y, width: b.x1 - b.x0, height: hBarra, rx: 4 }));
    if (b.tx >= b.x0 + 4 && b.tx + b.llarg <= b.x1 - 4) grup.append(svg('text', { x: b.tx, y: y + 14 }, b.text));
    else {
      const dins = svg('clipPath', { id: `${id}-d${k}` });
      dins.append(svg('rect', { x: b.x0, y, width: b.x1 - b.x0, height: hBarra }));
      const fora = svg('clipPath', { id: `${id}-f${k}` });
      fora.append(svg('rect', { x: 0, y, width: Math.max(0, b.x0), height: hBarra }),
        svg('rect', { x: b.x1, y, width: Math.max(0, W - b.x1), height: hBarra }));
      defsAvis.append(dins, fora);
      grup.append(svg('text', { x: b.tx, y: y + 14, 'clip-path': `url(#${id}-d${k})` }, b.text),
        svg('text', { class: 'fora', x: b.tx, y: y + 14, 'clip-path': `url(#${id}-f${k})` }, b.text));
    }
    const complet = textPerill(b.p);
    grup.append(svg('title', {}, complet));
    grup.addEventListener('click', () => avisBreu(`${complet}.`));
    g.append(grup);
  });

  // El cel, un per bloc de 3 h (o de 2, si hi ha lloc), al centre del bloc.
  for (let i = 0; i < n;) {
    let j = i + 1;
    while (j < n && hora(files[j]) % pas !== 0) j++;
    const c = celBloc(files.slice(i, j));
    const amplada = (j - i) * col;
    if (c && amplada >= 20) {
      const mida = Math.min(24, amplada - 6);
      const cx = x(i) + amplada / 2;
      const ic = svg('use', { href: '#' + c[1], x: cx - mida / 2, y: yCel + (hCel - mida) / 2, width: mida, height: mida, class: 'g-cel' });
      g.append(ic);
      const mig = files[Math.floor((i + j - 1) / 2)];
      if (tempXifra(mig) != null) {
        g.append(svg('text', { class: 'g-xifra', x: cx, y: yXifra, 'text-anchor': 'middle' }, `${Math.round(tempXifra(mig))}°`));
      }
    }
    i = j;
  }

  // La temperatura, primer el farciment (darrere de les barres) i després la
  // línia (davant), sense xifres: són sota el cel.
  // Les hores passades (historial.py) porten la temperatura mesurada, que pot
  // faltar, i la de la previsió de les 7 (prev), en una corba tènue; la part
  // alta, només a les previstes.
  const valid = (v) => v != null && !Number.isNaN(v);
  const baixes = files.map((f) => f.temperatura);
  const temps = ambBaixa ? baixes.filter(valid) : [];
  const altes = ambAlta ? files.map((f) => (f.mesura || f.temperatura == null ? null : f.temperatura + (f.dif_alta || 0))) : [];
  const previstes = files.map((f) => (f.mesura && f.prev ? f.prev.temperatura : null));
  const ambPrev = previstes.some(valid);
  const ambTemp = (ambBaixa || ambAlta) && [...temps, ...altes].some(valid);
  // La màxima toca la ratlla del sostre de la pluja, que porta a l'esquerra
  // la seva xifra: una sola ratlla per al màxim de les dues escales (Juanjo,
  // 17-10-2026: «la temperatura debe llegar al máximo de la lluvia y poner
  // esa temperatura máxima a la izquierda»). Amb la part alta, la més alta
  // de les dues, i si és la de dalt, ho diu.
  const escala = [...(ambTemp ? [...temps, ...altes] : baixes), ...previstes].filter(valid);
  if (!escala.length) escala.push(0, 1);
  const tMax = Math.max(...escala);
  const maxAlta = ambAlta && (!ambBaixa || Math.max(...altes.filter(valid)) > Math.max(...temps));
  const tMin = Math.min(Math.floor(Math.min(...escala)) - 1, tMax - 2);
  const ySostre = yPluja + 14;
  const yT = (t) => yTemp + hTemp - ((t - tMin) / (tMax - tMin)) * (yTemp + hTemp - ySostre);
  // El farciment, sota la corba de baix o, sense, sota la de dalt. Les hores
  // sense dada, fora.
  const corbaDe = (vals) => {
    const p = vals.map((v, i) => [x(i) + col / 2, v]).filter(([, v]) => valid(v)).map(([a, v]) => [a, yT(v)]);
    return p.length > 1 ? { p, d: corbaSuau(p) } : null;
  };
  const principal = corbaDe(ambBaixa || !ambAlta ? baixes : altes);
  const punts = principal ? principal.p : [[0, 0], [0, 0]];
  const corba = principal ? principal.d : '';
  const base = yPluja + hPluja;
  const idGrad = 'g-temp-grad';
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: idGrad, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svg('stop', { offset: 0, class: 'g-grad-dalt' }), svg('stop', { offset: 1, class: 'g-grad-baix' }));
  defs.append(grad);
  g.append(defs);
  if (ambTemp && principal) {
    g.append(svg('path', { class: 'g-temp-area', fill: `url(#${idGrad})`,
      d: `${corba} L${punts[punts.length - 1][0].toFixed(1)},${base} L${punts[0][0].toFixed(1)},${base} Z` }));
  }

  // La pluja: una barra per hora, tan alta com els mil·límetres; plena si és
  // probable (del 50 % amunt) i clara si només és possible (del 20 %), els
  // mateixos llindars que el cel de la taula. Per sota, cap barra.
  g.append(svg('line', { class: 'g-base', x1: 0, x2: W, y1: base, y2: base }));
  // Dalt de tot queda lloc per a la xifra dels mm.
  const sostre = sostrePluja(files);
  const dalt = (f) => yPluja + hPluja - Math.max(3, alcadaPluja(f.pluja_mm || 0, sostre) * (hPluja - 14));
  // El sostre, una ratlla fina amb la seva xifra, com la del vent; només si plou.
  const ambBarres = files.some((f) => plujaGrafica(f));
  g.append(svg('line', { class: 'g-sostre', x1: 0, x2: W, y1: ySostre, y2: ySostre }));
  files.forEach((f, i) => {
    const pluja = plujaGrafica(f);
    if (!pluja) return;
    const y = dalt(f);
    const intensa = intensitatPluja(f.pluja_mm || 0);
    g.append(svg('rect', { class: `g-pluja ${pluja === 'pluja' ? 'segura' : pluja}${intensa ? ' ' + intensa : ''}`,
      x: x(i) + col * 0.15, y, width: col * 0.7, height: base - y }));
  });
  // Una vora del color del fons, perquè la línia es vegi damunt de les barres.
  // La previsió de les 7 de les hores passades, tènue, darrere de la mesurada.
  const prev = ambPrev && corbaDe(previstes);
  if (prev) g.append(svg('path', { class: 'g-prev', d: prev.d }));
  if (ambBaixa && principal) {
    g.append(svg('path', { class: 'g-temp-vora', d: corba }));
    g.append(svg('path', { class: 'g-temp', d: corba }));
  }
  const corbaAlta = ambAlta && corbaDe(altes);
  if (corbaAlta) {
    g.append(svg('path', { class: 'g-temp-vora', d: corbaAlta.d }), svg('path', { class: 'g-alta', d: corbaAlta.d }));
  }
  if (ambBarres) g.append(svg('text', { class: 'g-mm g-sostre-xifra', x: W - 2, y: ySostre - 3, 'text-anchor': 'end' }, `${sostre}\u00a0mm`));
  if (ambTemp) {
    g.append(svg('text', { class: 'g-mm g-sostre-xifra g-sostre-temp', x: 2, y: ySostre - 3 },
      maxAlta ? T`${Math.round(tMax)}\u00a0°C (part alta)` : `${Math.round(tMax)}\u00a0°C`));
  }

  // El vent i les ratxes, en km/h: una ratlla a dalt amb la xifra de l'escala,
  // de 10 en 10 (20 com a mínim, perquè un dia calmat no sembli de vent).
  if (hVent) {
    const vents = files.flatMap((f) => [f.vent, f.ratxa]).filter((v) => v != null);
    const vDalt = Math.max(20, Math.ceil(Math.max(0, ...vents) / 10) * 10);
    const yV = (v) => yVent + hVent - (Math.max(0, v) / vDalt) * hVent;
    g.append(svg('line', { class: 'g-vent-escala', x1: 0, x2: W, y1: yVent, y2: yVent }));
    g.append(svg('line', { class: 'g-base', x1: 0, x2: W, y1: baix, y2: baix }));
    g.append(svg('text', { class: 'g-vent-xifra', x: 2, y: yVent - 3 }, `${vDalt}\u00a0km/h`));
    const linia = (camp, classe) => {
      const p = files.map((f, i) => [x(i) + col / 2, f[camp]]).filter(([, v]) => v != null).map(([a, v]) => [a, yV(v)]);
      if (p.length > 1) g.append(svg('path', { class: classe, d: corbaSuau(p) }));
    };
    linia('ratxa', 'g-ratxa');
    linia('vent', 'g-vent');
  }

  // Els mil·límetres, només on la pluja és més forta de cada episodi, a sobre
  // de la barra; si hi ha una xifra de temperatura, a dins de la barra o al
  // costat, on no se superposi. Si no hi cap sense trepitjar cap altra xifra
  // (al mòbil, dos episodis seguits), no s'escriu: surt a la fitxa de l'hora.
  const xifres = [...g.querySelectorAll('.g-xifra, .g-sostre-xifra')].map((t) => t.getBBox());
  const xoca = (b) => xifres.some((c) => b.x < c.x + c.width + 4 && c.x < b.x + b.width + 4 && b.y < c.y + c.height && c.y < b.y + b.height);
  files.forEach((f, i) => {
    const mm = f.pluja_mm || 0;
    if (mm < 0.5 || !plujaHora(f)) return;
    const veins = files.slice(Math.max(0, i - 2), i + 3).map((v) => v.pluja_mm || 0);
    if (mm < Math.max(...veins) || files.slice(Math.max(0, i - 2), i).some((v) => (v.pluja_mm || 0) === mm)) return;
    const t = svg('text', { class: 'g-mm', 'text-anchor': 'middle' },
      `${mm >= 10 ? Math.round(mm) : coma(Math.round(mm * 10) / 10)}\u00a0mm`);
    g.append(t);
    const cx = x(i) + col / 2;
    const llarg = t.getComputedTextLength();
    const llocs = [[cx, dalt(f) - 4], [cx, dalt(f) + 14], [cx - llarg / 2 - col, dalt(f) + 4], [cx + llarg / 2 + col, dalt(f) + 4]];
    const lloc = llocs.find(([lx, ly]) => {
      t.setAttribute('x', Math.min(Math.max(lx, llarg / 2 + 1), W - llarg / 2 - 1));
      t.setAttribute('y', ly);
      return !xoca(t.getBBox());
    });
    if (lloc) xifres.push(t.getBBox());
    else t.remove();
  });

  // L'eix: «Ara» a l'esquerra i les hores en punt, cada 3 h (o 2).
  // Si la gràfica no comença ara (la vista de demà), la primera hora.
  // Amb hores passades al davant (l'historial), «Ara» on comença la previsió,
  // amb una ratlla; un dia passat sencer no en porta.
  const iAra = files.findIndex((f) => !f.mesura);
  const ambAra = iAra === 0 && new Date(files[0].hora) <= new Date();
  const textAra = svg('text', { class: ambAra ? 'g-hora ara' : 'g-hora', x: 1, y: yEix }, ambAra ? T('Ara') : String(hora(files[0])));
  g.append(textAra);
  // Cap hora a sobre d'«Ara» («Ahora» és més llarg): mesurat a la pàgina.
  const finsAra = textAra.getComputedTextLength() + 14;
  let araMig = null;
  if (iAra > 0) {
    g.append(svg('line', { class: 'g-ara', x1: x(iAra), x2: x(iAra), y1: yCel - 2, y2: baix }));
    araMig = svg('text', { class: 'g-hora ara', x: x(iAra), y: yEix, 'text-anchor': 'middle' }, T('Ara'));
    g.append(araMig);
  }
  const llargAra = araMig ? araMig.getComputedTextLength() / 2 + 10 : 0;
  // Una marca a cada hora: llarga i amb el número a les que toquen; curta i
  // sense número a la resta (Juanjo, 16-10-2026).
  files.forEach((f, i) => {
    if (!i) return;
    const gran = hora(f) % pas === 0;
    g.append(svg('line', { class: gran ? 'g-marca' : 'g-marca petita', x1: x(i), x2: x(i),
      y1: baix, y2: baix + (gran ? 4 : 2) }));
    if (!gran || x(i) < finsAra || x(i) > W - 8 || (araMig && Math.abs(x(i) - x(iAra)) < llargAra)) return;
    g.append(svg('text', { class: 'g-hora', x: x(i), y: yEix, 'text-anchor': 'middle' }, String(hora(f))));
  });
  // Tocar una hora (o passar-hi el ratolí): una fitxa amb tota la previsió
  // d'aquella hora, perquè a la gràfica no hi cap (Juanjo, 16-10-2026: «solo
  // pone la lluvia del mayor?»; 17-10-2026: «no se podrían añadir el resto de
  // datos?»). La part alta, la neu i l'UV, només quan diuen alguna cosa. Es
  // treu tocant fora o la mateixa hora.
  const retol = svg('g', { class: 'g-retol' });
  let actiu = null;
  const amaga = () => {
    actiu = null;
    retol.replaceChildren();
  };
  const liniesFitxa = (f, i) => {
    // Una hora passada: el que es va mesurar i el que deia la previsió de les 7.
    if (f.mesura) {
      const linies = [T`${hora(f)}\u00a0h · Mesurat`];
      const p = f.prev || {};
      const previst = (v, t) => (v == null ? '' : t);
      linies.push(f.temperatura == null ? T('Temperatura: sense mesura')
        : T`Temperatura: ${Math.round(f.temperatura)}\u00a0°C`
          + previst(p.temperatura, T` (prevista: ${Math.round(p.temperatura ?? 0)}\u00a0°C)`));
      const mm = (v) => (v >= 10 ? String(Math.round(v)) : v < 0.05 ? '0' : coma(Math.round(v * 10) / 10));
      linies.push(f.pluja_mm == null ? T('Pluja: no se sap') : T`Pluja: ${mm(f.pluja_mm)}\u00a0mm`
        + previst(p.probabilitat, T` (prevista: ${Math.round((p.probabilitat ?? 0) * 100)}\u00a0%)`));
      return linies;
    }
    const [textCel] = f.plou_ara ? [T('Plou ara')] : cel(f);
    const linies = [textCel ? T`${hora(f)}\u00a0h · ${textCel}` : T`${hora(f)}\u00a0h`];
    const t = Math.round(f.temperatura);
    const alta = arrodoneixAlta(f.dif_alta);
    linies.push(T`Temperatura: ${t}\u00a0°C` + (alta ? T` (part alta: ${t + alta}\u00a0°C)` : ''));
    // Els mm com a la xifra de la barra: sense decimals a partir de 10.
    const v = f.pluja_mm || 0;
    const mm = v >= 10 ? String(Math.round(v)) : v < 0.05 ? '0' : coma(Math.round(v * 10) / 10);
    linies.push(f.probabilitat == null ? T`Pluja: ${mm}\u00a0mm`
      : T`Pluja: ${mm}\u00a0mm · ${Math.round(f.probabilitat * 100)}\u00a0%`);
    if ((f.neu || 0) >= 0.1) linies.push(T`Neu: ${coma(f.neu)}\u00a0cm`);
    if (f.vent != null) {
      linies.push(T`Vent: ${Math.round(f.vent)}\u00a0km/h` + (f.ratxa ? T`, ratxes de ${Math.round(f.ratxa)}\u00a0km/h` : ''));
    }
    // L'UV, de dia i des de 3, quan l'OMS ja recomana protegir-se.
    if (!esNit[i] && f.uv != null && Math.round(f.uv) >= 3) linies.push(T`Índex UV: ${Math.round(f.uv)}`);
    return linies;
  };
  const mostra = (i) => {
    actiu = i;
    retol.replaceChildren(svg('rect', { class: 'g-retol-columna', x: x(i), y: yCel - 2, width: col,
      height: baix - yCel + 2 }));
    const fons = svg('rect', { class: 'g-retol-fons', rx: 6 });
    retol.append(fons);
    const interlinia = 16;
    const textos = liniesFitxa(files[i], i).map((l, k) => {
      const t = svg('text', { class: k ? 'g-retol-text' : 'g-retol-text titol' }, l);
      retol.append(t);
      return t;
    });
    const ample = Math.max(...textos.map((t) => t.getComputedTextLength())) + 16;
    const alt = textos.length * interlinia + 8;
    // Al costat de la columna, on hi hagi lloc, perquè no tapi l'hora triada.
    // Si no hi cap per cap costat (al mòbil, les hores del mig), sota l'eix,
    // damunt de la llegenda.
    let fx = x(i) + col + 6;
    let fy = yCel;
    if (fx + ample > W) fx = x(i) - 6 - ample;
    if (fx < 0) {
      fx = Math.min(Math.max(x(i) + col / 2 - ample / 2, 0), W - ample);
      fy = yEix + 8;
    }
    Object.entries({ x: fx, y: fy, width: ample, height: alt }).forEach(([k, v_]) => fons.setAttribute(k, v_));
    textos.forEach((t, k) => {
      t.setAttribute('x', fx + 8);
      t.setAttribute('y', fy + 4 + interlinia * (k + 1) - 4);
    });
  };
  files.forEach((f, i) => {
    const zona = svg('rect', { class: 'g-zona', x: x(i), y: yCel - 2, width: col, height: baix - yCel + 2 });
    zona.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mostra(i); });
    zona.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') amaga(); });
    zona.addEventListener('click', (e) => {
      e.stopPropagation();
      if (actiu === i && e.pointerType !== 'mouse') amaga();
      else mostra(i);
    });
    g.append(zona);
  });
  g.append(retol);
  fig._amaga = amaga;

  fig.querySelector('.g-llegenda')?.remove();
  const ll = element('p', 'g-llegenda');
  const clau = (classe, text) => {
    const c = element('span', 'g-clau');
    c.append(element('span', classe), text);
    return c;
  };
  // Una clau per cosa, sense explicacions entre parèntesis (Juanjo, 16-10-2026:
  // «es un galimatías»); què vol dir l'alçada ja ho diuen els mm de la barra.
  // Cada clau de pluja, només si n'hi ha (Juanjo, 16-10-2026).
  // Amb les dues, cadascuna pel seu nom; amb una, «Temperatura» o «Part alta».
  if (ambBaixa) ll.append(clau('m-temp', ambAlta ? T('Part baixa') : T('Temperatura')));
  if (ambPrev) {
    const a = opcions.antelacio || 1;
    ll.append(clau('m-prev', T`Previsió ${a}\u00a0h abans`));
  }
  if (ambAlta) ll.append(clau('m-alta', T('Part alta')));
  const plujes = files.map((f) => plujaGrafica(f));
  // La probabilitat en xifres: «probable» i «possible» no es distingeixen
  // (Juanjo, 16-10-2026: «entre lluvia probable y puede llover no hay
  // diferencia para un usuario normal»).
  const pct = (p) => Math.round(p * 100);
  if (plujes.includes('pluja')) ll.append(clau('m-pluja', T`Pluja, ${pct(PROB_PLUJA)}\u00a0% o més`));
  if (plujes.includes('possible')) {
    ll.append(clau('m-pluja possible', T`Pluja, del ${pct(PROB_POSSIBLE)} al ${pct(PROB_PLUJA)}\u00a0%`));
  }
  if (plujes.includes('poca')) {
    ll.append(clau('m-pluja poca', T`Pluja, del ${pct(PROB_POCA)} al ${pct(PROB_POSSIBLE)}\u00a0%`));
  }
  const intenses = files.filter((f) => plujaGrafica(f)).map((f) => intensitatPluja(f.pluja_mm || 0));
  if (intenses.includes('forta')) ll.append(clau('m-pluja forta', T('Pluja forta')));
  if (intenses.includes('torrencial')) ll.append(clau('m-pluja torrencial', T('Pluja torrencial')));
  if (hVent) ll.append(clau('m-vent', T('Vent')), clau('m-ratxa', T('Ratxes')));
  ll.append(clau('m-nit', T('Nit')));
  if (fig._botoImatge) ll.append(botoImatge(fig, 'g-imatge'));
  // Els avisos de més enllà de la gràfica, a sobre (avisosMesEnlla).
  fig.querySelector('.g-mes-enlla')?.remove();
  const mesEnlla = files.length && new Date(files[n - 1].fins) > new Date() ? avisosMesEnlla(files[n - 1].fins) : [];
  if (mesEnlla.length) {
    const caixa = element('div', 'g-mes-enlla');
    caixa.append(...mesEnlla);
    g.before(caixa);
  }
  fig.append(ll);
}

// --- La gràfica en gran (Juanjo, 17-10-2026: «verlo en su propia ventana …
// con posibilidad de alguna configuració»): a sobre de la pàgina, amb marge,
// i amb la seva adreça (#grafica) per compartir-la. Es tria quines hores (avui,
// demà o totes) i si s'hi veu el vent; es recorda en aquest dispositiu. ---
// El vent surt per defecte a totes les gràfiques de la web (la portada, la
// vista en gran i «Consultes») i es treu amb «Vent» de la vista en gran; es
// recorda per a totes (Juanjo, 17-10-2026: «el viento aparecerá marcado por
// defecto, aunque el usuario lo podrá quitar» i «también en la página
// inicial»). Clau nova: l'anterior desava «vent: false» sense que ningú
// l'hagués triat, només per haver canviat les hores.
const CLAU_GRAFICA = 'meteo.grafica.2';
const ambVentTriat = () => llegeixOpcionsGrafica().vent !== false;
const altaTriada = () => llegeixOpcionsGrafica().alta === true;
const baixaTriada = () => llegeixOpcionsGrafica().baixa !== false;

function horesVista(tram) {
  const ara = new Date();
  const totes = (HORES_GRAFICA || []).filter((f) => new Date(f.fins) > ara && f.temperatura != null);
  const dia = (f) => new Date(f.hora).toDateString();
  const dema = new Date(ara.getFullYear(), ara.getMonth(), ara.getDate() + 1).toDateString();
  if (tram === 'avui') return totes.filter((f) => dia(f) === ara.toDateString());
  if (tram === 'dema') return totes.filter((f) => dia(f) === dema);
  return totes;
}

function llegeixOpcionsGrafica() {
  try { return JSON.parse(localStorage.getItem(CLAU_GRAFICA)) || {}; } catch (_) { return {}; }
}

function vistaGrafica() {
  if (!HORES_GRAFICA || document.querySelector('dialog.vista-grafica')) return;
  const opcions = { tram: 'tot', vent: true, ...llegeixOpcionsGrafica() };
  const dlg = element('dialog', 'vista-grafica');
  dlg.setAttribute('aria-labelledby', 'vg-titol');
  const cap = element('div', 'vg-cap');
  const titol = element('h2', null, T('Previsió'));
  titol.id = 'vg-titol';
  const fig = figuraGrafica([], T('Gràfica de la previsió hora a hora: perill, cel, temperatura i probabilitat de pluja.'));
  fig.classList.add('gran');
  const comparteixBoto = element('button', 'boto-icona');
  comparteixBoto.type = 'button';
  comparteixBoto.title = T('Comparteix l’enllaç de la gràfica');
  comparteixBoto.setAttribute('aria-label', T('Comparteix l’enllaç de la gràfica'));
  comparteixBoto.append(icona('i-share-2'));
  comparteixBoto.addEventListener('click', () => comparteix());
  // Tancar: la X de sempre, a dalt a la dreta (icona «x» de Lucide).
  const tanca = element('button', 'boto-icona');
  tanca.type = 'button';
  tanca.title = T('Tanca');
  tanca.setAttribute('aria-label', T('Tanca'));
  tanca.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  tanca.addEventListener('click', () => dlg.close());
  const accions = element('div', 'vg-accions');
  accions.append(botoImatge(fig, 'boto-icona'), comparteixBoto, tanca);
  cap.append(titol, accions);

  // L'historial (historial.py): ‹ i › per anar dia a dia enrere, fins al
  // primer que hi ha, i «Avui» per tornar (Juanjo, 17-10-2026: «que se pueda
  // ir hacia atrás sin límite»). Avui, les hores passades també hi són.
  let dia = null;
  let index = null;
  const dies = new Map();
  const navega = element('div', 'vg-dia');
  const enrere = element('button', 'boto-icona');
  enrere.type = 'button';
  enrere.title = T('Dia anterior');
  enrere.setAttribute('aria-label', T('Dia anterior'));
  enrere.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const endavant = element('button', 'boto-icona');
  endavant.type = 'button';
  endavant.title = T('Dia següent');
  endavant.setAttribute('aria-label', T('Dia següent'));
  endavant.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const nomDia = element('span', 'vg-nom-dia', T('Avui'));
  const tornaAvui = element('button', 'vg-opcio', T('Avui'));
  tornaAvui.type = 'button';
  navega.append(enrere, nomDia, endavant, tornaAvui);
  const encertEl = element('div', 'vg-encert');
  // L'antelació de la previsió que es compara, d'1 a 23 h (Juanjo,
  // 17-10-2026: «si elijo 1h, me salga la gráfica con lo que se predijo 1h
  // antes de cada hora y con el error, lo mismo con 2h, etc»); amb «Com encerta».
  const ANTELACIO_MAX = 23;
  const antelacio = element('div', 'vg-antelacio');
  const menys = element('button', 'boto-icona');
  menys.type = 'button';
  menys.title = T('Menys antelació');
  menys.setAttribute('aria-label', T('Menys antelació'));
  menys.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const mes = element('button', 'boto-icona');
  mes.type = 'button';
  mes.title = T('Més antelació');
  mes.setAttribute('aria-label', T('Més antelació'));
  mes.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const nomAntelacio = element('span', 'vg-nom-antelacio');
  antelacio.append(element('span', null, T('Antelació')), menys, nomAntelacio, mes);
  // Les hores passades, amb la previsió de l'antelació triada.
  const ambAntelacio = (files, a) => files.map((f) => {
    const v = f.prev && f.prev[String(a)];
    const { prev, ...resta } = f;
    return v ? { ...resta, prev: { temperatura: v[0], probabilitat: v[1] } } : resta;
  });
  const avuiIso = () => {
    const a = new Date();
    return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`;
  };
  const passats = () => ((index && index.dies) || []).filter((d) => d < avuiIso());
  const llegeixDia = (d) => {
    if (!dies.has(d)) dies.set(d, llegeixHistorial(`historial-${d}.json`).catch(() => null));
    return dies.get(d);
  };

  // Les opcions: quines hores (només les que tenen prou hores) i el vent.
  const tramsBotons = element('div', 'vg-trams');
  tramsBotons.setAttribute('role', 'group');
  tramsBotons.setAttribute('aria-label', T('Quines hores'));
  const trams = [['avui', T('Avui')], ['dema', T('Demà')], ['tot', T('Tot')]]
    .filter(([clau]) => clau === 'tot' || horesVista(clau).length >= 3);
  if (!trams.some(([clau]) => clau === opcions.tram)) opcions.tram = 'tot';
  const vent = element('button', 'vg-opcio');
  vent.type = 'button';
  vent.append(icona('i-wind'), T('Vent'));
  const ambVent = HORES_GRAFICA.some((f) => f.vent != null);
  const baixa = element('button', 'vg-opcio');
  baixa.type = 'button';
  baixa.append(icona('i-waves'), T('Part baixa'));
  const alta = element('button', 'vg-opcio');
  alta.type = 'button';
  alta.append(icona('i-mountain'), T('Part alta'));
  // El passat (les hores d'avui ja passades, la previsió de les 7 i l'encert),
  // només amb aquest botó: per defecte, la previsió sola, sense barrejar-la
  // (Juanjo, 17-10-2026: «debe salir como antes, la estimación pasada hazla
  // a través de un botón que la active»).
  const encerta = element('button', 'vg-opcio');
  encerta.type = 'button';
  encerta.append(icona('i-target'), T('Com encerta'));
  const ambDifAlta = HORES_GRAFICA.some((f) => f.dif_alta != null);
  const desa = () => {
    try { localStorage.setItem(CLAU_GRAFICA, JSON.stringify(opcions)); } catch (_) {}
  };
  const dibuixa = async () => {
    for (const b of tramsBotons.children) b.setAttribute('aria-pressed', String(b.dataset.tram === opcions.tram));
    vent.setAttribute('aria-pressed', String(opcions.vent));
    alta.setAttribute('aria-pressed', String(Boolean(opcions.alta)));
    baixa.setAttribute('aria-pressed', String(opcions.baixa !== false));
    encerta.setAttribute('aria-pressed', String(Boolean(opcions.passat)));
    const a = Math.min(ANTELACIO_MAX, Math.max(1, opcions.antelacio || 1));
    antelacio.hidden = !opcions.passat;
    menys.disabled = a <= 1;
    mes.disabled = a >= ANTELACIO_MAX;
    nomAntelacio.textContent = `${a}\u00a0h`;
    const llista = passats();
    const pos = dia ? llista.indexOf(dia) : llista.length;
    enrere.disabled = pos <= 0;
    endavant.disabled = !dia;
    tornaAvui.hidden = !dia;
    // Els dies passats, només amb «Com encerta».
    navega.hidden = !llista.length || !opcions.passat;
    titol.textContent = dia ? T('Historial') : T('Previsió');
    // Als dies passats, només el botó del passat.
    for (const b of barra.children) b.hidden = Boolean(dia) && b !== encerta;
    fig._amaga?.();
    if (dia) {
      // Un dia passat: el que es va mesurar, sencer.
      const d = new Date(`${dia}T12:00`);
      const codi = IDIOMA.codi === 'es' ? 'es' : 'ca';
      nomDia.textContent = d.toLocaleDateString(codi, { weekday: 'long', day: 'numeric', month: 'long' });
      const dades = await llegeixDia(dia);
      // Sense «Com encerta», només el que es va mesurar.
      fig._files = dades ? (opcions.passat ? ambAntelacio(dades.hores, a) : dades.hores.map(({ prev, ...f }) => f)) : [];
      fig._opcions = { gran: true, baixa: true, antelacio: a };
      encertEl.replaceChildren(...(opcions.passat ? textEncertDia(dades, a) : []));
    } else {
      nomDia.textContent = T('Avui');
      let files = horesVista(opcions.tram);
      // Avui (o tot), amb «Com encerta»: davant, les hores que ja han passat
      // avui, mesurades, amb la previsió de les 7.
      if (opcions.passat && opcions.tram !== 'dema' && files.length) {
        const avui = index && index.dies.includes(avuiIso()) ? await llegeixDia(avuiIso()) : null;
        const ini = new Date(files[0].hora);
        const passades = ambAntelacio(((avui && avui.hores) || []).filter((f) => new Date(f.fins) <= ini), a);
        files = [...passades, ...files];
      }
      fig._files = files;
      fig._opcions = { gran: true, vent: ambVent && opcions.vent, alta: ambDifAlta && Boolean(opcions.alta),
        baixa: opcions.baixa !== false, antelacio: a };
      encertEl.replaceChildren(...(opcions.passat ? textEncert(index, a) : []));
    }
    dibuixaGrafica(fig);
  };
  enrere.addEventListener('click', () => {
    const llista = passats();
    dia = llista[(dia ? llista.indexOf(dia) : llista.length) - 1] || dia;
    dibuixa();
  });
  endavant.addEventListener('click', () => {
    const llista = passats();
    dia = llista[llista.indexOf(dia) + 1] || null;
    dibuixa();
  });
  tornaAvui.addEventListener('click', () => { dia = null; dibuixa(); });
  for (const [clau, text] of trams) {
    const b = element('button', 'vg-opcio', text);
    b.type = 'button';
    b.dataset.tram = clau;
    b.addEventListener('click', () => { opcions.tram = clau; desa(); dibuixa(); });
    tramsBotons.append(b);
  }
  vent.addEventListener('click', () => { opcions.vent = !opcions.vent; desa(); dibuixa(); });
  alta.addEventListener('click', () => { opcions.alta = !opcions.alta; desa(); dibuixa(); });
  baixa.addEventListener('click', () => { opcions.baixa = opcions.baixa === false; desa(); dibuixa(); });
  // Sense «Com encerta», de nou avui i la previsió de sempre (Juanjo,
  // 17-10-2026: «si se desmarca el botón com encerta … debe volver al día de
  // hoy y mostrar la predicción estándar»).
  encerta.addEventListener('click', () => {
    opcions.passat = !opcions.passat;
    if (!opcions.passat) dia = null;
    desa();
    dibuixa();
  });
  const canviaAntelacio = (d) => {
    opcions.antelacio = Math.min(ANTELACIO_MAX, Math.max(1, (opcions.antelacio || 1) + d));
    desa();
    dibuixa();
  };
  menys.addEventListener('click', () => canviaAntelacio(-1));
  mes.addEventListener('click', () => canviaAntelacio(1));
  const barra = element('div', 'vg-opcions');
  barra.append(tramsBotons);
  if (ambVent) barra.append(vent);
  barra.append(baixa);
  if (ambDifAlta) barra.append(alta);
  barra.append(encerta);

  // Dalt, què es veu; a sota, la navegació en el temps junta, el dia i
  // l'antelació, en una fila si hi caben (Juanjo, 17-10-2026: «así la
  // navegación temporal queda junta»).
  const temps = element('div', 'vg-temps');
  temps.append(navega, antelacio);
  dlg.append(cap, barra, temps, fig, encertEl);
  // Un toc fora de la finestra la tanca, com Esc.
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
  dlg.addEventListener('close', () => {
    dlg.remove();
    // Les altres gràfiques de la pàgina, amb el vent que s'hi hagi triat.
    dibuixaGrafiques();
    if (location.hash === '#grafica') history.replaceState(null, '', location.pathname + location.search);
  });
  document.body.append(dlg);
  dlg.showModal();
  if (location.hash !== '#grafica') history.replaceState(null, '', '#grafica');
  navega.hidden = true;
  dibuixa();
  tanca.focus();
  // L'índex de l'historial arriba després: llavors, les fletxes i l'encert.
  llegeixHistorial('historial.json').then((d) => { index = d; dibuixa(); }, () => {});
}

// L'historial és a IONOS, al costat de les dades; en local, al costat de la pàgina.
function llegeixHistorial(nom) {
  return baixa(DADES_URL + nom).catch(() => baixa(nom));
}

// --- Com encerta la previsió (Juanjo, 17-10-2026: «algún índice o indicador
// de lo buena que es la predicción»): la de les 7 de cada dia contra el que
// es mesura (historial.py). Dit com a conclusió, amb els casos, i només si n'hi
// ha prou; si no, que encara n'hi ha pocs. ---
function textTemperaturaEncert(t, minim) {
  if (!t || t.error == null || t.hores < minim) {
    const hores = t ? t.hores : 0;
    return T`Temperatura: encara poques dades (${hores} hores).`;
  }
  return T`Temperatura: s’equivoca de mitjana ${coma(t.error)}\u00a0°C.`;
}

function textPlujaEncert(p, minim) {
  const [plouSi, plou] = p.plou;
  const [secSi, sec] = p.sec;
  if (plou < minim || sec < minim) {
    return T`Pluja: encara poques dades (${plou} hores amb pluja prevista).`;
  }
  const a = Math.round((plouSi / plou) * 10);
  const b = Math.round((secSi / sec) * 10);
  return T`Pluja: quan diu que plourà (50\u00a0% o més), plou ${a} de cada 10 vegades; quan diu que no (menys del 20\u00a0%), no plou ${b} de cada 10.`;
}

function textEncert(index, a) {
  if (!index || !index.encert || !index.encert[String(a)]) return [];
  const { darrers, anteriors, mesos } = index.encert[String(a)];
  const m = index.minims || {};
  const res = [element('p', 'vg-encert-titol', T`Com encerta la previsió feta ${a}\u00a0h abans (darrers 30 dies)`)];
  let temp = textTemperaturaEncert(darrers.temperatura, m.temperatura_hores || 48);
  if (anteriors.temperatura.error != null && anteriors.temperatura.hores >= (m.temperatura_hores || 48)
      && darrers.temperatura.hores >= (m.temperatura_hores || 48)) {
    temp += ' ' + T`Els 30 dies anteriors, ${coma(anteriors.temperatura.error)}\u00a0°C.`;
  }
  res.push(element('p', null, temp), element('p', null, textPlujaEncert(darrers.pluja, m.pluja_casos || 20)));
  // Per mesos, quan n'hi ha més d'un: si millora amb el temps.
  const llista = Object.entries(mesos || {}).filter(([, e]) => e.temperatura.error != null);
  if (llista.length > 1) {
    const codi = IDIOMA.codi === 'es' ? 'es' : 'ca';
    const nom = (k) => new Date(`${k}-15T12:00`).toLocaleDateString(codi, { month: 'long', year: 'numeric' });
    const text = llista.map(([k, e]) => `${nom(k)}, ${coma(e.temperatura.error)}\u00a0°C`).join('; ');
    res.push(element('p', null, T`Temperatura per mesos: ${text}.`));
  }
  return res;
}

function textEncertDia(dades, a) {
  if (!dades) return [element('p', null, T('Aquest dia no es pot llegir.'))];
  const e = dades.encert && dades.encert[String(a)];
  if (!e || (!e.temperatura.hores && !(e.pluja.plou[1] + e.pluja.sec[1]))) {
    return [element('p', null, T('D’aquest dia no hi ha previsions per comparar.'))];
  }
  const res = [element('p', 'vg-encert-titol', T`Com va encertar la previsió feta ${a}\u00a0h abans`)];
  if (e.temperatura.error != null) {
    res.push(element('p', null, T`Temperatura: s’equivoca de mitjana ${coma(e.temperatura.error)}\u00a0°C.`));
  }
  const casos = e.pluja.plou[1] + e.pluja.sec[1];
  if (casos) {
    const encerts = e.pluja.plou[0] + e.pluja.sec[0];
    res.push(element('p', null, T`Pluja: va encertar ${encerts} de ${casos} hores.`));
  }
  return res;
}

// Si s'ha obert l'enllaç de la gràfica (#grafica), en gran, la primera vegada.
let obertaGrafica = false;
function obreGraficaDeLEnllac() {
  if (obertaGrafica || location.hash !== '#grafica') return;
  obertaGrafica = true;
  vistaGrafica();
}
addEventListener('hashchange', () => { if (location.hash === '#grafica') vistaGrafica(); });

// --- La gràfica com a imatge, des de la web i la app (Juanjo, 17-10-2026: «se
// puede añadir a la gráfica una captura? … incluiría la misma información que
// la de telegram»): el que es veu (les hores triades, el vent, els colors del
// tema) i, a sota, els crèdits de la imatge de Telegram (grafica_imatge.py).
// La fa el navegador: la gràfica ja és SVG; s'hi copien els estils calculats,
// les icones, la llegenda i els crèdits, i es passa a PNG amb un canvas. Al
// mòbil s'obre el menú de compartir amb la imatge; on no n'hi ha, es baixa. ---

// L'hora de les dades de la gràfica: la posen casa.js i consultes.js.
let GENERAT_GRAFICA = null;
// Les dades amb els avisos (smp de Meteocat i avisos de l'AEMET), per als de
// més enllà de la gràfica: també les posen casa.js i consultes.js.
let AVISOS_GRAFICA = null;

// Els avisos oficials que comencen després de l'última hora de la gràfica (que
// arriba a demà a les 21 h), un per dia, amb el color del nivell i el seu
// origen, cap a la seva fitxa de «Perill» (Juanjo, 17-10-2026: el perill molt
// alt de Meteocat de dilluns no sortia enlloc de la gràfica ni dels trams).
function avisosMesEnlla(fiIso) {
  const d = AVISOS_GRAFICA;
  if (!d) return [];
  const fi = new Date(fiIso);
  const NIVELL_SMP = { mig: 'groc', alt: 'taronja', maxim: 'vermell' };
  const nivellSmp = (p) => NIVELL_SMP[p <= 2 ? 'mig' : p <= 4 ? 'alt' : 'maxim'];
  const fenomenSmp = (m) => ([['violent', 'temps_violent'], ['pluja', 'pluja'], ['neu', 'neu'], ['vent', 'vent'],
    ['calor', 'calor'], ['fred', 'fred']].find(([k]) => (m || '').toLowerCase().includes(k)) || [null, m])[1];
  const perDia = new Map();
  const afegeix = (dia, e) => {
    if (!perDia.has(dia)) perDia.set(dia, []);
    perDia.get(dia).push(e);
  };
  for (const a of (d.smp && d.smp.avisos) || []) {
    for (const [dia, franges] of Object.entries(a.dies || {})) {
      if (franges.some(([h]) => new Date(`${dia}T${String(h).padStart(2, '0')}:00`) >= fi)) {
        const fenomen = fenomenSmp(a.meteor);
        afegeix(dia, { nivell: nivellSmp(a.perill), nom: TD(fenomen), font: 'meteocat', fenomen });
      }
    }
  }
  for (const a of d.avisos || []) {
    if (a.cobert || new Date(a.inicio) < fi) continue;
    const dia = a.inicio.slice(0, 10);
    afegeix(dia, { nivell: a.nivel, nom: TD(a.tipo), font: 'aemet', fenomen: a.tipo });
  }
  const codi = IDIOMA.codi === 'es' ? 'es' : 'ca';
  return [...perDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, elements]) => {
    const p = delNivellMesAlt(elements);
    const nom = new Date(`${dia}T12:00`).toLocaleDateString(codi, { weekday: 'long', day: 'numeric' });
    const text = `${nom.charAt(0).toUpperCase()}${nom.slice(1)}: ${textPerillCurt(p, true, true)}`;
    const a = element('a', `g-mes-enlla-avis ${p.nivell}`);
    // La fitxa, en tocar-lo: l'historial de «Perill» pot arribar després de dibuixar.
    const fitxa = () => fitxaDeLinia(p.perFont[0][0] === 'meteocat' ? 'Meteocat' : `AEMET ${p.noms.join(' ')}`);
    a.href = fitxa();
    a.addEventListener('click', () => { a.href = fitxa(); });
    a.title = textPerill(p);
    a.append(element('span', 'g-mes-enlla-marca'), text);
    return a;
  });
}

function creditsGrafica() {
  const g = GENERAT_GRAFICA ? new Date(GENERAT_GRAFICA) : new Date();
  const codi = IDIOMA.codi === 'es' ? 'es' : 'ca';
  const dia = `${g.toLocaleDateString(codi, { weekday: 'long' })} ${g.toLocaleDateString(codi, { day: 'numeric', month: 'long' })}`;
  const hora = g.toLocaleTimeString(codi, { hour: '2-digit', minute: '2-digit' });
  return [T`Temps a Montflorit (Cerdanyola del Vallès) · previsió de ${dia}, ${hora} · meteo-montflorit.github.io`,
    T('No és oficial: si l’AEMET, Meteocat o Protecció Civil donen un avís, mana el seu.')];
}

const ESTILS_SVG = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'paint-order', 'font-family', 'font-size', 'font-weight',
  'stop-color', 'stop-opacity', 'color'];
const VARS_ICONES = ['--ic-sol', '--ic-sol-fons', '--ic-nuvol', '--ic-nuvol-fons', '--ic-aigua', '--ic-aigua-fons',
  '--ic-neu', '--ic-lluna', '--ic-lluna-fons'];

function svgDeLaGrafica(fig) {
  const orig = fig.querySelector('svg');
  const caixa = fig.getBoundingClientRect();
  const marge = 16;
  const W = caixa.width;
  const estil = getComputedStyle(fig);
  const arrel = getComputedStyle(document.documentElement);
  const fons = arrel.getPropertyValue('--superficie').trim() || '#fff';
  const suau = arrel.getPropertyValue('--suau').trim() || '#64748b';
  const lletra = estil.fontFamily;
  const g = orig.cloneNode(true);
  // Els estils calculats, element per element: fora de la pàgina no hi ha el CSS.
  const origs = [orig, ...orig.querySelectorAll('*')];
  [g, ...g.querySelectorAll('*')].forEach((e, i) => {
    const c = getComputedStyle(origs[i]);
    e.setAttribute('style', ESTILS_SVG.map((p) => `${p}:${c.getPropertyValue(p)}`).join(';'));
  });
  // Ni la fitxa de l'hora ni la columna marcada.
  g.querySelector('.g-retol')?.replaceChildren();
  // Les icones: els símbols que fa servir, amb els colors del cel.
  const defs = document.createElementNS(SVG_NS, 'defs');
  for (const id of new Set([...g.querySelectorAll('use')].map((u) => u.getAttribute('href')))) {
    const s = document.querySelector(id);
    if (s) defs.append(s.cloneNode(true));
  }
  g.prepend(defs);
  g.setAttribute('style', VARS_ICONES.map((v) => `${v}:${estil.getPropertyValue(v).trim()}`).join(';'));
  const alt = parseFloat(orig.getAttribute('height'));
  const peca = (nom, atributs, text) => svg(nom, atributs, text);
  const tot = document.createElementNS(SVG_NS, 'svg');
  tot.setAttribute('xmlns', SVG_NS);
  tot.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const cos = peca('g', { transform: `translate(${marge},${marge})` });
  g.setAttribute('x', 0);
  g.setAttribute('y', 0);
  cos.append(g);
  // La llegenda, on és a la pantalla: cada mostra amb el seu color i el text.
  const ll = fig.querySelector('.g-llegenda');
  let y = alt;
  if (ll) {
    const lc = getComputedStyle(ll);
    for (const clau of ll.querySelectorAll('.g-clau')) {
      const m = clau.firstElementChild;
      const r = m.getBoundingClientRect();
      const ms = getComputedStyle(m);
      const x0 = r.left - caixa.left;
      const y0 = r.top - caixa.top;
      if (ms.borderTopStyle === 'dashed' || ms.borderTopStyle === 'dotted') {
        cos.append(peca('line', { x1: x0, x2: x0 + r.width, y1: y0 + 1, y2: y0 + 1,
          style: `stroke:${ms.borderTopColor};stroke-width:2;stroke-dasharray:4 3` }));
      } else {
        cos.append(peca('rect', { x: x0, y: y0, width: r.width, height: Math.max(r.height, 2), rx: 1,
          style: `fill:${ms.backgroundColor};stroke:${ms.borderTopStyle === 'solid' ? ms.borderTopColor : 'none'}` }));
      }
      const t = [...clau.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      cos.append(peca('text', { x: x0 + r.width + 5, y: y0 + r.height / 2,
        style: `fill:${lc.color};font-family:${lletra};font-size:${lc.fontSize};dominant-baseline:central` }, t));
    }
    y = ll.getBoundingClientRect().bottom - caixa.top;
  }
  // Els crèdits, com a la imatge de Telegram; al mòbil, partits en línies
  // que hi càpiguen, pels « · » si es pot.
  const mida = document.createElement('canvas').getContext('2d');
  mida.font = `13px ${lletra}`;
  const cap = (t) => mida.measureText(t).width <= W;
  const linies = creditsGrafica().flatMap((l) => {
    const res = [];
    for (const tros of l.split(' · ')) {
      const prova = res.length ? `${res[res.length - 1]} · ${tros}` : tros;
      if (res.length && cap(prova)) res[res.length - 1] = prova;
      else res.push(tros);
    }
    return res.flatMap((r) => {
      if (cap(r)) return [r];
      const parts = [];
      for (const paraula of r.split(' ')) {
        const prova = parts.length ? `${parts[parts.length - 1]} ${paraula}` : paraula;
        if (parts.length && cap(prova)) parts[parts.length - 1] = prova;
        else parts.push(paraula);
      }
      return parts;
    });
  });
  linies.forEach((l, k) => cos.append(peca('text', { x: 0, y: y + 22 + k * 19,
    style: `fill:${suau};font-family:${lletra};font-size:13px` }, l)));
  const H = y + 22 + linies.length * 19 + marge;
  tot.setAttribute('width', W + 2 * marge);
  tot.setAttribute('height', H);
  tot.setAttribute('viewBox', `0 0 ${W + 2 * marge} ${H}`);
  tot.append(peca('rect', { width: W + 2 * marge, height: H, style: `fill:${fons}` }), cos);
  return tot;
}

function pngDeLaGrafica(fig, escala = 2) {
  const s = svgDeLaGrafica(fig);
  const W = parseFloat(s.getAttribute('width'));
  const H = parseFloat(s.getAttribute('height'));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)], { type: 'image/svg+xml' }));
  return new Promise((resol, falla) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * escala);
      c.height = Math.round(H * escala);
      const ctx = c.getContext('2d');
      ctx.scale(escala, escala);
      ctx.drawImage(im, 0, 0, W, H);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resol(b) : falla(new Error('png'))), 'image/png');
    };
    im.onerror = () => { URL.revokeObjectURL(url); falla(new Error('svg')); };
    im.src = url;
  });
}

// Al mòbil, el menú de compartir amb la imatge; on no n'hi ha (l'ordinador),
// es copia al porta-retalls, a punt per enganxar (Juanjo, 17-10-2026: «no
// quiero que se baje, quiero que se copie la imagen»). La còpia es demana
// dins del mateix clic, amb la imatge encara per fer (Safari no deixa
// copiar després d'esperar). Si el navegador no deixa copiar, la imatge en
// una finestra, per copiar-la amb el botó dret o mantenint-la premuda.
function nomImatge() {
  const g = GENERAT_GRAFICA ? new Date(GENERAT_GRAFICA) : new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `temps-montflorit-${g.getFullYear()}-${dos(g.getMonth() + 1)}-${dos(g.getDate())}-${dos(g.getHours())}${dos(g.getMinutes())}.png`;
}

function potCompartirImatges() {
  try {
    return Boolean(navigator.canShare) && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] });
  } catch (_) {
    return false;
  }
}

function comparteixImatge(fig) {
  const png = pngDeLaGrafica(fig);
  if (potCompartirImatges()) {
    png.then((blob) => navigator.share({ files: [new File([blob], nomImatge(), { type: 'image/png' })],
      title: 'Temps a Montflorit', text: creditsGrafica()[0] }))
      .catch((e) => { if (e.name !== 'AbortError') mostraImatge(png); });
    return;
  }
  if (navigator.clipboard && window.ClipboardItem) {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      .then(() => avisBreu(T('Imatge copiada')), () => mostraImatge(png));
    return;
  }
  mostraImatge(png);
}

function mostraImatge(png) {
  png.then((blob) => {
    const visor = element('dialog', 'visor');
    const im = element('img');
    im.src = URL.createObjectURL(blob);
    im.alt = T('Gràfica de la previsió hora a hora: perill, cel, temperatura i probabilitat de pluja.');
    const tanca = element('button', 'visor-tanca');
    tanca.type = 'button';
    tanca.title = T('Tanca');
    tanca.setAttribute('aria-label', T('Tanca'));
    tanca.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    tanca.addEventListener('click', () => visor.close());
    visor.append(im, element('p', 'visor-nota', T('Copia la imatge amb el botó dret o mantenint-la premuda.')), tanca);
    visor.addEventListener('click', (e) => { if (e.target === visor) visor.close(); });
    visor.addEventListener('close', () => { URL.revokeObjectURL(im.src); visor.remove(); });
    document.body.append(visor);
    visor.showModal();
  }, () => avisBreu(T('No s’ha pogut fer la imatge.')));
}

// La càmera: a la vista en gran, al costat de compartir l'enllaç; a
// «Consultes», al final de la llegenda.
function botoImatge(fig, classe) {
  const b = element('button', classe);
  b.type = 'button';
  b.title = T('Comparteix la imatge de la gràfica');
  b.setAttribute('aria-label', T('Comparteix la imatge de la gràfica'));
  b.append(icona('i-camera'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    comparteixImatge(fig);
  });
  return b;
}

function dibuixaGrafiques() {
  for (const fig of document.querySelectorAll('figure.grafica')) dibuixaGrafica(fig);
}
addEventListener('resize', dibuixaGrafiques);
// Tocar fora de la gràfica treu el rètol de l'hora.
addEventListener('click', () => {
  for (const fig of document.querySelectorAll('figure.grafica')) fig._amaga?.();
});

