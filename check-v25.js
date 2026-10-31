
'use strict';
const EXAMPLES=[{"id":"E038","flow":59.4,"label":"1325-E038","source":"Média da aba Todos os dados; vazão do ensaio","ambient":24.24702,"discharge":84.71789,"suction":5.7448,"oil":54.8638,"dome":54.82067,"condIn":83.95312,"condMid":51.32871,"condOut":40.99071,"evapOut":8.17975,"pCond":198.6699,"satCondSheet":42.98821,"pSuc":24.09154,"satEvapSheet":-17.53592,"pBoiler":33.04577,"subcoolSheet":1.99778,"superheatSheet":23.27947,"beerIn":24.0724,"beerOut":2.98044,"airIn":44.91484,"airOut":24.2,"power":0.83311},{"id":"E030","flow":37.08,"label":"1325-E030","source":"Média da aba Todos os dados; vazão do ensaio","ambient":32.14702,"discharge":89.69404,"suction":3.55798,"oil":60.68183,"dome":59.72621,"condIn":88.97739,"condMid":57.36311,"condOut":49.72968,"evapOut":9.19598,"pCond":229.86408,"satCondSheet":60.28488,"pSuc":24.0,"satEvapSheet":-2.4,"pBoiler":32.35506,"subcoolSheet":10.55492,"superheatSheet":5.95784,"beerIn":32.00985,"beerOut":3.03343,"airIn":32.05908,"airOut":51.34674,"power":0.0}];
const $=id=>document.getElementById(id);
const KEYS=[
 ['discharge','Descarga do compressor','°C'],['suction','Sucção do compressor','°C'],['oil','Óleo do compressor','°C'],['dome','Domo do compressor','°C'],
 ['condIn','Entrada do condensador','°C'],['condMid','Meio do condensador','°C'],['condOut','Saída do condensador','°C'],['airIn','Entrada de ar do condensador','°C'],['airOut','Saída de ar do condensador','°C'],
 ['evapOut','Saída do evaporador','°C'],['pCond','Pressão de condensação','psig'],['pSuc','Pressão de sucção','psig'],['pBoiler','Pressão do boiler','psig'],['dpBS','ΔP boiler − sucção','psi'],
 ['satCondSheet','T. saturação (alta) — tendência','°C'],['satEvapSheet','T. saturação (baixa) — tendência','°C'],['superheatSheet','Superaquecimento — tendência','K'],['subcoolSheet','Sub-resfriamento — tendência','K'],
 ['beerIn','Entrada do chope','°C'],['beerOut','Saída do chope','°C'],['flow','Vazão do chope','L/h'],['qProduct','Carga térmica do chope','kW'],['power','Potência ativa elétrica','kW'],
 ['suctionPressureRatio','Pressão de admissão relativa — T fixa','%']
];
let imported=null;
try{const h=JSON.parse(localStorage.getItem('treinamemo_handoff_v8')||'null');if(h?.measurements){const d=h.measurements;imported={id:'imported',label:h.name||'Ensaio importado',ambient:Number(d.ambient),beerIn:Number(d.beerIn),pCond:Number(d.pCond),flow:Number(h.flow),pSuc:Number(d.pSuc),pBoiler:Number(d.pBoiler)||32,discharge:Number(d.discharge),beerOut:Number(d.beerOut),source:'Ponto selecionado na Biblioteca'};if(!Number.isFinite(imported.ambient)||!Number.isFinite(imported.beerIn))imported=null;}}catch(e){console.warn(e)}
if(!imported)$('reference').querySelector('option[value="imported"]').disabled=true;
let selected=EXAMPLES[0],mode='target';
let s={ambient:selected.ambient,beerIn:selected.beerIn,target:3,flow:selected.flow,pBoiler:selected.pBoiler,pSuc:selected.pSuc,fault:'none',faultSeverity:0};
let results=null;
const data=EXAMPLES;
const rho=1.01, cp=3900;
const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const q=(flow,tin,tout)=>flow*rho*cp*(tin-tout)/3600000;
const weight=t=>(t-data[0].ambient)/(data[1].ambient-data[0].ambient);
const mix=(key,t)=>{const a=data[0][key],b=data[1][key];return Number.isFinite(a)&&Number.isFinite(b)?a+(b-a)*weight(t):NaN};
function measured(key){
 if(key==='qProduct')return q(selected.flow,selected.beerIn,selected.beerOut);
 if(key==='dpBS')return (selected.pBoiler-selected.pSuc);
 if(key==='suctionPressureRatio')return 100;
 return selected[key];
}
function baseAt(t){
 const base={};
 for(const [k] of KEYS){ if(k==='qProduct'||k==='dpBS'||k==='suctionPressureRatio') continue; base[k]=mix(k,t); }
 base.pBoiler=Number.isFinite(base.pBoiler)?base.pBoiler:selected.pBoiler;
 base.pSuc=Number.isFinite(base.pSuc)?base.pSuc:selected.pSuc;
 base.dpBS=base.pBoiler-base.pSuc;
 base.qProduct=q(base.flow,base.beerIn,base.beerOut);
 return base;
}
function faultLabel(v){return ({none:'Nenhuma',condObstruction:'Condensador obstruído',highSuctionDrop:'Restrição / perda de pressão na sucção'})[v]||'Nenhuma'}
/* Termodinâmica essencial: ΔP = P_boiler - P_sucção. A redução do ΔP, com P_boiler fixo,
 * eleva P_sucção do compressor e normalmente favorece a capacidade. Não inferimos um
 * aumento percentual de capacidade sem mapa compressor/entalpias/velocidade de gás.
 * A razão P_suc,abs / P_suc,abs(ref), a T fixa, é apenas proxy idealizada de densidade.
 */
function calc(){
 const t=s.ambient,tin=s.beerIn,base=baseAt(t);let valid=true;
 const pBoiler=Number(s.pBoiler),pSuc=Number(s.pSuc);
 const dp=pBoiler-pSuc;
 const dpRef=base.pBoiler-base.pSuc;
 const pRefAtSameBoiler=pBoiler-dpRef;
 const suctionPressureRatio=100*(pSuc+14.6959)/(pRefAtSameBoiler+14.6959);
 if(!(Number.isFinite(dp)&&dp>=0&&pSuc>-14.6959&&pBoiler>-14.6959&&pRefAtSameBoiler>-14.6959))valid=false;
 const effectiveCap=base.qProduct; // Não modificar capacidade com ΔP sem calibração.
 let flow,out;
 if(mode==='target'){
   out=s.target;
   flow=(tin>out&&effectiveCap>=0)?effectiveCap*3600000/(rho*cp*(tin-out)):NaN;
   if(!(flow>0&&Number.isFinite(flow)))valid=false;
 }else{
   flow=s.flow;
   out=(flow>0)?tin-effectiveCap*3600000/(flow*rho*cp):NaN;
   if(!(Number.isFinite(out)&&out>=-5&&out<=tin)){out=NaN;valid=false;}
 }
 const res={...base,ambient:t,beerIn:tin,flow,beerOut:out,
  pBoiler,pSuc,dpBS:dp,suctionPressureRatio,qProduct:q(flow,tin,out)};
 // Os demais sensores NÃO recebem offsets artificiais ao editar pressão ou falha.
 // Uma falha é explicada qualitativamente em /falhas.html.
 return {r:res,valid,inside:t>=data[0].ambient&&t<=data[1].ambient,
   effectiveCap,base,dpRef,deltaLoss:dp-dpRef};
}
function decimals(unit){return unit==='psig'||unit==='psi'||unit==='L/h'||unit==='kW'||unit==='%'||unit==='K'?2:1}
function rowCard(k,label,unit){
 const value=results.r[k], origin=measured(k), delta=value-origin;
 const type=Number.isFinite(delta)?delta>0.005?'up':delta<-0.005?'down':'same':'same';
 let note='Estimativa referenciada nos ensaios E038/E030';
 if(k==='flow'&&mode==='target')note='Saída escolhida fixa; vazão calculada pelo balanço de energia';
 else if(k==='beerOut'&&mode==='flow')note='Vazão fixa; temperatura de saída calculada';
 else if(k==='dpBS')note='Parâmetro editável: diferença entre pressão do boiler e da sucção';
 else if(k==='suctionPressureRatio')note='Relação de pressão absoluta na entrada, a T fixa; NÃO é capacidade frigorífica';
 else if(['pBoiler','pSuc'].includes(k))note='Pressão inserida pelo usuário; sensores independentes não são recalculados artificialmente';
 return `<div class="reading"><div class="name">${label}</div><b>${fmt(value,decimals(unit))} ${unit}</b><div class="sub">Real: ${fmt(origin,decimals(unit))} ${unit}</div><div class="delta ${type}">${Number.isFinite(delta)?`${delta>0?'▲':delta<0?'▼':'='} ${delta>0?'+':''}${fmt(delta,decimals(unit))} ${unit}`:'Sem comparação'}</div><div class="tiny">${note}</div></div>`;
}
function metric(label,key,unit){const v=results.r[key],delta=v-measured(key);return `<div class="metric"><small>${label}</small><b>${fmt(v,2)} ${unit}</b><span class="delta ${delta>0.005?'up':delta<-0.005?'down':'same'}">${Number.isFinite(delta)?`Antes ${fmt(measured(key),2)} · ${delta>0?'+':''}${fmt(delta,2)} ${unit}`:'Sem comparação'}</span></div>`}
function updateDeltaInfo(){
 const dp=s.pBoiler-s.pSuc;
 $('deltaPSucBoiler').value=Number.isFinite(dp)?dp.toFixed(2):'';
 const d=results?results.deltaLoss:0;
 let msg='ΔP = Pboiler − Psucção: representa perda de carga entre o boiler e a entrada do compressor.';
 if(!Number.isFinite(dp)||dp<0){msg='Pressões inválidas: Psucção não pode superar Pboiler neste modelo de perda de carga.';}
 else if(d < -0.01){msg=`Perda de carga ${fmt(-d,2)} psi MENOR que a referência da mesma condição de boiler. Em geral, sucção menos penalizada → tendência de MAIOR capacidade e melhor rendimento. O ganho exato não foi calculado.`;}
 else if(d > 0.01){msg=`Perda de carga ${fmt(d,2)} psi MAIOR que a referência da mesma condição de boiler. Em geral, sucção mais penalizada → tendência de MENOR capacidade e rendimento. A queda exata não foi calculada.`;}
 else {msg='Perda de carga igual à referência do ensaio, na condição de comparação.';}
 $('deltaInfo').textContent=msg+' Retorno de óleo: não estimado numericamente; requer verificação de vazão/velocidade e geometria.';
 $('faultSeverityLabel').textContent=`${Number(s.faultSeverity)||0}% • ${faultLabel(s.fault)}`;
}
function render(){
 results=calc(); const res=results.r;
 $('metrics').innerHTML=
   metric('Vazão do chope','flow','L/h')+
   metric('Temperatura de saída','beerOut','°C')+
   metric('ΔP boiler − sucção','dpBS','psi')+
   metric('Pressão de admissão relativa¹','suctionPressureRatio','%')+
   metric('Carga térmica do chope','qProduct','kW')+
   metric('Pressão de condensação','pCond','psig');
 $('readings').innerHTML=KEYS.map(([k,l,u])=>rowCard(k,l,u)).join('');
 for(const [k,u] of [['ambient','°C'],['pCond','psig'],['discharge','°C'],['pSuc','psig'],['flow','L/h'],['beerOut','°C']]){const el=$('svg-'+k); if(el) el.textContent=fmt(res[k],1)+' '+u;}
 $('targetbox').classList.toggle('hide',mode!=='target');
 $('flowbox').classList.toggle('hide',mode!=='flow');
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 const warnings=[];
 if(!results.inside)warnings.push('Temperatura ambiente fora da faixa E038–E030: extrapolação não validada.');
 if(!results.valid)warnings.push('Entradas fisicamente incompatíveis; confira temperaturas, vazão e pressão de sucção menor ou igual à do boiler.');
 if(imported&&selected.id==='imported')warnings.push('O ponto importado é somente referência; interpolação baseada em E038/E030.');
 if(s.fault!=='none'&&s.faultSeverity>0)warnings.push(`Falha ${faultLabel(s.fault)}: efeitos qualitativos devem ser analisados no Laboratório de Falhas. Não calculamos offsets fictícios de sensores.`);
 warnings.push('¹ Pressão de admissão relativa = (Psucção + 14,6959) / (Psucção,ref + 14,6959), a mesma Pboiler e temperatura de sucção constante. Não é eficiência, capacidade ou vazão de refrigerante.');
 warnings.push('Não é possível calcular retorno de óleo em percentual a partir de ΔP. É necessário avaliar geometria, velocidade e vazão de refrigerante.');
 warnings.push('Capacidade térmica do chope calculada por interpolação dos dois ensaios, não por mapa termodinâmico do compressor. A mudança isolada da perda de carga NÃO altera artificialmente este valor.');
 $('cautions').textContent=warnings.join(' ');
 $('methodNote').textContent=mode==='target'?
   'Saída fixa: cálculo de vazão via balanço térmico dos ensaios E038/E030. A diferença de pressão mostra apenas a tendência física do rendimento, sem percentual inventado.':
   'Vazão fixa: cálculo de temperatura de saída via balanço térmico experimental. O efeito isolado de ΔP na capacidade exige mapa do compressor e modelo de circuito.';
 $('statusModel').textContent=results.inside&&results.valid?'Estimativa experimental · ΔP físico':'⚠ Fora do modelo';
 updateDeltaInfo();
}
function syncInputs(){ for(const key of ['ambient','beerIn','target','flow']) $(key).value=Number.isFinite(s[key])?s[key]:''; $('pBoilerSet').value=Number.isFinite(s.pBoiler)?s.pBoiler.toFixed(2):''; $('pSucSet').value=Number.isFinite(s.pSuc)?s.pSuc.toFixed(2):''; if(s.fault==='lowDelta')s.fault='none';$('fault').value=s.fault; $('faultSeverity').value=s.faultSeverity; updateDeltaInfo(); }
function selectRef(id){ selected=id==='E030'?data[1]:id==='imported'&&imported?{...data[0],...imported}:data[0]; s={...s,ambient:selected.ambient,beerIn:selected.beerIn,target:3,flow:Number.isFinite(selected.flow)?selected.flow:59.4,pBoiler:Number.isFinite(selected.pBoiler)?selected.pBoiler:(selected.pSuc+8),pSuc:Number.isFinite(selected.pSuc)?selected.pSuc:24}; syncInputs(); render(); }
$('reference').addEventListener('change',e=>selectRef(e.target.value));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));
for(const key of ['ambient','beerIn','target','flow']) $(key).addEventListener('input',e=>{const n=Number(e.target.value); if(Number.isFinite(n)){s[key]=n; render();}});
[['pBoilerSet','pBoiler'],['pSucSet','pSuc']].forEach(([id,key])=>$(id).addEventListener('input',e=>{const n=Number(e.target.value); if(Number.isFinite(n)){s[key]=n; render();}}));
$('fault').addEventListener('change',e=>{s.fault=e.target.value; render();});
$('faultSeverity').addEventListener('input',e=>{s.faultSeverity=Number(e.target.value)||0; render();});
$('reset').addEventListener('click',()=>{mode='target'; s={...s,fault:'none',faultSeverity:0}; selectRef('E038'); $('reference').value='E038';});
$('monitor').addEventListener('click',()=>{$('app').classList.toggle('monitor'); $('monitor').textContent=$('app').classList.contains('monitor')?'↩ Sair do monitor':'▣ Modo monitor';});
$('save').addEventListener('click',()=>{try{localStorage.setItem('treinamemo_v15_scenario',JSON.stringify({mode,ref:selected.id,s})); $('saveStatus').textContent='✓ Cenário salvo neste navegador';}catch(e){$('saveStatus').textContent='Falha ao salvar: armazenamento indisponível';}});
$('restore').addEventListener('click',()=>{try{const o=JSON.parse(localStorage.getItem('treinamemo_v15_scenario')||'null'); if(!o) throw Error('Não há cenário salvo'); selectRef(o.ref); mode=o.mode==='flow'?'flow':'target'; s={...s,...o.s}; syncInputs(); render(); $('reference').value=o.ref; $('saveStatus').textContent='✓ Cenário recuperado';}catch(e){$('saveStatus').textContent=e.message;}});
if(imported){$('reference').value='imported'; selectRef('imported')} else { selectRef('E038'); }
// Boiler reference is the user's original supplied image, not a recreated SVG.
const BOILER_FOCUS={
 all:{description:'Imagem original preservada. A serpentina dourada, o sifão azul em U e o nível do líquido podem ser observados sem legendas sobrepostas.'},
 coil:{left:25,top:41,width:49,height:44,description:'A serpentina do chope aparece em múltiplas voltas horizontais douradas no líquido refrigerante. O chope circula dentro dos tubos e transfere calor ao R134a ao redor.'},
 siphon:{left:40,top:10,width:25,height:39,description:'O tubo azul em U representa a geometria do sifão de sucção no material de referência. O corpo passa pela zona de líquido; a região de captação do vapor deve permanecer acima do nível livre.'},
 liquid:{left:23,top:35,width:55,height:50,description:'O líquido refrigerante ocupa parte do boiler, envolvendo a serpentina de chope e parte do sifão. A altura correta depende da carga, do projeto e das condições de operação.'},
 vapor:{left:25,top:9,width:53,height:26,description:'Na parte superior existe espaço de vapor refrigerante. O gás segue pela sucção em direção ao compressor; a entrada de líquido no compressor deve ser evitada.'}
};
function showBoilerPart(key){
 const info=BOILER_FOCUS[key]||BOILER_FOCUS.all;
 const ring=$('boilerFocus');ring.style.display=key==='all'?'none':'block';
 if(key!=='all')for(const prop of ['left','top','width','height'])ring.style[prop]=info[prop]+'%';
 $('boilerDescription').textContent=info.description;
 document.querySelectorAll('.boiler-part').forEach(b=>b.classList.toggle('active',b.dataset.focus===key));
}
$('viewBoiler').addEventListener('click',()=>{ $('boilerReference').hidden=false;$('circuitDiagram').classList.add('circuit-hidden');$('viewBoiler').classList.add('active');$('viewCircuit').classList.remove('active');$('viewBoiler').setAttribute('aria-pressed','true');$('viewCircuit').setAttribute('aria-pressed','false'); });
$('viewCircuit').addEventListener('click',()=>{ $('boilerReference').hidden=true;$('circuitDiagram').classList.remove('circuit-hidden');$('viewCircuit').classList.add('active');$('viewBoiler').classList.remove('active');$('viewBoiler').setAttribute('aria-pressed','false');$('viewCircuit').setAttribute('aria-pressed','true'); });
document.querySelectorAll('.boiler-part').forEach(b=>b.addEventListener('click',()=>showBoilerPart(b.dataset.focus)));
showBoilerPart('all');

