#!/usr/bin/env node
/*
 * Gera telao-tv.html a partir de telao.html, para navegadores de TV antigos
 * (sem suporte a módulos ES / Firebase SDK / CSS moderno).
 *
 *   node tools/gerar-telao-tv.js        (precisa do `tsc` no PATH)
 *
 * - troca o Firebase SDK por leituras na API REST do Firestore (atualiza a cada 4 s)
 * - compila o JavaScript para ES5
 * - adapta CSS: `gap` em flex e `inset`
 * Sempre que telao.html mudar, rode de novo e envie o telao-tv.html junto.
 */
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'telao.html'), 'utf8');

// ---------- 1. extrai o script principal ----------
const mS = src.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!mS) throw new Error('script module não encontrado');
let js = mS[1];

// ---------- 2. troca a camada Firebase por REST ----------
const ini = js.indexOf('/* ======================= FIREBASE');
const fim = js.indexOf('/* ======================= DEMO');
if (ini < 0 || fim < 0) throw new Error('marcadores FIREBASE/DEMO não encontrados');
const trechoOrig = js.slice(ini, fim);
const mPick = trechoOrig.match(/  const ativos = [\s\S]*?\n\}\n/);
if (!mPick) throw new Error('trecho de escolha de campeonato não encontrado');
const pickUI = mPick[0].replace(/\}\n$/, '');

const rest = `/* ======================= FIRESTORE (REST) ======================= */
function splashMsg(html, sub) { $('#splash').style.display = 'flex'; $('#splash').innerHTML = '<div class="bola">🎾</div><div>' + html + '</div>' + (sub ? '<small>' + sub + '</small>' : ''); }
const FS = 'https://firestore.googleapis.com/v1/projects/' + firebaseConfig.projectId + '/databases/(default)/documents';
function fsVal(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) { const t = Date.parse(String(v.timestampValue).replace(/\\.\\d+Z$/, 'Z')); return { seconds: Math.floor(t / 1000), nanoseconds: 0 }; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal);
  if ('mapValue' in v) return fsObj(v.mapValue.fields);
  return null;
}
function fsObj(f) { const o = {}; Object.keys(f || {}).forEach(k => { o[k] = fsVal(f[k]); }); return o; }
function http(url) {
  return new Promise((ok, err) => {
    const x = new XMLHttpRequest(); x.open('GET', url); x.timeout = 20000;
    x.onload = () => { if (x.status >= 200 && x.status < 300) { try { ok(JSON.parse(x.responseText)); } catch (e) { err(e); } } else { const e = new Error('HTTP ' + x.status); e.status = x.status; err(e); } };
    x.onerror = () => err(new Error('sem conexão')); x.ontimeout = () => err(new Error('tempo esgotado')); x.send();
  });
}
const segs = p => p.split('/').map(encodeURIComponent).join('/');
function idDe(nome) { const i = nome.split('/').pop(); try { return /%[0-9A-Fa-f]{2}/.test(i) ? decodeURIComponent(i) : i; } catch (e) { return i; } }
async function fsLista(caminho) {
  let docs = [], tok = '';
  do {
    const r = await http(FS + '/' + segs(caminho) + '?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    docs = docs.concat(r.documents || []); tok = r.nextPageToken || '';
  } while (tok);
  return docs.map(d => ({ id: idDe(d.name), data: fsObj(d.fields) }));
}
async function iniciarFirebase() {
  if (!ID) return escolherCampeonato();
  let ultCamp = null, ultInsc = null, antJogos = null, rankingCarregado = null;
  const erro = e => {
    console.error(e);
    if (e && e.status === 404) { splashMsg('Campeonato não encontrado', 'Use Esc para escolher outro.'); return; }
    setConexao(false);
    if (!S.iniciou) splashMsg('Não foi possível ler os dados', e && e.status === 403 ? 'Sem permissão de leitura no banco.' : 'Verifique a internet da TV. (' + (e && e.message) + ')');
  };
  async function ciclo() {
    try {
      const res = await Promise.all([
        http(FS + '/campeonatos/' + encodeURIComponent(ID)),
        fsLista('campeonatos/' + ID + '/inscritos'),
        fsLista('campeonatos/' + ID + '/jogos')
      ]);
      const c = fsObj(res[0].fields), jc = JSON.stringify(c);
      setConexao(true);
      if (jc !== ultCamp) { ultCamp = jc; onCamp(c); }
      if (c.ranking && c.ranking !== rankingCarregado) {
        rankingCarregado = c.ranking;
        fsLista('rankings/' + c.ranking + '/jogadores').then(l => { const r = {}; l.forEach(d => { r[d.data.nome] = d.data.pontos || 0; }); S.rank = r; }).catch(() => {});
      }
      const ins = res[1].map(d => d.data).sort((a, b) => ((a.dataCriacao && a.dataCriacao.seconds) || 0) - ((b.dataCriacao && b.dataCriacao.seconds) || 0));
      const ji = JSON.stringify(ins);
      if (ji !== ultInsc) { ultInsc = ji; onInscritos(ins); }
      const mapa = {}, jm = {}; res[2].forEach(d => { mapa[d.id] = d.data; jm[d.id] = JSON.stringify(d.data); });
      const alt = antJogos ? Object.keys(jm).filter(id => antJogos[id] !== jm[id]) : [];
      if (antJogos === null || alt.length || Object.keys(jm).length !== Object.keys(antJogos).length) { antJogos = jm; onJogos(mapa, alt); }
    } catch (e) { erro(e); }
    setTimeout(ciclo, 4000);
  }
  ciclo();
}
async function escolherCampeonato() {
  const l = await fsLista('campeonatos');
  const lista = l.map(d => Object.assign({ id: d.id }, d.data)).sort((a, b) => ((b.dataCriacao && b.dataCriacao.seconds) || 0) - ((a.dataCriacao && a.dataCriacao.seconds) || 0));
${pickUI}}

`;
js = js.slice(0, ini) + rest + js.slice(fim);

// links/redirecionamentos continuam na versão TV
js = js.replace(/telao\.html/g, 'telao-tv.html');
// NodeList -> array sem depender de iterador
js = js.replace(/\[\.\.\.(document\.querySelectorAll\([^)]*\))\]/g, 'Array.prototype.slice.call($1)');
// Web Animations pode não existir: cai no caminho de erro (que já coloca o nome no lugar)
js = js.replace('const an = chip.animate(', 'const an = chip.animate ? chip.animate(')
       .replace("{ duration: voo, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });", "{ duration: voo, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' }) : { finished: Promise.reject(new Error('sem animate')) };");
// versão local deste arquivo
js = js.replace(/telao-tv\.html\?escolher=1/g, 'telao-tv.html?escolher=1');

// ---------- 3. compila para ES5 ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-'));
fs.writeFileSync(path.join(tmp, 'in.js'), js);
// precisa do TypeScript 5.x/6.x (o 7 removeu o alvo ES5). Use TSC=/caminho/typescript/bin/tsc para indicar outro.
const tscCands = [process.env.TSC, '/opt/npm-tools/node_modules/typescript/bin/tsc', '/opt/node-tools/node_modules/typescript/bin/tsc'].filter(Boolean);
try { tscCands.unshift(require.resolve('typescript/bin/tsc')); } catch (e) {}
const tsc = tscCands.find(f => fs.existsSync(f));
if (!tsc) throw new Error('TypeScript não encontrado (npm i -g typescript@6)');
try {
  cp.execFileSync('node', [tsc, path.join(tmp, 'in.js'), '--allowJs', '--target', 'ES5', '--ignoreDeprecations', '6.0', '--lib', 'es2017,dom,dom.iterable', '--downlevelIteration', '--outFile', path.join(tmp, 'out.js'), '--skipLibCheck'], { stdio: 'pipe' });
} catch (e) { /* tsc pode reportar avisos de tipo mesmo emitindo; conferimos o arquivo abaixo */ }
if (!fs.existsSync(path.join(tmp, 'out.js'))) throw new Error('tsc não gerou saída');
let es5 = fs.readFileSync(path.join(tmp, 'out.js'), 'utf8');

// ---------- 4. polyfills mínimos ----------
const poly = `(function(){
  var P=Array.prototype,S=String.prototype,O=Object;
  if(!O.assign)O.assign=function(t){for(var i=1;i<arguments.length;i++){var s=arguments[i];if(s)for(var k in s)if(O.prototype.hasOwnProperty.call(s,k))t[k]=s[k];}return t;};
  if(!O.entries)O.entries=function(o){return O.keys(o).map(function(k){return[k,o[k]];});};
  if(!O.values)O.values=function(o){return O.keys(o).map(function(k){return o[k];});};
  if(!P.includes)P.includes=function(x){return this.indexOf(x)>=0;};
  if(!P.find)P.find=function(f){for(var i=0;i<this.length;i++)if(f(this[i],i,this))return this[i];};
  if(!P.findIndex)P.findIndex=function(f){for(var i=0;i<this.length;i++)if(f(this[i],i,this))return i;return -1;};
  if(!P.fill)P.fill=function(v){for(var i=0;i<this.length;i++)this[i]=v;return this;};
  if(!Array.from)Array.from=function(a,f){var r=[],n=a.length>>>0,i;if(a.length==null&&a.forEach){a.forEach(function(x){r.push(x);});}else for(i=0;i<n;i++)r.push(a[i]);return f?r.map(f):r;};
  if(!S.includes)S.includes=function(x,i){return this.indexOf(x,i)>=0;};
  if(!S.startsWith)S.startsWith=function(x,i){i=i||0;return this.substr(i,x.length)===x;};
  if(!S.endsWith)S.endsWith=function(x){return this.length>=x.length&&this.slice(this.length-x.length)===x;};
  if(!S.repeat)S.repeat=function(n){return new Array(n+1).join(this);};
  if(!S.padStart)S.padStart=function(n,c){var s=String(this);c=c==null?' ':String(c);while(s.length<n)s=c+s;return s;};
  if(!S.padEnd)S.padEnd=function(n,c){var s=String(this);c=c==null?' ':String(c);while(s.length<n)s=s+c;return s;};
  if(!Math.trunc)Math.trunc=function(x){return x<0?Math.ceil(x):Math.floor(x);};
  if(!Math.log2)Math.log2=function(x){return Math.log(x)/Math.LN2;};
  if(!Number.isFinite)Number.isFinite=function(x){return typeof x==='number'&&isFinite(x);};
  var E=window.Element&&Element.prototype;
  if(E&&!E.matches)E.matches=E.webkitMatchesSelector||E.msMatchesSelector;
  if(E&&!E.closest)E.closest=function(s){var e=this;while(e&&e.nodeType===1){if(e.matches(s))return e;e=e.parentElement;}return null;};
  if(E&&!E.remove)E.remove=function(){if(this.parentNode)this.parentNode.removeChild(this);};
  if(window.Promise&&!Promise.prototype.finally)Promise.prototype.finally=function(f){return this.then(function(v){return Promise.resolve(f()).then(function(){return v;});},function(e){return Promise.resolve(f()).then(function(){throw e;});});};
})();
`;

// ---------- 5. CSS legado ----------
function cssLegado(css) {
  css = css.replace(/inset:0([;}])/g, 'top:0;right:0;bottom:0;left:0$1');
  let extra = '';
  css.replace(/([^{}@]+)\{([^{}]*)\}/g, (m, sel, corpo) => {
    const g = corpo.match(/(?:^|;)\s*gap:\s*([^;}]+)/);
    if (!g || !/display:\s*flex/.test(corpo)) return m;
    const col = /flex-direction:\s*column/.test(corpo);
    const alvo = sel.split(',').map(s => s.trim() + '>*+*').join(',');
    extra += alvo + '{' + (col ? 'margin-top:' : 'margin-left:') + g[1].trim() + '}\n';
    return m;
  });
  css = css.replace(/(^|[;{\s])gap:/g, '$1grid-gap:'); // grid antigo entende grid-gap
  return css + '\n/* gap de flex emulado */\n' + extra;
}
const mC = src.match(/<style>([\s\S]*?)<\/style>/);
const css = cssLegado(mC[1]);

// ---------- 6. monta o HTML ----------
let html = src.replace(mS[0], () => '<script>\n' + poly + es5 + '\n</script>');
html = html.replace(mC[0], () => '<style>' + css + '</style>');
html = html.replace(/\s*<script nomodule>[\s\S]*?<\/script>/, '');
html = html.replace('<title>', '<title>[TV] ');
html = html.replace('</head>', '<!-- GERADO por tools/gerar-telao-tv.js a partir de telao.html. Não edite à mão. -->\n</head>');
fs.writeFileSync(path.join(raiz, 'telao-tv.html'), html);
console.log('telao-tv.html gerado (' + Math.round(html.length / 1024) + ' KB)');
