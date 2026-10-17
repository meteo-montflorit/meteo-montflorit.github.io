// SPDX-License-Identifier: AGPL-3.0-or-later
// «Perill» (ADR 0071): les situacions de perill a Montflorit, ara i durant
// l'últim any, amb el mateix text dels avisos del mòbil i de Telegram. Cada
// situació, una fitxa amb el començament i, si ja ha acabat, el final
// (Juanjo, 11-10-2026). A dalt, les actives; després, les dels últims
// DIES_RECENTS dies; els mesos d'abans, plegats, un per mes.
// Les dades, l'historial que deixa avisos_bot.py a avisos.json.

const FITXER_AVISOS = 'avisos.json';
const DIES_RECENTS = 30;
const RELLEGEIX_MIN = 5;
// El color de la fitxa, el del cercle amb què comença l'avís; l'incendi, que
// no té nivell, porta 🔥 i la franja vermella (ADR 0071).
const CLASSE_CERCLE = { '🔴': 'vermell', '🟠': 'taronja', '🟡': 'groc', '🔥': 'vermell' };

const idiomaText = () => (IDIOMA.codi === 'es' ? 'es' : 'ca');
// On s'expliquen els avisos propis: la riera (tipus «riera») i el temps
// extrem (episodi «propi»), a «Com funciona» (ADR 0076).
const EXPLICACIONS = { riera: 'com-funciona.html#riera', propi: 'com-funciona.html#temps-extrem' };
const locale = () => (IDIOMA.codi === 'es' ? 'es-ES' : 'ca-ES');

// Quan ha acabat: el missatge de final o, en els avisos de l'AEMET, que no en
// tenen, l'hora fins a la qual valien.
function finalDe(e, ara) {
  if (e.fi) return e.fi;
  if (e.fins && new Date(e.fins) <= ara) return e.fins;
  return null;
}

function dia(iso) {
  return new Date(iso).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function moment(iso) {
  return `${dia(iso)}, ${horaCurta(iso)}`;
}

// «Des de dg. 11/10, 23:30»; «Dg. 11/10, de 23:30 a 23:55», o, si passa la
// mitjanit, «De dg. 11/10, 23:30 a dl. 12/10, 00:30».
function quan(e, fi) {
  if (!fi) return T`Des de ${moment(e.inici)}`;
  if (dia(e.inici) === dia(fi)) {
    const d = dia(e.inici);
    return T`${d.charAt(0).toUpperCase() + d.slice(1)}, de ${horaCurta(e.inici)} a ${horaCurta(fi)}`;
  }
  return T`De ${moment(e.inici)} a ${moment(fi)}`;
}

function nodesText(linies) {
  return linies.filter((l) => l.length).map((l) => {
    const p = element('p');
    p.append(...nodesLinia(l));
    return p;
  });
}


// El que es comparteix d'un avís: el missatge sencer, sense les línies que
// només són un enllaç (ja hi va el de la fitxa) i, si ha acabat, el final
// (ADR 0076).
function textCompartit(linies) {
  return linies.filter((l) => l.length && !l.every((t) => t.href || !t.t.trim()))
    .map((l) => l.map((t) => t.t).join('').trim()).join('\n');
}

function botoCompartir(id, titol, text = '') {
  const b = element('button', 'compartir-avis');
  b.type = 'button';
  b.title = T('Comparteix aquest avís');
  b.setAttribute('aria-label', T('Comparteix aquest avís'));
  b.append(icona('i-share-2'));
  const url = new URL(location.href);
  url.hash = id;
  b.addEventListener('click', () => comparteix(url.href, titol, text));
  return b;
}

function fitxa(e, ara) {
  const text = e[idiomaText()] || e.ca;
  const [primera, ...resta] = trossos(text);
  const cercle = [...((primera[0] || {}).t || '')][0];
  const fi = finalDe(e, ara);
  // Les acabades, en gris: el color del nivell, només per al que passa ara
  // (Juanjo, 12-10-2026; ADR 0074).
  const art = element('article', `avis-item episodi ${CLASSE_CERCLE[cercle] || 'compte'}${fi ? ' acabat' : ''}`);
  art.id = idFitxa(e);
  const titol = element('p', 'episodi-titol');
  titol.append(...nodesLinia(primera));
  const cap = element('div', 'episodi-cap');
  const textFi = fi && (e[`fi_${idiomaText()}`] || e.fi_ca);
  const compartit = textCompartit([primera, ...resta, ...(textFi ? trossos(textFi) : [])]);
  cap.append(titol, botoCompartir(art.id, primera.map((t) => t.t).join('').trim(), compartit));
  const estat = element('p', 'episodi-quan');
  if (fi && e.substituit_per) {
    // No ha acabat: ara se'n mostra un altre, el de Meteocat (ADR 0093) o un
    // altre de l'AEMET que l'inclou (17-10-2026).
    const a = element('a', null, e.substituit_per.clau.startsWith('aemet:') ? T('un altre avís de l’AEMET')
      : T('l’avís de Meteocat'));
    a.href = `#${idFitxa(e.substituit_per)}`;
    estat.append(element('span', 'episodi-substituit', T('Substituït per ')), a, ' · ');
  } else if (fi && e.fora_zona) {
    // No s'ha apagat: ha sortit de la zona que vigila la web (ADR 0071).
    estat.append(element('span', 'episodi-substituit', T('Fora de la zona')), ' · ');
  } else if (fi) estat.append(element('span', 'episodi-acabat', `🟢 ${T('Acabat')}`), ' · ');
  else estat.append(element('span', 'episodi-actiu', T('Actiu ara')), ' · ');
  estat.append(quan(e, fi));
  // L'última actualització, com a «Avisos actius» (Juanjo, 17-10-2026).
  const pub = !fi && publicacioEpisodi(e);
  if (pub && pub.actualitzat) estat.append(` · ${textPublicacio(pub)}`);
  art.append(cap, estat);
  const cos = nodesText(resta);
  // Els avisos que calcula aquesta web (la riera i el temps extrem) no tenen
  // cap font oficial on ampliar-los: porten a «Com funciona», on s'expliquen
  // amb paraules corrents, no a la metodologia (Juanjo, 12-10-2026; ADR 0076).
  const explicacio = EXPLICACIONS[e.tipus === 'riera' ? 'riera' : e.clau];
  if (explicacio) {
    const p = element('p');
    const a = element('a', null, T('Què vol dir aquest avís'));
    a.href = explicacio;
    p.append(a);
    cos.push(p);
  }
  // El comunicat més recent d'un pla de Protecció Civil (ADR 0091) o, si no,
  // Més informació, si el text no porta ja un enllaç (ADR 0071).
  const comunicat = !explicacio && e.comunicat;
  const enllac = comunicat || (!explicacio && e.enllac && (e.enllac[idiomaText()] || e.enllac.ca));
  if (enllac && (comunicat || !/<a href=/.test(text))) {
    const p = element('p');
    const a = element('a', null, comunicat ? T('Comunicat de Protecció Civil (PDF)') : T('Més informació'));
    a.href = enllac;
    a.target = '_blank';
    a.rel = 'noopener';
    p.append(a);
    cos.push(p);
  }
  if (textFi) cos.push(...nodesText(trossos(textFi)));
  if (!fi) {
    art.append(...cos);
  } else if (cos.length) {
    // Les acabades, amb el detall plegat dins la fitxa.
    const plec = element('details', 'episodi-detall');
    plec.append(element('summary', null, T('Detalls')), ...cos);
    art.append(plec);
  }
  return art;
}

// El nom del mes, fet aquí: Firefox i Safari no diuen igual «agost de 2026».
const MESOS = {
  ca: ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny', 'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'],
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
};

// El Pla Alfa de Cerdanyola des del nivell 3 i els tancaments de Collserola:
// només a «Ara», sense avís ni historial, perquè canvia cada dia (ADR 0071).
const PLA_ALFA = 'https://interior.gencat.cat/ca/arees_dactuacio/agents-rurals/pla-alfa/';

function fitxaAlfa(alfa) {
  if (!alfa) return null;
  const dies = [['avui', T('avui')], ['dema', T('demà')]].filter(([d]) => alfa[d] != null && alfa[d] >= ALFA_NIVELL_MOSTRAR);
  const tancats = alfa.tancaments || [];
  if (!dies.length && !tancats.length) return null;
  const maxim = Math.max(0, ...dies.map(([d]) => alfa[d]));
  const art = element('article', `avis-item episodi ${maxim >= 4 || !dies.length ? 'vermell' : 'taronja'}`);
  // Amb el seu botó de compartir, com les altres fitxes (Juanjo, 12-10-2026;
  // ADR 0075). Una adreça fixa: obre el Pla Alfa del dia en què s'obre.
  art.id = 'pla-alfa';
  const titol = element('p', 'episodi-titol');
  const nivells = dies.map(([d, nom]) => T`nivell ${alfa[d]} ${nom}`).join(', ');
  const text = nivells ? T`Pla Alfa de Cerdanyola: ${nivells}` : T('Agents Rurals: espais naturals tancats');
  titol.append(element('strong', null, `${maxim >= 4 || !dies.length ? '🔴' : '🟠'} ${text}`));
  const linies = [...(dies.length ? [T('Accés restringit als espais forestals.')] : []),
    ...tancats.map((t) => T`Tancat: ${t.espai}.`)];
  const cap = element('div', 'episodi-cap');
  cap.append(titol, botoCompartir(art.id, text, [text, ...linies].join('\n')));
  art.append(cap, element('p', 'episodi-quan', T('El fixen cada dia els Agents Rurals; no arriba com a avís.')));
  for (const l of linies) art.append(element('p', null, l));
  const p = element('p');
  const a = element('a', null, T('Més informació'));
  a.href = PLA_ALFA;
  a.target = '_blank';
  a.rel = 'noopener';
  p.append(a);
  art.append(p);
  return art;
}

// Els plans de Protecció Civil en prealerta (ADR 0091): no avisen (ADR 0051)
// i no tenen fitxa a l'historial; aquí, a «Ara», com el Pla Alfa, amb el que
// en diu Protecció Civil i el seu comunicat. El motiu, en l'idioma en què el
// publica Protecció Civil.
const PROTECCIO_CIVIL = {
  ca: 'https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/',
  es: 'https://interior.gencat.cat/es/arees_dactuacio/proteccio_civil/',
};

function fitxaPla(p) {
  const art = element('article', 'avis-item episodi prealerta');
  art.id = idPla(p);
  const text = T`Protecció Civil: pla ${TD(p.nom)} (${p.pla}) en fase ${deFase(TD(NOM_FASE[p.fase] || p.fase))}.`;
  const titol = element('p', 'episodi-titol');
  titol.append(element('strong', null, `🟡 ${text}`));
  const sentit = SENTIT_FASE[p.fase] ? SENTIT_FASE[p.fase]() : '';
  const motiu = p.descripcio ? T`Motiu, segons Protecció Civil: ${p.descripcio}.` : '';
  const cap = element('div', 'episodi-cap');
  cap.append(titol, botoCompartir(art.id, text.replace(/\.$/, ''), [text, sentit, motiu].filter(Boolean).join('\n')));
  const estat = element('p', 'episodi-quan');
  const des = dataPla(p.des_de);
  estat.append(element('span', 'episodi-actiu', T('Actiu ara')), ' · ',
    des ? T`Des de ${moment(des)}` : '', des ? '. ' : '', T('La prealerta no arriba com a avís.'));
  art.append(cap, estat);
  if (sentit) art.append(element('p', null, sentit));
  if (motiu) art.append(element('p', null, motiu));
  const enllac = element('p');
  const a = element('a', null, p.comunicat ? T('Comunicat de Protecció Civil (PDF)') : T('Més informació'));
  a.href = p.comunicat || PROTECCIO_CIVIL[idiomaText()];
  a.target = '_blank';
  a.rel = 'noopener';
  enllac.append(a);
  art.append(enllac);
  return art;
}

function nomMes(iso) {
  const t = new Date(iso);
  return `${MESOS[idiomaText()][t.getMonth()]} de ${t.getFullYear()}`;
}

function pinta(dades, ara = new Date()) {
  const historial = [...(dades.historial || [])].sort((a, b) => new Date(b.inici) - new Date(a.inici));
  const actius = historial.filter((e) => !finalDe(e, ara));
  const limit = new Date(ara.getTime() - DIES_RECENTS * 86400000);
  const acabats = historial.filter((e) => finalDe(e, ara));
  const recents = acabats.filter((e) => new Date(e.inici) >= limit);
  const antics = acabats.filter((e) => new Date(e.inici) < limit);
  const peces = [element('h2', 'seccio', T('Ara'))];
  const alfa = fitxaAlfa(dades.pla_alfa);
  if (actius.length) peces.push(...actius.map((e) => fitxa(e, ara)));
  if (alfa) peces.push(alfa);
  const prealerta = (dades.plans_prealerta || []).map(fitxaPla);
  peces.push(...prealerta);
  if (!actius.length && !alfa && !prealerta.length) peces.push(element('p', 'nota', T('Ara no hi ha cap situació de perill.')));
  peces.push(element('h2', 'seccio', T`Últims ${DIES_RECENTS} dies`));
  // Plegats, com els mesos d'abans (Juanjo, 17-10-2026: «els últims 30 dies
  // han de estar plegados, ahora mismo hay demasiada información»); un enllaç
  // a una de les seves fitxes l'obre (vesA).
  if (recents.length) {
    const plec = element('details', 'mes-perill');
    const n = recents.length;
    plec.append(element('summary', null, n === 1 ? T('1 situació') : T`${n} situacions`),
      ...recents.map((e) => fitxa(e, ara)));
    peces.push(plec);
  } else peces.push(element('p', 'nota', T`Cap situació de perill acabada en els últims ${DIES_RECENTS} dies.`));
  // Els mesos d'abans, plegats, del més recent al més antic.
  const mesos = new Map();
  for (const e of antics) {
    const clau = e.inici.slice(0, 7);
    if (!mesos.has(clau)) mesos.set(clau, []);
    mesos.get(clau).push(e);
  }
  if (mesos.size) {
    peces.push(element('h2', 'seccio', T('Abans')));
    for (const llista of mesos.values()) {
      const plec = element('details', 'mes-perill');
      const n = llista.length;
      plec.append(element('summary', null, `${nomMes(llista[0].inici)} · ${n === 1 ? T('1 situació') : T`${n} situacions`}`),
        ...llista.map((e) => fitxa(e, ara)));
      peces.push(plec);
    }
  }
  $('perill').replaceChildren(...peces);
  // Vist fins ara: la pestanya ja no ha de senyalar res d'abans (comu.js).
  try { localStorage.setItem(CLAU_PERILL_VIST, ara.toISOString()); } catch (_) {}
  $('avis-dades').hidden = true;
  if (dades.versio) posaVersio(dades.versio);
}

// Si s'ha obert l'enllaç d'un avís: s'hi va, es desplega (també el mes que el
// conté) i es destaca una estona. Només la primera vegada que es pinta.
let anatAlAvis = false;

function vesAlAvis() {
  if (anatAlAvis || !location.hash) return;
  anatAlAvis = true;
  vesA(location.hash.slice(1));
}

function vesA(id) {
  const art = id && document.getElementById(id);
  if (!art) return;
  art.closest('details.mes-perill')?.setAttribute('open', '');
  art.querySelector('details')?.setAttribute('open', '');
  assenyala(art);
}
// Un enllaç dins de la pàgina («Substituït per l'avís de Meteocat»), també.
window.addEventListener('hashchange', () => vesA(location.hash.slice(1)));

function llegeix() {
  llegeixDades(FITXER_AVISOS).then((d) => { pinta(d); vesAlAvis(); }, () => {
    if ($('perill').querySelector('.carregant')) {
      $('perill').replaceChildren();
      $('avis-dades').textContent = T('No s’han pogut carregar els avisos. Torna-ho a provar d’aquí a una estona.');
      $('avis-dades').hidden = false;
    }
  });
}

llegeix();
setInterval(llegeix, RELLEGEIX_MIN * 60000);
// Un avís que arriba amb la pàgina oberta, de seguida (ADR 0048).
enArribarUnAvis(llegeix);
