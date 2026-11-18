export default function run(){
'use strict';
const BUILD='16/10/2026';
const $=id=>document.getElementById(id);
const MES_ABR=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MES_FULL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MEAS=['fat','comb','diar','desc','trav','fext','fter','dext','mot','ofi','pec','viag','conh'];
const CATS=[{k:1,n:'Combustível'},{k:2,n:'Diárias'},{k:3,n:'Descarga'},{k:4,n:'Pedágio / Travessias'},{k:5,n:'Frete Extra'},{k:6,n:'Frete Terceiros'},{k:7,n:'Descarga Extra'},{k:8,n:'Salário Motorista'}];
const DIMS=[['filial','Filial'],['own','Tipo Frota'],['bloco','Bloco'],['tveic','Tipo Veículo'],['drv','Motorista'],['placa','Placa'],['rota','Rota'],['prest','Prestação']];
const ICO={up:'<svg class="ico" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',dn:'<svg class="ico" viewBox="0 0 24 24"><path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/></svg>',fl:'<svg class="ico" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>'};

let ORIG=window.__dspOrig||(window.__dspOrig=JSON.parse(window.__dspRaw)), D=window.__dspCur||ORIG;
const S={ano:'',mes:'',periodo:'',filial:'',own:'',bloco:'',tveic:'',drv:'',placa:'',rota:'',prest:'',q:'',cmp:'same',bad:'excl',view:'fat',tab:'t',sort:'y1',dir:-1,qd:'',page:'ov',fold:false,rdim:'filial',rsort:'dF',rdir:-1,rq:''};
let M=null, CM=[], Y0=0, Y1=0, YMAX=0, HP=true, charts={};

/* ---------- formatadores ---------- */
const nf=(d)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const n0=nf(0),n1=nf(1),n2=nf(2);
const brl=v=>(v<0?'-':'')+'R$ '+n2.format(Math.abs(v));
function brlc(v){const a=Math.abs(v),s=v<0?'-':'';
  if(a>=1e9)return s+'R$ '+n2.format(a/1e9)+' bi'; if(a>=1e6)return s+'R$ '+n2.format(a/1e6)+' mi';
  if(a>=1e4)return s+'R$ '+n1.format(a/1e3)+' mil'; return s+'R$ '+n2.format(a)}
const pc=(v,d=1)=>v==null?'–':(v>0?'+':'')+nf(d).format(v)+'%';
const pcs=(v,d=1)=>v==null?'–':nf(d).format(v)+'%';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function chip(p,goodDown){ if(p==null||!isFinite(p))return '<span class="chip flat">'+ICO.fl+'–</span>';
  if(Math.abs(p)<0.05)return '<span class="chip flat">'+ICO.fl+'0,0%</span>';
  const down=p<0, good=goodDown?down:!down;
  return '<span class="chip '+(good?'good':'bad')+'">'+(down?ICO.dn:ICO.up)+pc(p)+'</span>'}
const vr=(a,b)=>({abs:b-a,pct:a?(b-a)/Math.abs(a)*100:null});

/* ---------- agregação ---------- */
function setup(){
  if(!D.years)D.years=[...new Set(D.cols.ano)].sort();
  const ys=D.years;
  Y1=ys[ys.length-1]; Y0=ys.length>1?ys[ys.length-2]:Y1-1;
  const C=D.cols, f1=[]; for(let m=0;m<=12;m++)f1.push(0);
  for(let i=0;i<C.ano.length;i++) if(C.ano[i]===Y1) f1[C.mes[i]]+=C.fat[i];
  CM=[]; for(let m=1;m<=12;m++) if(f1[m]>0) CM.push(m);
  YMAX=Y1;
  S.ano=''; S.mes=''; // filtros dependem da base
}
const isBad=(y,m)=>D.bad.some(b=>b[0]===y&&b[1]===m);
function periodoMonths(p){return ({'t1':[1,2,3],'t2':[4,5,6],'t3':[7,8,9],'t4':[10,11,12],'s1':[1,2,3,4,5,6],'s2':[7,8,9,10,11,12]})[p]||null}
function applyYears(){
  const fy=S.ano?+S.ano:YMAX;
  Y1=fy; HP=D.years.indexOf(fy-1)>=0; Y0=HP?fy-1:'—';
}
function rowFilter(){
  const C=D.cols, pm=periodoMonths(S.periodo), mesF=S.mes?+S.mes:0;
  const fl={}; ['filial','own','bloco','tveic','rota','prest'].forEach(k=>{fl[k]=S[k]===''?-1:+S[k]});
  const tm={}; ['drv','placa'].forEach(k=>{const q=S[k].trim().toLowerCase(); if(q)tm[k]=Uint8Array.from(D.dic[k],v=>v.toLowerCase().includes(q)?1:0)});
  const q=S.q.trim().toLowerCase(); let qm=null;
  if(q){qm={}; ['filial','bloco','tveic','prest','rota','placa','drv'].forEach(k=>{qm[k]=Uint8Array.from(D.dic[k],v=>v.toLowerCase().includes(q)?1:0)})}
  return function(i){
    const m=C.mes[i]; if(mesF&&m!==mesF)return false; if(pm&&pm.indexOf(m)<0)return false;
    if(fl.own>=0&&C.own[i]!==fl.own)return false;
    if(fl.filial>=0&&C.filial[i]!==fl.filial)return false; if(fl.bloco>=0&&C.bloco[i]!==fl.bloco)return false;
    if(fl.tveic>=0&&C.tveic[i]!==fl.tveic)return false; if(fl.rota>=0&&C.rota[i]!==fl.rota)return false;
    if(fl.prest>=0&&C.prest[i]!==fl.prest)return false;
    if(tm.drv&&!tm.drv[C.drv[i]])return false; if(tm.placa&&!tm.placa[C.placa[i]])return false;
    if(qm&&!(qm.filial[C.filial[i]]||qm.bloco[C.bloco[i]]||qm.tveic[C.tveic[i]]||qm.prest[C.prest[i]]||qm.rota[C.rota[i]]||qm.placa[C.placa[i]]||qm.drv[C.drv[i]]))return false;
    return true;
  }
}
function expCols(){const C=D.cols;return [C.comb,C.diar,C.desc,C.trav,C.fext,C.fter,C.dext,C.mot,C.ofi,C.pec]}
function compute(){
  applyYears();
  const C=D.cols,N=C.ano.length,acc=new Float64Array(2*2*13*13), ok=rowFilter(), ex=expCols();
  let used=0;
  for(let i=0;i<N;i++){
    const y=C.ano[i]; const yi=y===Y1?1:(y===Y0?0:-1); if(yi<0)continue;
    if(!ok(i))continue;
    const m=C.mes[i]; used++;
    const b=((yi*2+C.own[i])*13+m)*13;
    acc[b]+=C.fat[i]; acc[b+11]+=C.viag[i]; acc[b+12]+=C.conh[i];
    if(!(S.bad==='excl'&&isBad(y,m))) for(let k=0;k<10;k++) acc[b+1+k]+=ex[k][i];
  }
  M={acc,used};
}
function computeRank(dim){
  const C=D.cols,N=C.ano.length,L=D.dic[dim].length, ok=rowFilter(), ex=expCols();
  const R={fF:new Float64Array(L),dF:new Float64Array(L),vF:new Float64Array(L),fT:new Float64Array(L),dT:new Float64Array(L),vT:new Float64Array(L),n:new Uint32Array(L)};
  for(let i=0;i<N;i++){
    if(C.ano[i]!==Y1||!ok(i))continue;
    const id=C[dim][i], m=C.mes[i]; R.n[id]++;
    if(C.own[i]===0){R.fF[id]+=C.fat[i];R.vF[id]+=C.viag[i]; if(!(S.bad==='excl'&&isBad(Y1,m))) for(let k=0;k<10;k++)R.dF[id]+=ex[k][i]}
    else{R.fT[id]+=C.fat[i];R.vT[id]+=C.viag[i]; if(!(S.bad==='excl'&&isBad(Y1,m))) R.dT[id]+=C.fter[i]}
  }
  const rows=[]; for(let id=0;id<L;id++) if(R.n[id]){const fF=R.fF[id],dF=R.dF[id],fT=R.fT[id],dT=R.dT[id],vF=R.vF[id];
    rows.push({name:D.dic[dim][id],fF,dF,vF,fT,dT,pctT:fT?dT/fT*100:null,pct:fF?dF/fF*100:null,cpv:vF?dF/vF:null,part:(fF+fT)?fT/(fF+fT)*100:null})}
  return rows;
}
const A=(yi,own,m,k)=>M.acc[((yi*2+own)*13+m)*13+k];
function months(yi,kind){
  const all=[1,2,3,4,5,6,7,8,9,10,11,12];
  if(yi===1) return kind==='exp'&&S.bad==='excl'?all.filter(m=>!isBad(Y1,m)):all;
  const sameActive=S.cmp==='same'&&!S.mes&&!S.periodo&&CM.length>0;
  let ms=sameActive?CM:all;
  if(kind==='exp'&&S.cmp==='same'&&S.bad==='excl') ms=ms.filter(m=>!isBad(Y1,m));
  return ms;
}
function sum(yi,own,k,kind){const ms=months(yi,kind||(k>=1&&k<=10?'exp':'fat'));let t=0;
  for(const m of ms){ if(own<0)t+=A(yi,0,m,k)+A(yi,1,m,k); else t+=A(yi,own,m,k)} return t}
function desp(yi,own,ms){ms=ms||months(yi,'exp');let t=0;for(const m of ms)for(let k=1;k<=10;k++){ if(own<0)t+=A(yi,0,m,k)+A(yi,1,m,k); else t+=A(yi,own,m,k)} return t}
const mdesp=(yi,own,m)=>desp(yi,own,[m]);
const mfat=(yi,own,m)=>A(yi,own,m,0);

/* ---------- render: KPIs ---------- */
const bico={f:['var(--frota-soft)','var(--frota)'],t:['var(--terc-soft)','var(--terc)'],g:['var(--geral-soft)','var(--geral)']};
const SVG={truck:'<svg class="ico" viewBox="0 0 24 24"><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
 users:'<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
 coins:'<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="9" r="6"/><path d="M15 9.5A6 6 0 1 1 9.5 15M9 6.5v5"/></svg>',
 pie:'<svg class="ico" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
 dn:'<svg class="ico" viewBox="0 0 24 24"><path d="M7 7l10 10M17 8v9H8"/></svg>',up:'<svg class="ico" viewBox="0 0 24 24"><path d="M7 17L17 7M8 7h9v9"/></svg>'};
function ringSvg(p,color){const r=26,c=2*Math.PI*r,d=c*Math.max(0,Math.min(100,p))/100;
  return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="'+r+'" fill="none" stroke="var(--flat-bg)" stroke-width="7"/><circle cx="32" cy="32" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+d.toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 32 32)"/><text x="32" y="36" text-anchor="middle" font-size="12" font-weight="800" fill="var(--ink)" font-family="Manrope,sans-serif">'+n1.format(p)+'%</text></svg>'}
function mwd(){const r=[];for(let m=1;m<=12;m++){if((mfat(1,0,m)+mfat(1,1,m))>0)r.push(m)}return r}
function sv(fn,exp){let ms=mwd(); if(exp&&S.bad==='excl')ms=ms.filter(m=>!isBad(Y1,m));
  if(!ms.length)return{avg:'–',peak:'–',vals:[],ms:[]};
  const vals=ms.map(fn),tot=vals.reduce((a,b)=>a+b,0),i=vals.indexOf(Math.max(...vals));
  return{avg:brlc(tot/ms.length),peak:MES_ABR[ms[i]-1],vals,ms}}
function spark(vals,color){
  const W=220,H=60,p=7,n=vals.length; if(n<2)return '<div class="full">Dados de um único mês</div>';
  const mx=Math.max(...vals),mn=Math.min(...vals),rg=(mx-mn)||1;
  const pts=vals.map((v,i)=>[p+i*(W-2*p)/(n-1),H-p-(v-mn)/rg*(H-2*p)]);
  const line=pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ');
  const im=vals.indexOf(mx);
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolução mensal" style="width:100%;height:auto;max-height:72px;margin:6px 0 2px"><path d="M'+pts[0][0].toFixed(1)+','+(H-p)+' L'+line+' L'+pts[n-1][0].toFixed(1)+','+(H-p)+' Z" fill="'+color+'" opacity=".13"/><polyline points="'+line+'" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="'+pts[im][0].toFixed(1)+'" cy="'+pts[im][1].toFixed(1)+'" r="3.8" fill="'+color+'" stroke="var(--surface)" stroke-width="2"/></svg>';
}
function kpiCard(o){
  const cc=o.cc||o.c.slice(2);
  const foot=HP?'<span>'+Y0+': <b>'+o.prev+'</b></span>'+o.chip:'<span>Média mensal: <b>'+(o.avg||'–')+'</b></span><span class="pk">Pico: <b>'+(o.peak||'–')+'</b></span>';
  return '<div class="kpi s '+o.c+'"><div class="lab"><span>'+o.t+'</span><span class="bico" style="background:'+bico[cc][0]+';color:'+bico[cc][1]+'">'+o.i+'</span></div>'
   +'<div class="big '+cc+'" title="'+o.full+'">'+o.big+'</div><div class="full">'+o.full+'</div><div class="cap">'+o.cap+'</div>'
   +'<div class="foot">'+foot+'</div></div>'}
function renderKpis(){
  const exp=S.view==='desp';
  const f1=sum(1,0,0),t1=sum(1,1,0),f0=sum(0,0,0),t0=sum(0,1,0),a1=f1+t1,a0=f0+t0;
  const dF1=desp(1,0),dT1=desp(1,1),dF0=desp(0,0),dT0=desp(0,1),dA1=dF1+dT1,dA0=dF0+dT0;
  const pr=(a,b)=>b?pcs(a/b*100,2):'–';
  $('kTitle').textContent=exp?'Despesa Operacional (Frota × Terceiros)':'Faturamento Operacional (Frota × Terceiros)';
  $('kSub').textContent=exp?'Frota: todas as despesas • Terceiros: frete pago ('+(HP?Y0+' × '+Y1:Y1)+')':'Indicadores consolidados de receita bruta ('+(HP?Y0+' × '+Y1:Y1)+')';
  const sh=(a,b)=>b?a/b*100:0, h=[];
  const ring=(title,color,p1,p0,sub,val,lab)=>'<div class="kpi"><div class="lab"><span>'+title+'</span><span style="color:'+color+'">'+SVG.pie+'</span></div><div class="ring">'+ringSvg(p1,color)+'<div class="rv"><small>'+sub+'</small><b>'+val+'</b></div></div><div class="foot"><span>'+(HP?Y0+': '+pcs(p0):'Participação em '+Y1)+'</span><b style="font-family:var(--f-ui);color:'+color+'">'+lab+'</b></div></div>';
  const varCard=(title,d,goodDown,subUp,subDn)=>{const good=goodDown?d.abs<=0:d.abs>=0;
    return '<div class="kpi"><div class="lab"><span>'+title+'</span><span class="bico" style="background:'+(good?'var(--good-bg)':'var(--bad-bg)')+';color:'+(good?'var(--good)':'var(--bad)')+'">'+(d.abs<0?SVG.dn:SVG.up)+'</span></div>'
    +'<div class="big" style="font-size:clamp(20px,1.9vw,28px);color:'+(good?'var(--good)':'var(--bad)')+'">'+brlc(d.abs)+'</div><div class="full">'+brl(d.abs)+'</div>'
    +'<div style="display:flex;gap:8px;align-items:center">'+chip(d.pct,goodDown)+'<span style="font-size:12px;color:var(--muted)">'+(d.abs<0?subDn:subUp)+'</span></div>'
    +'<div class="foot"><span>'+Y0+' → '+Y1+'</span><b style="font-family:var(--f-ui)">YoY Comparativo</b></div></div>'};
  const evo=(title,s,color)=>{if(!s.vals.length)return '<div class="kpi"><div class="lab"><span>'+title+'</span></div><div class="full">Sem dados no filtro atual</div></div>';
    const mx=Math.max(...s.vals),mn=Math.min(...s.vals);
    return '<div class="kpi"><div class="lab"><span>'+title+'</span><span style="color:'+color+'">'+SVG.up+'</span></div>'+spark(s.vals,color)
    +'<div class="foot"><span>Pico: <b>'+MES_ABR[s.ms[s.vals.indexOf(mx)]-1]+'</b> '+brlc(mx)+'</span><span>Mín: <b>'+MES_ABR[s.ms[s.vals.indexOf(mn)]-1]+'</b> '+brlc(mn)+'</span></div></div>'};
  if(!exp){
    const sF=sv(m=>mfat(1,0,m)),sT=sv(m=>mfat(1,1,m)),sA=sv(m=>mfat(1,0,m)+mfat(1,1,m));
    h.push(kpiCard({c:'c-f',t:'Faturamento Frota',i:SVG.truck,big:brlc(f1),full:brl(f1),cap:Y1+' • Frota própria',prev:brlc(f0),chip:chip(vr(f0,f1).pct,false),avg:sF.avg,peak:sF.peak}));
    h.push(kpiCard({c:'c-t',t:'Faturamento Terceiros',i:SVG.users,big:brlc(t1),full:brl(t1),cap:Y1+' • Terceirizados',prev:brlc(t0),chip:chip(vr(t0,t1).pct,false),avg:sT.avg,peak:sT.peak}));
    h.push(kpiCard({c:'c-g',t:'Faturamento Geral',i:SVG.coins,big:brlc(a1),full:brl(a1),cap:'Frota + Terceiros ('+Y1+')',prev:brlc(a0),chip:chip(vr(a0,a1).pct,false),avg:sA.avg,peak:sA.peak}));
    h.push(ring('% Faturamento Frota','var(--frota)',sh(f1,a1),sh(f0,a0),'Faturamento '+Y1,brlc(f1),'Frota Própria'));
    h.push(ring('% Faturamento Terceiros','var(--terc)',sh(t1,a1),sh(t0,a0),'Faturamento '+Y1,brlc(t1),'Terceirizados'));
    h.push(HP?varCard('Variação Faturamento',vr(a0,a1),false,'Alta de receita','Queda de receita'):evo('Evolução mensal do faturamento',sA,'var(--geral)'));
  }else{
    const sF=sv(m=>mdesp(1,0,m),true),sT=sv(m=>mdesp(1,1,m),true),sA=sv(m=>mdesp(1,0,m)+mdesp(1,1,m),true);
    h.push(kpiCard({c:'c-f',t:'Despesa Frota',i:SVG.truck,big:brlc(dF1),full:brl(dF1),cap:Y1+' • '+pr(dF1,f1)+' do faturamento',prev:brlc(dF0),chip:chip(vr(dF0,dF1).pct,true),avg:sF.avg,peak:sF.peak}));
    h.push(kpiCard({c:'c-t',t:'Despesa Terceiros (frete)',i:SVG.users,big:brlc(dT1),full:brl(dT1),cap:Y1+' • '+pr(dT1,t1)+' do faturamento',prev:brlc(dT0),chip:chip(vr(dT0,dT1).pct,true),avg:sT.avg,peak:sT.peak}));
    h.push(kpiCard({c:'c-g',t:'Despesa Geral',i:SVG.coins,big:brlc(dA1),full:brl(dA1),cap:'Frota + frete ('+Y1+')',prev:brlc(dA0),chip:chip(vr(dA0,dA1).pct,true),avg:sA.avg,peak:sA.peak}));
    h.push(ring('% Despesa Frota','var(--frota)',sh(dF1,dA1),sh(dF0,dA0),'Despesa '+Y1,brlc(dF1),'Frota Própria'));
    h.push(ring('% Despesa Terceiros','var(--terc)',sh(dT1,dA1),sh(dT0,dA0),'Frete '+Y1,brlc(dT1),'Terceirizados'));
    h.push(HP?varCard('Variação Despesa',vr(dA0,dA1),true,'Alta de despesa','Queda de despesa'):evo('Evolução mensal da despesa',sA,'var(--geral)'));
  }
  $('kpis').innerHTML=h.join('');
}


/* ---------- render: tabela mensal / gráfico ---------- */
function renderMonthly(){
  const mesSel=S.mes?+S.mes:0, mf0=months(0,'fat'), yis=HP?[0,1]:[1];
  const G=[
    {t:'FATURAMENTO FROTA',c:'f',v:(yi,m)=>mfat(yi,0,m)},
    {t:'DESPESAS FROTA',c:'f',v:(yi,m)=>mdesp(yi,0,m),exp:true},
    {t:'FATURAMENTO TERCEIROS',c:'t',v:(yi,m)=>mfat(yi,1,m)},
    {t:'FRETE TERCEIROS (DESPESA)',c:'t',v:(yi,m)=>mdesp(yi,1,m),exp:true},
    {t:'DIFERENÇA FATURAMENTO (TERC. − FROTA)',c:'g',v:(yi,m)=>mfat(yi,1,m)-mfat(yi,0,m),df:true}];
  let body='';
  for(let m=1;m<=12;m++){
    const has1=(mfat(1,0,m)+mfat(1,1,m))>0||(A(1,0,m,11)+A(1,1,m,11))>0, has0=(mfat(0,0,m)+mfat(0,1,m))>0;
    const bad1=has1&&S.bad==='excl'&&isBad(Y1,m), out0=HP&&mf0.indexOf(m)<0;
    body+='<tr class="clk'+(mesSel===m?' sel':'')+(out0?' out':'')+'" data-m="'+m+'"><td>'+MES_ABR[m-1]+'</td>';
    for(const g of G) for(const yi of yis){
      const show=yi===1?has1:has0;
      if(yi===1&&g.exp&&bad1){body+='<td class="'+(yi===yis[0]?'gs':'')+'"><span class="nd" title="Despesas deste mês estão inconsistentes na base e foram excluídas">n/d</span></td>';continue}
      const gs=yi===yis[0]?' gs':'';
      body+=show?'<td class="'+(yi===1?(g.df?'df':g.c):(g.df?'dfp':''))+gs+'">'+brl(g.v(yi,m))+'</td>':'<td class="dim'+gs+'">–</td>';
    }
    body+='</tr>';
  }
  const tot=g=>g.exp?(yi=>desp(yi,g.t.indexOf('TERCEIROS')>=0?1:0)):(g.df?(yi=>sum(yi,1,0)-sum(yi,0,0)):(yi=>sum(yi,g.t.indexOf('TERCEIROS')>=0?1:0,0)));
  const lbl=S.cmp==='same'&&HP&&!S.mes&&!S.periodo?'TOTAL (PERÍODO COMPARÁVEL)':'TOTAL ACUMULADO';
  let h1='<tr><th rowspan="'+(HP?2:1)+'">MÊS</th>', h2='<tr>', ft='<tr><td title="'+lbl+'">TOTAL</td>';
  for(const g of G){ h1+='<th class="gs '+g.c+'"'+(HP?' colspan="2"':'')+'>'+g.t+(HP?'':' • '+Y1)+'</th>';
    if(HP)for(const yi of yis)h2+='<th class="'+g.c+(yi===yis[0]?' gs':'')+'">'+(yi===0?Y0:Y1)+'</th>';
    for(const yi of yis)ft+='<td'+(yi===yis[0]?' class="gs"':'')+'>'+brlc(tot(g)(yi))+'</td>'; }
  $('tabView').innerHTML='<table class="mt"><thead>'+h1+'</tr>'+(HP?h2+'</tr>':'')+'</thead><tbody>'+body+'</tbody><tfoot>'+ft+'</tr></tfoot></table>';
  $('tabView').querySelectorAll('tr.clk').forEach(tr=>tr.addEventListener('click',()=>{const m=tr.dataset.m;S.mes=S.mes===m?'':m;sync();update()}));
  const F1=sum(1,0,0),T1=sum(1,1,0),D1=desp(1,0),R1=desp(1,1), diff=T1-F1, tt=T1+F1, pT=tt?T1/tt*100:0;
  let r='<div>Resultado consolidado '+Y1+': ';
  if(!tt) r+='<b>sem faturamento no filtro atual.</b>';
  else r+=diff>=0?'Terceiros faturou <b>'+brl(diff)+'</b> a mais que a Frota Própria e responde por <b>'+pcs(pT)+'</b> do faturamento total.':'a Frota Própria faturou <b>'+brl(-diff)+'</b> a mais que Terceiros e responde por <b>'+pcs(100-pT)+'</b> do faturamento total.';
  r+='</div>';
  if(tt) r+='<div class="l2">Despesas: Frota <b style="color:var(--frota)">'+brl(D1)+'</b>'+(F1?' ('+pcs(D1/F1*100,2)+' do faturamento)':'')+' e frete de Terceiros <b style="color:var(--terc)">'+brl(R1)+'</b>'+(T1?' ('+pcs(R1/T1*100,2)+' do faturamento)':'')+'. Total de <b>'+brl(D1+R1)+'</b>. As duas operações têm volumes diferentes, por isso vale olhar a proporção sobre o faturamento.</div>';
  $('resumo').innerHTML=r;
  $('mSub').textContent='Faturamento e despesas: Frota × Terceiros ('+(HP?Y0+' / '+Y1:Y1)+')';
  if(S.tab==='g'&&S.page==='ov') drawBar();
}
function cssv(n){return getComputedStyle($('dsp')).getPropertyValue(n).trim()}
function mkBar(el,key,series,fmtTick){
  const lab=MES_ABR, tc=cssv('--muted'), gc=cssv('--line');
  const ds=series.map(d=>({label:d.k,backgroundColor:cssv(d.c),borderRadius:4,borderSkipped:'bottom',maxBarThickness:18,
    data:lab.map((_,i)=>{const m=i+1;
      if(d.yi===1){const has=(mfat(1,0,m)+mfat(1,1,m))>0; if(!has||(d.exp&&S.bad==='excl'&&isBad(Y1,m)))return null}
      return d.fn(d.yi,d.own,m)})}));
  if(charts[key])charts[key].destroy();
  charts[key]=new Chart($(el),{type:'bar',data:{labels:lab,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,
    interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'top',align:'start',labels:{color:cssv('--ink2'),usePointStyle:true,pointStyle:'rectRounded',boxWidth:10,font:{family:'Manrope',weight:'600',size:12}}},
      tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+brl(c.parsed.y)}}},
    scales:{x:{grid:{display:false},ticks:{color:tc,font:{family:'Manrope'}},border:{color:gc}},
      y:{beginAtZero:true,grid:{color:gc},border:{display:false},ticks:{color:tc,font:{family:'IBM Plex Mono',size:11},callback:fmtTick}}}}});
}
function drawBar(){
  if(!window.Chart)return;
  const sr=(list)=>list.filter(d=>HP||d.yi===1);
  mkBar('cvBar','bar',sr([
    {k:'FROTA '+Y0,own:0,yi:0,c:'--c-frota-prev',fn:mfat},{k:'FROTA '+Y1,own:0,yi:1,c:'--c-frota',fn:mfat},
    {k:'TERCEIROS '+Y0,own:1,yi:0,c:'--c-terc-prev',fn:mfat},{k:'TERCEIROS '+Y1,own:1,yi:1,c:'--c-terc',fn:mfat}]),
    v=>n0.format(v/1e6)+' mi');
  mkBar('cvBar2','bar2',sr([
    {k:'DESPESAS FROTA '+Y0,own:0,yi:0,c:'--c-frota-prev',fn:mdesp,exp:true},{k:'DESPESAS FROTA '+Y1,own:0,yi:1,c:'--c-frota',fn:mdesp,exp:true},
    {k:'FRETE TERCEIROS '+Y0,own:1,yi:0,c:'--c-terc-prev',fn:mdesp,exp:true},{k:'FRETE TERCEIROS '+Y1,own:1,yi:1,c:'--c-terc',fn:mdesp,exp:true}]),
    v=>n1.format(v/1e6)+' mi');
}


/* ---------- rosca + legenda ---------- */
function catTotals(yi){return CATS.map(c=>({n:c.n,k:c.k,v:sum(yi,-1,c.k,'exp')}))}
function renderDonut(){
  const list=catTotals(1).filter(c=>c.v>0).sort((a,b)=>b.v-a.v), tot=list.reduce((a,c)=>a+c.v,0);
  $('dTitle').textContent='DISTRIBUIÇÃO DAS DESPESAS ('+Y1+')'; $('dSub').textContent='Frota + frete pago a terceiros • por categoria';
  $('dYear').textContent='TOTAL '+Y1; $('dTot').textContent=brlc(tot);
  const cols=['--cat1','--cat2','--cat3','--cat4','--cat5','--cat6','--cat7'];
  const top=list.slice(0,6), rest=list.slice(6), ro=rest.reduce((a,c)=>a+c.v,0);
  const sl=top.map((c,i)=>({n:c.n,v:c.v,col:cols[i]})); if(ro>0) sl.push({n:'Outros ('+rest.length+')',v:ro,col:'--cat7'});
  if(charts.don)charts.don.destroy();
  charts.don=new Chart($('cvDon'),{type:'doughnut',data:{labels:sl.map(s=>s.n),datasets:[{data:sl.map(s=>s.v),backgroundColor:sl.map(s=>cssv(s.col)),borderColor:cssv('--surface'),borderWidth:2,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,cutout:'66%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.label+': '+brl(c.parsed)+' ('+n1.format(tot?c.parsed/tot*100:0)+'%)'}}}}});
  $('legend').innerHTML=tot?list.map(c=>{const i=top.indexOf(c);const col=i>=0?cols[i]:'--cat7';
    return '<div><i style="background:var('+col+')"></i><span>'+esc(c.n)+'</span><span class="v">'+brl(c.v)+'</span><span class="p">'+n1.format(c.v/tot*100)+'%</span></div>'}).join(''):'<div class="empty" style="display:block">Sem despesas no filtro atual.</div>';
}

/* ---------- quadro comparativo ---------- */
function renderQuadro(){
  const f1=sum(1,0,0),f0=sum(0,0,0),t1=sum(1,1,0),t0=sum(0,1,0),a1=f1+t1;
  const dF1=desp(1,0),dF0=desp(0,0),dT1=desp(1,1),dT0=desp(0,1),dA1=dF1+dT1;
  const vF=sum(1,0,11),vT=sum(1,1,11), pF=a1?f1/a1*100:0, pT=a1?t1/a1*100:0;
  const yoy=(a,b,down)=>HP&&a?chip((b-a)/a*100,down):'<span class="dim">–</span>';
  const row=(l,a,b)=>'<tr><td>'+l+'</td><td class="f">'+a+'</td><td class="t">'+b+'</td></tr>';
  const na='<span class="dim">–</span>';
  let h='<div class="qsub">FROTA × TERCEIROS ('+Y1+')</div>'
   +'<div class="part" role="img" aria-label="Participação no faturamento: Frota '+pcs(pF)+', Terceiros '+pcs(pT)+'"><i style="width:'+pF+'%;background:var(--c-frota)"></i><i style="width:'+pT+'%;background:var(--c-terc)"></i></div>'
   +'<div class="partl"><span style="color:var(--frota)">Frota '+pcs(pF)+'</span><span style="color:var(--terc)">Terceiros '+pcs(pT)+'</span></div>'
   +'<table class="qd"><thead><tr><th>INDICADOR</th><th class="f">FROTA</th><th class="t">TERCEIROS</th></tr></thead><tbody>'
   +row('Faturamento',brlc(f1),brlc(t1))
   +(HP?row('Variação fat. vs '+Y0,yoy(f0,f1,false),yoy(t0,t1,false)):'')
   +row('Despesas <small style="color:var(--muted)">(Terceiros = frete)</small>',brlc(dF1),brlc(dT1))
   +(HP?row('Variação desp. vs '+Y0,yoy(dF0,dF1,true),yoy(dT0,dT1,true)):'')
   +row('Despesa / faturamento',f1?pcs(dF1/f1*100,2):na,t1?pcs(dT1/t1*100,2):na)
   +row('Participação nas despesas',dA1?pcs(dF1/dA1*100):na,dA1?pcs(dT1/dA1*100):na)
   +row('Viagens',n0.format(vF),n0.format(vT))
   +row('Faturamento por viagem',vF?brl(f1/vF):na,vT?brl(t1/vT):na)
   +row('Despesa por viagem',vF?brl(dF1/vF):na,vT?brl(dT1/vT):na)
   +'</tbody><tfoot><tr><td colspan="3">Diferença de faturamento (Terceiros − Frota): <b>'+brlc(t1-f1)+'</b><br>Diferença de despesas (Frota − Terceiros): <b>'+brlc(dF1-dT1)+'</b></td></tr></tfoot></table>';
  $('quadro').innerHTML=h;
  $('qSub').textContent='Terceiros fatura mais e gasta menos • Frota fatura menos e gasta mais';
  const cats=CATS.map(c=>({n:c.n,a:sum(0,-1,c.k,'exp'),b:sum(1,-1,c.k,'exp')})).filter(c=>c.a||c.b).sort((x,y)=>y.b-x.b);
  const totB=cats.reduce((s,c)=>s+c.b,0), maxB=cats.length?Math.max(...cats.map(c=>c.b)):0, hasD0=HP&&(dF0+dT0)>0;
  h='<table class="qd"><thead><tr><th>TIPO</th><th>% DO TOTAL</th>'+(HP?'<th>VAR. VS '+Y0+'</th>':'<th>VALOR</th>')+'</tr></thead><tbody>'
   +(cats.length?cats.map(c=>{const p=totB?c.b/totB*100:0;
      return '<tr><td>'+esc(c.n)+'</td><td><span class="sbar"><i style="width:'+(maxB?c.b/maxB*100:0).toFixed(1)+'%"></i></span><span class="num sv">'+pcs(p)+'</span></td><td>'+(HP?(!hasD0?na:(c.a?chip((c.b-c.a)/c.a*100,true):'<span class="chip bad">'+ICO.up+'novo</span>')):'<span class="num">'+brlc(c.b)+'</span>')+'</td></tr>'}).join(''):'<tr><td colspan="3" class="empty">Sem despesas no filtro atual.</td></tr>')
   +'</tbody></table>';
  $('quadro2').innerHTML=h;
  $('q2Sub').textContent='Frota + frete de terceiros • '+(HP?'variação vs '+Y0+(S.cmp==='same'?' (mesmo período)':''):'participação no total de '+Y1);
}

/* ---------- indicadores ---------- */
function mini(t,v,s){return '<div><small>'+t+'</small><b>'+v+'</b><em>'+(HP?String(s).split('§')[0]:(String(s).indexOf('§')>=0?String(s).split('§')[1]:'Ano '+Y1))+'</em></div>'}
function renderInd(){
  const fF1=sum(1,0,0),fF0=sum(0,0,0),dF1=desp(1,0),dF0=desp(0,0),vF1=sum(1,0,11),vF0=sum(0,0,11);
  const mg=(f,d)=>f?(f-d)/f*100:null, nm=Math.max(1,mwd().length);
  $('indF').innerHTML=mini('Faturamento '+Y1,brlc(fF1),Y0+': '+brlc(fF0)+'§Média mensal: '+brlc(fF1/nm))
    +mini('Despesa '+Y1,brlc(dF1),Y0+': '+brlc(dF0))
    +mini('Despesa / faturamento','<span style="color:var(--frota)">'+pcs(fF1?dF1/fF1*100:0,2)+'</span>',Y0+': '+pcs(fF0?dF0/fF0*100:0,2))
    +mini('Custo por viagem',vF1?brl(dF1/vF1):'–',Y0+': '+(vF0?brl(dF0/vF0):'–'))
    +mini('Qtd viagens',n0.format(vF1)+' viagens',Y0+': '+n0.format(vF0));
  const fT1=sum(1,1,0),fT0=sum(0,1,0),dT1=desp(1,1),dT0=desp(0,1),vT1=sum(1,1,11),vT0=sum(0,1,11),a1=fF1+fT1,a0=fF0+fT0;
  $('indT').innerHTML=mini('Faturamento '+Y1,brlc(fT1),Y0+': '+brlc(fT0))
    +mini('Frete pago (despesa)',brlc(dT1),Y0+': '+brlc(dT0))
    +mini('Frete / faturamento','<span style="color:var(--terc)">'+pcs(fT1?dT1/fT1*100:0,2)+'</span>',Y0+': '+pcs(fT0?dT0/fT0*100:0,2))
    +mini('Participação no faturamento',pcs(a1?fT1/a1*100:0),Y0+': '+pcs(a0?fT0/a0*100:0))
    +mini('Viagens terceiros',n0.format(vT1)+' viagens',Y0+': '+n0.format(vT0))
    +mini('Frete por viagem',vT1?brl(dT1/vT1):'–',Y0+': '+(vT0?brl(dT0/vT0):'–'));
}

/* ---------- tabelas de detalhe ---------- */
function renderTables(){
  const nm=Math.max(1,mwd().length);
  let rows=CATS.map(c=>{const a=sum(0,0,c.k,'exp'),b=sum(1,0,c.k,'exp');return{n:c.n,y0:a,y1:b,dv:b-a,dp:a?(b-a)/a*100:(b?Infinity:0)}});
  const q=S.qd.trim().toLowerCase(); if(q)rows=rows.filter(r=>r.n.toLowerCase().includes(q));
  const T1=desp(1,0), T0=desp(0,0);
  const key={cat:'n',y0:'y0',y1:'y1',dv:'dv',dp:'dp'}[S.sort]||'y1';
  rows.sort((a,b)=>key==='n'?S.dir*-1*a.n.localeCompare(b.n):S.dir*(a[key]-b[key]));
  const arrow=k=>S.sort===k?(S.dir<0?' ↓':' ↑'):' ⇅';
  const hasY0=HP&&T0>0, rowsF=rows.filter(r=>r.y0||r.y1);
  let h,cs;
  if(HP){
    cs=5;
    h='<thead><tr><th data-s="cat">CATEGORIA'+arrow('cat')+'</th><th data-s="y0">'+Y0+arrow('y0')+'</th><th class="y1" data-s="y1">'+Y1+arrow('y1')+'</th><th data-s="dv">VAR (R$)'+arrow('dv')+'</th><th data-s="dp">VAR (%)'+arrow('dp')+'</th></tr></thead><tbody>';
  }else{
    cs=4;
    h='<thead><tr><th data-s="cat">CATEGORIA'+arrow('cat')+'</th><th class="y1" data-s="y1">'+Y1+arrow('y1')+'</th><th data-s="dv">% DO TOTAL</th><th data-s="dp">MÉDIA MENSAL</th></tr></thead><tbody>';
  }
  if(!rowsF.length)h+='<tr><td colspan="'+cs+'" class="empty">Sem despesas para exibir.</td></tr>';
  for(const r of rowsF){
    if(HP) h+='<tr><td>'+esc(r.n)+'</td><td class="dim">'+brl(r.y0)+'</td><td class="f">'+brl(r.y1)+'</td><td class="'+(!hasY0?'dim':(r.dv>0?'neg':'pos'))+'">'+(hasY0?brl(r.dv):'–')+'</td><td>'+(!hasY0?'<span class="dim">–</span>':(isFinite(r.dp)?chip(r.dp,true):'<span class="chip bad">'+ICO.up+'novo</span>'))+'</td></tr>';
    else h+='<tr><td>'+esc(r.n)+'</td><td class="f">'+brl(r.y1)+'</td><td><span class="sbar"><i style="width:'+(T1?r.y1/T1*100:0).toFixed(1)+'%"></i></span><span class="num sv">'+pcs(T1?r.y1/T1*100:0)+'</span></td><td class="dim">'+brlc(r.y1/nm)+'</td></tr>';
  }
  h+='</tbody><tfoot><tr>'+(HP?'<td>TOTAL</td><td>'+brl(T0)+'</td><td>'+brl(T1)+'</td><td>'+(hasY0?brl(T1-T0):'–')+'</td><td>'+(hasY0?pc(T0?(T1-T0)/T0*100:null):'–')+'</td>':'<td>TOTAL</td><td>'+brl(T1)+'</td><td>100,0%</td><td>'+brlc(T1/nm)+'</td>')+'</tr></tfoot>';
  $('tF').innerHTML=h;
  $('tF').querySelectorAll('th[data-s]').forEach(th=>th.addEventListener('click',()=>{const s=th.dataset.s;if(S.sort===s)S.dir*=-1;else{S.sort=s;S.dir=s==='cat'?1:-1}renderTables()}));
  // terceiros
  const f1=sum(1,1,0),f0=sum(0,1,0),e1=desp(1,1),e0=desp(0,1),v1=sum(1,1,11),v0=sum(0,1,11);
  const fr1=f1?e1/f1*100:0, fr0=f0?e0/f0*100:0;
  const ic=p=>'<svg class="ico" viewBox="0 0 24 24" style="width:15px;height:15px;color:var(--terc)">'+p+'</svg>';
  const lab=(n,i)=>'<td style="font-family:var(--f-ui)"><span style="display:inline-flex;gap:8px;align-items:center">'+i+n+'</span></td>';
  const ln=(n,i,a,b,fm,o)=>{o=o||{};const dv=b-a;
    if(!HP) return '<tr>'+lab(n,i)+'<td class="t">'+fm(b)+'</td><td class="dim">'+(o.avg?brlc(b/nm):'–')+'</td></tr>';
    return '<tr>'+lab(n,i)+'<td class="dim">'+fm(a)+'</td><td class="t">'+fm(b)+'</td><td>'+(a?(o.pp?(dv>=0?'+':'')+n2.format(dv)+' pp':fm(dv)):'–')+'</td><td>'+chip(a?dv/Math.abs(a)*100:null,!!o.down)+'</td></tr>'};
  const i1=ic('<path d="M12 2v20M17 6.5C16 5 14 4.5 12 4.5c-2.5 0-4.5 1.2-4.5 3s1.8 2.6 4.5 3 4.5 1.2 4.5 3-2 3-4.5 3c-2.2 0-4.2-.7-5-2.5"/>');
  const i2=ic('<path d="M1 6h13v10H1zM14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>');
  const i3=ic('<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>');
  const i4=ic('<path d="M3 12h4l3-8 4 16 3-8h4"/>');
  const i5=ic('<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>');
  $('tT').innerHTML=(HP?'<thead><tr><th>INDICADOR</th><th>'+Y0+'</th><th class="y1">'+Y1+'</th><th>VAR</th><th>VAR (%)</th></tr></thead>':'<thead><tr><th>INDICADOR</th><th class="y1">'+Y1+'</th><th>MÉDIA MENSAL</th></tr></thead>')+'<tbody>'
    +ln('Faturamento',i1,f0,f1,brl,{avg:1})
    +ln('Frete pago (despesa)',i2,e0,e1,brl,{down:true,avg:1})
    +ln('Frete / faturamento',i3,fr0,fr1,v=>pcs(v,2),{pp:true,down:true})
    +ln('Viagens',i4,v0,v1,v=>n0.format(v))
    +ln('Frete por viagem',i5,v0?e0/v0:0,v1?e1/v1:0,brl,{down:true})
    +'</tbody>';
  $('tFoot').innerHTML='<span>Frete pago sobre o faturamento de Terceiros:</span><b>'+pcs(fr1,2)+' em '+Y1+'</b>';
}

/* ---------- ranking ---------- */
const RK_DIMS={filial:'Filial',rota:'Rota',drv:'Motorista',placa:'Placa',tveic:'Tipo de veículo',bloco:'Bloco'};
function renderRank(){
  const dim=S.rdim, rows=computeRank(dim), q=S.rq.trim().toLowerCase();
  let list=q?rows.filter(r=>r.name.toLowerCase().includes(q)):rows.slice();
  const tF=rows.reduce((s,r)=>s+r.fF,0),tD=rows.reduce((s,r)=>s+r.dF,0),tT=rows.reduce((s,r)=>s+r.fT,0),tDT=rows.reduce((s,r)=>s+r.dT,0);
  const avg=tF?tD/tF*100:null;
  const key=S.rsort; list.sort((a,b)=>{ if(key==='name')return -S.rdir*a.name.localeCompare(b.name); const x=a[key]==null?-Infinity:a[key],y=b[key]==null?-Infinity:b[key]; return S.rdir*(x-y)});
  const maxD=list.length?Math.max(...list.map(r=>r.dF)):0, LIM=300, shown=list.slice(0,LIM);
  $('rkSub').textContent=RK_DIMS[dim]+' • '+Y1+' • ordene clicando nos títulos das colunas';
  $('rkSum').innerHTML='<span><b>'+n0.format(rows.length)+'</b> '+RK_DIMS[dim].toLowerCase()+(rows.length===1?'':'s')+'</span><span>Despesa Frota <b>'+brlc(tD)+'</b></span><span>Faturamento Frota <b>'+brlc(tF)+'</b></span><span>Faturamento Terceiros <b>'+brlc(tT)+'</b></span><span>Frete Terceiros <b>'+brlc(tDT)+'</b></span><span>Despesa/fat. médio <b>'+(avg==null?'–':pcs(avg,2))+'</b></span>';
  const arrow=k=>key===k?(S.rdir<0?' ↓':' ↑'):' ⇅';
  const th=(k,t,l)=>'<th data-s="'+k+'"'+(l?' style="text-align:left"':'')+'>'+t+arrow(k)+'</th>';
  let h='<thead><tr><th style="text-align:right;width:44px">#</th>'+th('name',RK_DIMS[dim].toUpperCase(),true)+th('fF','FAT. FROTA')+th('dF','DESPESA FROTA')+th('pct','DESP. / FAT.')+th('vF','VIAGENS')+th('cpv','CUSTO / VIAGEM')+th('fT','FAT. TERCEIROS')+th('dT','FRETE TERCEIROS')+th('pctT','FRETE / FAT.')+th('part','PART. TERCEIROS')+'</tr></thead><tbody>';
  if(!shown.length) h+='<tr><td colspan="11" class="empty">Nenhum resultado para os filtros atuais.</td></tr>';
  shown.forEach((r,i)=>{
    const cls=r.pct==null||avg==null?'dim':(r.pct>avg*1.2?'neg':(r.pct<avg*0.8?'pos':''));
    h+='<tr><td class="dim" style="text-align:right">'+(i+1)+'</td><td style="font-family:var(--f-ui);font-weight:600;white-space:normal;min-width:220px;text-align:left">'+esc(r.name)+'</td>'
     +'<td class="f">'+brlc(r.fF)+'</td><td><span class="sbar wide"><i style="width:'+(maxD?r.dF/maxD*100:0).toFixed(1)+'%"></i></span> '+brlc(r.dF)+'</td>'
     +'<td class="'+cls+'">'+(r.pct==null?'–':pcs(r.pct,2))+'</td><td>'+n0.format(r.vF)+'</td><td>'+(r.cpv==null?'–':brl(r.cpv))+'</td>'
     +'<td class="t">'+(r.fT?brlc(r.fT):'–')+'</td><td class="t">'+(r.dT?brlc(r.dT):'–')+'</td><td>'+(r.pctT==null?'–':pcs(r.pctT,2))+'</td><td>'+(r.part==null?'–':pcs(r.part))+'</td></tr>'});
  h+='</tbody>'; $('tRk').innerHTML=h;
  $('tRk').querySelectorAll('th[data-s]').forEach(t=>t.addEventListener('click',()=>{const s=t.dataset.s;if(S.rsort===s)S.rdir*=-1;else{S.rsort=s;S.rdir=s==='name'?-1:-1}renderRank()}));
  $('rkNote').textContent=list.length>LIM?'Mostrando os '+LIM+' primeiros de '+n0.format(list.length)+'. Use a busca para localizar um item específico.':'Vermelho: despesa/faturamento 20% acima da média. Verde: 20% abaixo. Terceiros: despesa = frete pago.';
}

/* ---------- filtros ---------- */
function optList(k){
  if(k==='own')return ['Frota Própria','Terceiros'];
  return D.dic[k].map(v=>v.replace(/^\s*\d+\s*-\s*/,m=>k==='filial'||k==='rota'?m:''))
}
function buildFilters(){
  const yrs=D.years, f=[];
  const sel=(id,label,opts)=>'<div class="fld"><label for="'+id+'">'+label+'</label><select id="'+id+'" data-k="'+id.slice(2)+'"><option value="">Todos</option>'+opts+'</select></div>';
  const srch=(k,label,ph)=>'<div class="fld"><label for="f-'+k+'">'+label+'</label><input id="f-'+k+'" data-k="'+k+'" type="search" list="dl-'+k+'" placeholder="'+ph+'" autocomplete="off"><datalist id="dl-'+k+'">'+D.dic[k].map(v=>'<option value="'+esc(v)+'"></option>').join('')+'</datalist></div>';
  const O=(arr)=>arr.map((v,i)=>'<option value="'+i+'">'+esc(v)+'</option>').join('');
  f.push(sel('f-periodo','Período','<option value="t1">1º Trimestre</option><option value="t2">2º Trimestre</option><option value="t3">3º Trimestre</option><option value="t4">4º Trimestre</option><option value="s1">1º Semestre</option><option value="s2">2º Semestre</option>'));
  f.push(sel('f-ano','Ano',yrs.map(y=>'<option value="'+y+'">'+y+'</option>').join('')));
  f.push(sel('f-mes','Mês',MES_FULL.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('')));
  DIMS.forEach(([k,l])=>{ if(k==='drv')f.push(srch(k,l,'Digite o nome')); else if(k==='placa')f.push(srch(k,l,'Digite a placa')); else f.push(sel('f-'+k,l,O(optList(k)))) });
  $('fgrid').innerHTML=f.join('');
  $('fgrid').querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>{S[s.dataset.k]=s.value;update()}));
  $('fgrid').querySelectorAll('input').forEach(s=>s.addEventListener('input',()=>{S[s.dataset.k]=s.value;clearTimeout(buildFilters.t);buildFilters.t=setTimeout(update,250);s.classList.toggle('on',s.value.trim()!=='')}));
}
function sync(){ $('fgrid').querySelectorAll('select,input').forEach(s=>{ if(s.value!==S[s.dataset.k])s.value=S[s.dataset.k]; s.classList.toggle('on',s.value.trim()!=='') }); fsummary() }
function fsummary(){
  const chips=[];
  $('fgrid').querySelectorAll('select,input').forEach(s=>{ if(s.value.trim()==='')return;
    const lab=s.closest('.fld').querySelector('label').textContent;
    const txt=s.tagName==='SELECT'?s.selectedOptions[0].text:s.value.trim();
    chips.push([s.dataset.k,lab+': '+txt]) });
  if(S.q.trim())chips.push(['q','Busca: '+S.q.trim()]);
  $('fsum').innerHTML=(chips.length?chips.map(c=>'<button type="button" class="fchip" data-k="'+c[0]+'" title="Remover filtro" aria-label="Remover filtro '+esc(c[1])+'">'+esc(c[1])+'<b>×</b></button>').join(''):'<span>Nenhum filtro ativo</span>')
    +'<span style="margin-left:auto;color:var(--muted)">'+(S.cmp==='same'?'Mesmo período':'Ano completo')+'</span>';
}
function applyFold(){
  $('fbody').hidden=S.fold; $('fsum').hidden=!S.fold; $('bFold').setAttribute('aria-expanded',S.fold?'false':'true');
  $('foldTxt').textContent=S.fold?'Expandir':'Recolher';
  $('foldIco').innerHTML=S.fold?'<path d="M6 9l6 6 6-6"/>':'<path d="M6 15l6-6 6 6"/>';
  document.querySelector('.filters').classList.toggle('folded',S.fold);
}
function setSeg(id,val){$(id).querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===val?'true':'false'))}
function bindSeg(id,key,fn){$(id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S[key]=b.dataset.v;setSeg(id,S[key]);fn()})}

/* ---------- ciclo ---------- */
function fmtMY(m,y){return MES_ABR[m-1].toLowerCase()+'/'+y}
function update(){
  compute(); sync();
  $('nreg').textContent=n0.format(M.used)+' linhas agregadas • '+n0.format(D.n)+' registros na base';
  $('nreg').textContent=n0.format(D.n)+' registros analisados';
  $('yrs').textContent=HP?Y0+' × '+Y1:String(Y1);
  const cm=CM.length?MES_ABR[CM[0]-1].toLowerCase()+' a '+MES_ABR[CM[CM.length-1]-1].toLowerCase():'';
  $('cmpNote').innerHTML='<span>'+(!HP?'Exibindo '+Y1+' (não há ano anterior na base para comparar)':S.cmp==='same'?'Comparando '+Y1+(cm?' (<b>'+cm+'</b>)':'')+' com os mesmos meses de '+Y0:'Comparando '+Y1+' (parcial) com '+Y0+' completo')+'</span>';
  const bm=D.bad.filter(b=>b[0]===Y1);
  $('segBad').parentElement.hidden=!bm.length;
  const nb=$('badNote'); nb.hidden=!bm.length;
  if(bm.length){const nm=bm.map(b=>fmtMY(b[1],b[0])).join(', ');
    nb.innerHTML='<svg class="ico" viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18h.01"/></svg><div><b>Atenção aos dados de '+nm+'.</b> '+(S.bad==='excl'?'As despesas deste mês foram deixadas de fora dos totais: na base, as colunas de custo não fecham com o total de despesa (combustível, motorista e frete aparecem trocados). O faturamento do mês está normal e foi mantido. O mesmo mês de '+Y0+' também sai da comparação para manter a base equivalente.':'As despesas deste mês foram incluídas como estão na base, mas os valores por categoria estão inconsistentes e distorcem os totais.')+'</div>'}
  renderKpis(); renderMonthly(); if(S.page==='ov')renderDonut(); renderQuadro(); renderInd(); renderTables(); if(S.page==='rk')renderRank();
  $('fnote').textContent='Regras: Frota própria = faturamento (valor da carga) e todas as despesas: combustível, diárias, descarga, pedágio/travessias, frete extra, descarga extra e motorista (oficina e peças não entram neste relatório). Terceiros = faturamento e, como única despesa, o frete pago a eles (coluna FRETETERCEIROS R$). Coluna de KM da base não foi usada (valores inválidos).';
}
function redrawCharts(){ if(M&&S.page==='ov'){ if(S.tab==='g')drawBar(); renderDonut() } }

/* ---------- importação ---------- */
function toast(t,ms){const e=$('toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);if(ms)toast.t=setTimeout(()=>e.hidden=true,ms)}
const norm=s=>String(s==null?'':s).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');
const MESMAP={};['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'].forEach((m,i)=>MESMAP[m]=i+1);
function buildFromRows(rows){
  const H={}; Object.keys(rows[0]||{}).forEach(k=>H[norm(k)]=k);
  const need=['FILIAL','PROPRIEDADE DE VEICULO','FATURAMENTO R$','MES','ANO'];
  const miss=need.filter(n=>!(n in H)); if(miss.length) throw new Error('Colunas não encontradas: '+miss.join(', '));
  const g=n=>H[n]; const num=v=>{if(typeof v==='number')return v;if(v==null||v==='')return 0;const x=parseFloat(String(v).replace(/\./g,'').replace(',','.'));return isFinite(x)?x:0};
  const dimsK={filial:'FILIAL',bloco:'BLOCO',tveic:'TIPO VEICULO',prest:'PRESTACAO',rota:'ROTA',placa:'PLACA',drv:'MOTORISTA'};
  const maps={},dic={}; Object.keys(dimsK).forEach(k=>{maps[k]=new Map();dic[k]=[]});
  const ex=['COMBUSTIVEL','DIARIAS R$','DESCARGA R$','TRAVESSIAS R$','FRETEEXTRA R$','FRETETERCEIROS R$','DESCARGAEXTRA R$','MOTORISTA R$','OFICINA R$','PECAS R$'];
  const agg=new Map(), mism={}; let n=0;
  for(const r of rows){
    const ano=num(r[g('ANO')]), mes=MESMAP[norm(r[g('MES')])]; if(!ano||!mes)continue; n++;
    const own=norm(r[g('PROPRIEDADE DE VEICULO')]).startsWith('2')?1:0;
    const ids=[]; for(const k in dimsK){const raw=r[g(dimsK[k])];const v=(raw==null||raw==='')?(k==='placa'?'(sem placa)':(k==='drv'?'(sem motorista)':'')):String(raw).trim();
      let id=maps[k].get(v); if(id===undefined){id=dic[k].length;dic[k].push(v);maps[k].set(v,id)} ids.push(id)}
    const ev=ex.map(c=>num(r[g(norm(c))])); const dt=num(r[g('DESPTOTAL R$')]);
    const mk=ano+'-'+mes; mism[mk]=mism[mk]||[0,0]; mism[mk][1]++; if(Math.abs(dt-ev.reduce((a,b)=>a+b,0))>0.01)mism[mk][0]++;
    ev[8]=0;ev[9]=0; if(own===1) for(let k=0;k<10;k++) if(k!==5) ev[k]=0;
    const key=ano+'|'+mes+'|'+own+'|'+ids.join('|'); let a=agg.get(key);
    if(!a){a={ano,mes,own,ids,v:new Array(13).fill(0)};agg.set(key,a)}
    a.v[0]+=num(r[g('FATURAMENTO R$')]); for(let k=0;k<10;k++)a.v[1+k]+=ev[k]; a.v[11]+=num(r[g('QTDVEICULOS')]); a.v[12]+=num(r[g('QTDCONHECIMENTO')]);
  }
  // ordena dicionários para manter a ordem alfabética
  const keys=Object.keys(dimsK), cols={ano:[],mes:[],own:[]}; keys.forEach(k=>cols[k]=[]); MEAS.forEach(m=>cols[m]=[]);
  const remap={}; keys.forEach(k=>{const sorted=dic[k].map((v,i)=>[v,i]).sort((a,b)=>a[0].localeCompare(b[0]));remap[k]=[];sorted.forEach(([v,i],j)=>remap[k][i]=j);dic[k]=sorted.map(x=>x[0])});
  for(const a of agg.values()){cols.ano.push(a.ano);cols.mes.push(a.mes);cols.own.push(a.own);keys.forEach((k,i)=>cols[k].push(remap[k][a.ids[i]]));MEAS.forEach((m,i)=>cols[m].push(Math.round(a.v[i]*100)/100))}
  const bad=[]; for(const k in mism){const [x,t]=mism[k];if(t>=20&&x/t>0.2){const [y,m]=k.split('-').map(Number);bad.push([y,m])}}
  return {dic,cols,n,bad,years:[...new Set(cols.ano)].sort()};
}
function loadData(nd){D=nd;window.__dspCur=(nd===ORIG?null:nd);if(!D.years)D.years=[...new Set(D.cols.ano)].sort();Object.keys(S).forEach(k=>{if(k in {cmp:1,bad:1,view:1,tab:1,sort:1,dir:1,page:1,fold:1,rdim:1,rsort:1,rdir:1,rq:1})return;S[k]=''});setup();buildFilters();update();setSeg('segCmp',S.cmp)}
async function importFile(file){
  if(!window.XLSX){toast('Biblioteca de leitura de Excel indisponível.',4000);return}
  toast('Lendo '+file.name+'… arquivos grandes podem levar alguns segundos.');
  await new Promise(r=>setTimeout(r,60));
  try{
    const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array',cellDates:false,dense:true});
    const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{defval:null,raw:true});
    if(!rows.length)throw new Error('A primeira aba está vazia.');
    toast('Processando '+n0.format(rows.length)+' linhas…'); await new Promise(r=>setTimeout(r,30));
    loadData(buildFromRows(rows)); try{window.__dspPersist&&window.__dspPersist(D)}catch(e){} toast('Base importada: '+n0.format(rows.length)+' registros.',4000);
  }catch(e){toast('Não foi possível importar: '+e.message,6000)}
}

/* ---------- exportação ---------- */
let DL=null;
function wbCurrent(){
  const wb=XLSX.utils.book_new();
  const mrows=[['Mês','Faturamento Frota '+Y0,'Faturamento Frota '+Y1,'Despesas Frota '+Y0,'Despesas Frota '+Y1,'Faturamento Terceiros '+Y0,'Faturamento Terceiros '+Y1,'Frete Terceiros '+Y0,'Frete Terceiros '+Y1,'Diferença '+Y0+' (Terceiros - Frota)','Diferença '+Y1+' (Terceiros - Frota)']];
  for(let m=1;m<=12;m++){mrows.push([MES_FULL[m-1],mfat(0,0,m),mfat(1,0,m),mdesp(0,0,m),mdesp(1,0,m),mfat(0,1,m),mfat(1,1,m),mdesp(0,1,m),mdesp(1,1,m),mfat(0,1,m)-mfat(0,0,m),mfat(1,1,m)-mfat(1,0,m)])}
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(mrows),'Comparativo mensal');
  const c=[['Categoria (Frota + frete Terceiros)',String(Y0),String(Y1)]];
  CATS.forEach(x=>{const a=sum(0,-1,x.k,'exp'),b=sum(1,-1,x.k,'exp');if(a||b)c.push([x.n,a,b])});
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(c),'Despesas');
  const k=[['Indicador','Frota '+Y0,'Frota '+Y1,'Terceiros '+Y0,'Terceiros '+Y1],
   ['Faturamento',sum(0,0,0),sum(1,0,0),sum(0,1,0),sum(1,1,0)],['Despesa (Terceiros = frete)',desp(0,0),desp(1,0),desp(0,1),desp(1,1)],
   ['Viagens',sum(0,0,11),sum(1,0,11),sum(0,1,11),sum(1,1,11)]];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(k),'Indicadores');
  return wb;
}
async function saveFile(name,buf,mime){
  if(DL){await DL.save({filename:name,data:buf});return}
  const u=URL.createObjectURL(new Blob([buf],{type:mime})), a=document.createElement('a');
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
}
async function saveWb(wb,name){
  try{const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});await saveFile(name,out,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('Arquivo pronto para salvar.',3000)}
  catch(e){if(e&&e.code==='declined')return;toast('Não foi possível gerar o arquivo.',4000)}
}
async function printPanel(){
  const b=$('bPrint'); if(b.disabled)return;
  if(!window.html2canvas){toast('Biblioteca de imagem indisponível (verifique a conexão).',4500);return}
  b.disabled=true; const lb=b.querySelector('span'), old=lb.textContent; lb.textContent='Gerando...';
  try{
    await new Promise(r=>setTimeout(r,60));
    const el=$('app'), pd=24, w=el.scrollWidth, h=el.scrollHeight, sc=Math.max(1,Math.min(2,15000/(h+2*pd)));
    const cv=await html2canvas(el,{scale:sc,backgroundColor:'#ffffff',useCORS:true,logging:false,x:-pd,y:-pd,width:w+2*pd,height:h+2*pd,windowWidth:w+2*pd,scrollX:0,scrollY:0,
      ignoreElements:n=>n.classList&&n.classList.contains('actions')});
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
    if(!blob)throw new Error('png');
    const d=new Date(), p=n=>String(n).padStart(2,'0');
    await saveFile('painel-despesas-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes())+'.png',await blob.arrayBuffer(),'image/png');
    toast('Imagem do painel gerada.',3000);
  }catch(e){ if(!(e&&e.code==='declined')) toast('Não foi possível gerar a imagem.',4500) }
  finally{b.disabled=false; lb.textContent=old}
}
function modelWb(){
  const h=['FILIAL','PROPRIEDADE DE VEICULO','BLOCO','ROTA','PRESTACAO','PLACA','SUPERVISOR','MOTORISTA','TIPO VEICULO','TIPO VEICULO CONHECIMENTO','CONHECIMENTO','QTDCONHECIMENTO','QTDVEICULOS','QTDECLI','QTDECID','KMRODADO','FATURAMENTO R$','PESOCARGA','COMBUSTIVEL','DIARIAS R$','DESCARGA R$','TRAVESSIAS R$','FRETEEXTRA R$','FRETETERCEIROS R$','DESCARGAEXTRA R$','MOTORISTA R$','OFICINA R$','PECAS R$','DESPTOTAL R$','DESP %','MÊS','ANO'];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([h]),'Planilha2'); return wb;
}

/* ---------- init ---------- */
function init(){
  setup(); buildFilters();
  bindSeg('segCmp','cmp',update); bindSeg('segBad','bad',update); bindSeg('segView','view',renderKpis);
  bindSeg('segTab','tab',()=>{$('tabView').hidden=S.tab!=='t';$('chView').hidden=S.tab!=='g';if(S.tab==='g')drawBar()});
  $('q').addEventListener('input',e=>{S.q=e.target.value;clearTimeout(init.t);init.t=setTimeout(update,200)});
  $('qd').addEventListener('input',e=>{S.qd=e.target.value;renderTables()});
  $('bClear').addEventListener('click',()=>{Object.keys(S).forEach(k=>{if(['mes','periodo','ano','filial','own','bloco','tveic','drv','placa','rota','prest','q'].includes(k))S[k]=''});$('q').value='';update()});
  $('bReset').addEventListener('click',()=>{$('q').value='';loadData(ORIG);try{window.__dspPersist&&window.__dspPersist(null)}catch(e){}toast('Base original restaurada.',2500)});
  try{S.fold=localStorage.getItem('fdFold')==='1'}catch(e){}
  $('bFold').addEventListener('click',()=>{S.fold=!S.fold;applyFold();try{localStorage.setItem('fdFold',S.fold?'1':'0')}catch(e){}});
  $('fsum').addEventListener('click',e=>{const c=e.target.closest('.fchip');if(!c)return;const k=c.dataset.k;S[k]='';if(k==='q')$('q').value='';update()});
  applyFold();
  $('mainTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.page=b.dataset.p;
    $('mainTabs').querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected',x===b?'true':'false'));
    $('pgOv').hidden=S.page!=='ov';$('pgRk').hidden=S.page!=='rk';update()});
  bindSeg('segRk','rdim',()=>{S.rsort='dF';S.rdir=-1;renderRank()});
  $('rkq').addEventListener('input',e=>{S.rq=e.target.value;renderRank()});
  $('bImp').addEventListener('click',()=>$('fImp').click());
  $('fImp').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)importFile(f)});
  $('stamp').textContent='Carga: '+BUILD;
  const rng=()=>{const ys=D.years;return ''};
  update();
  $('bPrint').addEventListener('click',printPanel);
  if(window.XLSX){ $('bExp').hidden=false;$('bMod').hidden=false;
    $('bExp').addEventListener('click',()=>saveWb(wbCurrent(),'comparativo-despesas.xlsx'));
    $('bMod').addEventListener('click',()=>saveWb(modelWb(),'modelo-despesas.xlsx')) }
  (async()=>{ if(!(window.claude&&claude.use))return; try{DL=await claude.use('downloads')}catch(e){DL=null} })();
}
window.__dash={get S(){return S},get M(){return M},compute,update,buildFromRows,loadData,sum,desp,months};
init();
}
