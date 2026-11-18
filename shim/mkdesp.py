import re, json, sys
SRC='/root/.claude/projects/-home-claude/103683da-1df8-5b27-996f-121b00dcb90d/tool-results/artifact-77a94cad-1792153128-5fee.html'
OUT='/home/claude/build/components/despesas/'
t=open(SRC,encoding='utf-8').read()
# CSS
a=t.index('<style>',t.index('fonts.googleapis.com/css2')); b=t.index('</style>',a)
css=t[a+7:b]
# markup
m0=t.index('<div class="wrap" id="app">'); m1=t.index('<script src=',m0)
html=t[m0:m1]
# dados
d0=t.index('<script id="dados" type="application/json">')+len('<script id="dados" type="application/json">'); d1=t.index('</script>',d0)
dados=json.loads(t[d0:d1])
# js
j0=t.index('<script>',d1)+8; j1=t.index('</script>',j0)
js=t[j0:j1].strip()

# ---- dados: zera Oficina e Peças
n=len(dados['cols']['ofi'])
dados['cols']['ofi']=[0]*n; dados['cols']['pec']=[0]*n
open(OUT+'dados.json','w',encoding='utf-8').write(json.dumps(dados,separators=(',',':'),ensure_ascii=False))

# ---- css escopado (nesting)
css=css.replace(':root{','&{',1)
css=re.sub(r'\nbody\{background:var\(--bg\);color:var\(--ink\);font-family:var\(--f-ui\);font-size:14px;line-height:1\.4;\n[^}]*\}',
           '\n&{background:var(--bg);color:var(--ink);font-family:var(--f-ui);font-size:14px;line-height:1.4}',css)
assert 'padding-block:0 40px' not in css
css=css.replace('.ring{display:flex','.ring{box-shadow:none;display:flex')
css='#dsp{\n'+css+'\n}\n'
open(OUT+'panel.css','w',encoding='utf-8').write(css)

# ---- html
html=re.sub(r'<div class="logo"><img[^>]*></div>\s*','',html)
assert '<img' not in html
html=html.replace('<div class="toast" id="toast" hidden></div>','<div class="toast" id="toast" hidden></div>')
open(OUT+'panel.html','w',encoding='utf-8').write(html)

# ---- js
def sub1(old,new):
    global js
    assert js.count(old)==1,(old,js.count(old))
    js=js.replace(old,new)
sub1("(function(){\n'use strict';","export default function run(){\n'use strict';")
assert js.rstrip().endswith('})();')
js=js.rstrip()[:-5]+'}\n'
sub1("{k:9,n:'Oficina'},{k:10,n:'Peças'}","")
sub1("{k:8,n:'Salário Motorista'},","{k:8,n:'Salário Motorista'}")
sub1("let ORIG=JSON.parse($('dados').textContent), D=ORIG;","let ORIG=window.__dspOrig||(window.__dspOrig=JSON.parse(window.__dspRaw)), D=window.__dspCur||ORIG;")
sub1("function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}","function cssv(n){return getComputedStyle($('dsp')).getPropertyValue(n).trim()}")
sub1("function loadData(nd){D=nd;","function loadData(nd){D=nd;window.__dspCur=(nd===ORIG?null:nd);")
sub1("loadData(buildFromRows(rows)); toast(","loadData(buildFromRows(rows)); try{window.__dspPersist&&window.__dspPersist(D)}catch(e){} toast(")
sub1("loadData(ORIG);toast('Base original restaurada.',2500)","loadData(ORIG);try{window.__dspPersist&&window.__dspPersist(null)}catch(e){}toast('Base original restaurada.',2500)")
sub1("if(own===1) for(let k=0;k<10;k++) if(k!==5) ev[k]=0;","ev[8]=0;ev[9]=0; if(own===1) for(let k=0;k<10;k++) if(k!==5) ev[k]=0;")
sub1("todas as despesas: combustível, diárias, descarga, pedágio/travessias, frete extra, descarga extra, motorista, oficina e peças.","todas as despesas: combustível, diárias, descarga, pedágio/travessias, frete extra, descarga extra e motorista (oficina e peças não entram neste relatório).")
sub1("  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>setTimeout(redrawCharts,50));\n  new MutationObserver(()=>setTimeout(redrawCharts,50)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});\n","")
sub1("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();","init();")
open(OUT+'panel.js','w',encoding='utf-8').write(js)
print('ok',len(css),len(html),len(js))
