/* ============================================================================
   HCV ValueMaX — web app
   Same functionality as the Android app. Calculations mirror the Kotlin logic
   exactly. Saved estimates persist in the browser via localStorage (the browser
   equivalent of the app's local SharedPreferences storage).
   ========================================================================== */

/* ---- brand assets (base64, injected at build) ---- */
const ASSETS = window.__ASSETS__ || {};
document.getElementById('lockimg').src = ASSETS.lockup || '';

/* ============================ formatting (mirror Common.kt) ================ */
function nfIN(v, dec){
  return new Intl.NumberFormat('en-IN',{minimumFractionDigits:dec||0,maximumFractionDigits:dec||0}).format(v);
}
function inr(v, dec){ return '\u20B9 ' + nfIN(v, dec||0); }
function num(v, dec){ return nfIN(v, dec||0); }
function inrWords(v){
  const a = Math.abs(v);
  if (a >= 1e7) return '\u20B9 ' + nfIN(v/1e7, 2) + ' Cr';
  if (a >= 1e5) return '\u20B9 ' + nfIN(v/1e5, 2) + ' Lakh';
  return inr(Math.round(v));
}
function groupIndian(raw){
  if (raw === '' || raw == null) return '';
  const neg = String(raw).startsWith('-');
  let body = neg ? String(raw).slice(1) : String(raw);
  const dot = body.indexOf('.');
  let intPart = dot>=0 ? body.slice(0,dot) : body;
  const frac = dot>=0 ? body.slice(dot) : '';
  if (intPart === '') return (neg?'-':'') + frac;
  const n = parseInt(intPart,10);
  if (isNaN(n)) return raw;
  return (neg?'-':'') + new Intl.NumberFormat('en-IN').format(n) + frac;
}
function ungroup(s){ return String(s).replace(/,/g,''); }
function toD(s, def){ const v = parseFloat(ungroup(s)); return isNaN(v) ? (def||0) : v; }

/* ============================ FE logic (mirror FeMaxLogic.kt) ============== */
const FeLogic = {
  baseline(i){
    const litres = i.mileage>0 ? i.monthlyKm/i.mileage : 0;
    const m = litres*i.diesel;
    return {litresPerMonth:litres, costPerMonth:m, costPerYear:m*12};
  },
  savingsTable(i){
    if (i.mileage<=0) return [];
    const baseLitres = i.monthlyKm/i.mileage;
    const out=[];
    for(let p=1;p<=12;p++){
      const nm = i.mileage*(1+p/100);
      const saved = baseLitres - i.monthlyKm/nm;
      const perMonth = saved*i.diesel;
      out.push({pct:p,newMileage:nm,litresSaved:saved,savePerMonth:perMonth,savePerYear:perMonth*12,saveOverYears:perMonth*12*i.years});
    }
    return out;
  }
};

/* ============================ HPT logic (mirror HptLogic.kt) =============== */
const HptLogic = {
  POINTS:[
    {label:'30T',base:'28T',add:1.8},
    {label:'37T',base:'35T',add:1.8},
    {label:'44T',base:'42T',add:1.8},
    {label:'49T',base:'48T',add:1.3},
  ],
  calc(i){
    const yearlyKm = i.monthlyKm*12;
    const annual = i.add*(i.loadedPct/100)*yearlyKm*i.rate;
    return {yearlyKm, annual, lifetime:annual*i.totalYears};
  }
};

/* ============================ BRT logic (mirror BrtLogic.kt) =============== */
const BrtLogic = {
  emi(principal, annualRatePct, months){
    if (months<=0) return 0;
    const r = annualRatePct/100/12;
    if (r===0) return principal/months;
    const f = Math.pow(1+r, months);
    return principal*r*f/(f-1);
  },
  tyrePerKm(groups){
    return groups.reduce((s,g)=> s + (g.life>0 ? g.count*g.cost/g.life : 0), 0);
  },
  calc(p){
    const initialCost = p.vehiclePrice + p.bodyPrice;
    const finance = initialCost*(p.fundingPct/100);
    const tripsYr = p.tripsPerMonth*p.operativeMonths;
    const distTrip = p.primaryLead + p.returnLead + p.emptyKm;
    const distMonth = distTrip*p.tripsPerMonth;
    const distYr = distMonth*p.operativeMonths;
    const tonKm = (p.primaryLead*p.primaryLoad + p.returnLead*p.returnLoad)*tripsYr;
    const payloadYr = (p.primaryLoad + p.returnLoad)*tripsYr;
    const freightYr = (p.primaryLoad*p.primaryLead*p.primaryRate + p.returnLoad*p.returnLead*p.secondaryRate)*tripsYr;
    const crewYr = p.crewSalary*12;
    const insYr = initialCost*(p.insurancePct/100);
    const fixed = crewYr + insYr + p.adminPerYear;
    const litres = p.mileage>0 ? distYr/p.mileage : 0;
    const fuelCost = litres*p.fuelPrice;
    const defLitres = litres*(p.defPct/100);
    const defCost = defLitres*p.defCost;
    const tyrePerKm = this.tyrePerKm(p.tyreGroups);
    const tyreYr = tyrePerKm*distYr;
    const maintYr = p.maintPerKm*distYr;
    const tollAddl = p.tollPerKm*distYr + p.addlPerTon*payloadYr;
    const running = fuelCost + defCost + tyreYr + maintYr + tollAddl;
    const tenureMonths = Math.max(0, p.tenureYears*12 - p.moratorium);
    const emiMonth = this.emi(finance, p.interestPct, tenureMonths);
    const emiYear = emiMonth*12;
    const totalOp = running + fixed + emiYear;
    const profit = freightYr - totalOp;
    return {initialCost,financeAmount:finance,tripsPerYear:tripsYr,distancePerTrip:distTrip,distancePerYear:distYr,
      tonKmPerYear:tonKm,payloadTonsPerYear:payloadYr,freightPerYear:freightYr,
      crewSalaryPerYear:crewYr,insurancePerYear:insYr,adminPerYear:p.adminPerYear,totalFixedCost:fixed,
      fuelLitresPerYear:litres,fuelCostPerYear:fuelCost,defLitresPerYear:defLitres,defCostPerYear:defCost,
      tyreCostPerKm:tyrePerKm,tyreCostPerYear:tyreYr,maintenanceCostPerYear:maintYr,tollAndAddlPerYear:tollAddl,
      totalRunningCost:running,emiPerMonth:emiMonth,emiPerYear:emiYear,totalOperatingCost:totalOp,
      costPerKm:distYr>0?totalOp/distYr:0,costPerTonKm:tonKm>0?totalOp/tonKm:0,
      operatingProfitPerYear:profit,operatingProfitPerMonth:profit/12};
  },
  compare(p1,p2,years){
    const r1=this.calc(p1), r2=this.calc(p2);
    const extra=r1.operatingProfitPerYear-r2.operatingProfitPerYear;
    return {product1:r1,product2:r2,extraProfitPerYear:extra,extraProfitPerMonth:extra/12,extraProfitOverYears:extra*years,years};
  }
};

/* ============================ default state ================================ */
function feDefaults(){ return {name:'',location:'',route:'',vehicle:'55T / 6.7L MAV',monthlyKm:'10000',mileage:'3.1',diesel:'100',years:'5',selectedPct:7}; }
function hptDefaults(){ return {name:'',location:'',route:'',tonnageIdx:0,addlPayload:'1.8',loadedPct:'100',monthlyKm:'5417',rate:'2.5',years:'5'}; }
function productDefaults(name){ return {name,vehiclePrice:'2821000',bodyPrice:'350000',fundingPct:'100',interestPct:'11',tenureYears:'5',moratorium:'1',
  payload:'18',primaryLoad:'18',returnLoad:'18',primaryLead:'982',returnLead:'982',emptyKm:'0',tripsPerMonth:'6',operativeMonths:'12',
  primaryRate:'3.6',secondaryRate:'3.6',mileage:name.indexOf('Competition')>=0?'4.2':'4.5',fuelPrice:'90',defPct:'6',defCost:'60',
  maintPerKm:'0.9',tollPerKm:'5.5',addlPerTon:'0',crewSalary:'70000',adminPerYear:'25000',insurancePct:'4',
  tyreGroups:[{label:'Front axle',count:'2',cost:'25000',life:'100000'},{label:'Drive/Rear axles',count:'8',cost:'25000',life:'100000'}]}; }
function brtDefaults(){ return {name:'',location:'',route:'',compareYears:'5',product1:productDefaults('Tata Signa 2823.T'),product2:productDefaults('Competition Model')}; }

/* live working state, restored from localStorage draft if present */
const State = {
  fe: load('draft_fe', feDefaults()),
  hpt: load('draft_hpt', hptDefaults()),
  brt: load('draft_brt', brtDefaults()),
};
function saveDraft(which){ localStorage.setItem('valuemax_draft_'+which, JSON.stringify(State[which])); }
function load(key, def){
  try{ const s=localStorage.getItem('valuemax_'+key); if(s){ return Object.assign(def, JSON.parse(s)); } }catch(e){}
  return def;
}

/* ============================ estimates storage =========================== */
const Store = {
  key:'valuemax_estimates',
  list(){ try{ return JSON.parse(localStorage.getItem(this.key)||'[]'); }catch(e){ return []; } },
  save(type,typeLabel,customer,payload){
    const all=this.list();
    all.push({id:'e'+Date.now(),type,typeLabel,customerName:customer.name,location:customer.location,route:customer.route,
      savedAt:Date.now(),payload});
    localStorage.setItem(this.key, JSON.stringify(all));
  },
  delete(id){ localStorage.setItem(this.key, JSON.stringify(this.list().filter(e=>e.id!==id))); },
};
function fmtDate(ms){
  const d=new Date(ms);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+', '+
    d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}

/* ============================ navigation ================================== */
const TITLES={home:'Tata Motors CV | Better Always',fe:'FE MaX \u2014 FE Series Trucks',
  hpt:'Revenue MaX \u2014 High Payload Trucks',brt:'BRT \u2014 Business Returns',dash:'Saved Estimates'};
let current='home';
function go(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+screen).classList.add('active');
  document.getElementById('topTitle').textContent=TITLES[screen];
  document.getElementById('topbar').classList.toggle('has-back', screen!=='home');
  current=screen;
  window.scrollTo(0,0);
  if(screen==='fe') renderFe();
  if(screen==='hpt') renderHpt();
  if(screen==='brt') renderBrt();
  if(screen==='dash') renderDash();
}
document.getElementById('backBtn').onclick=()=>go('home');

/* ============================ small UI helpers ============================ */
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2200);
}
function openDialog(html){ document.getElementById('dialog').innerHTML=html; document.getElementById('overlay').classList.add('show'); }
function closeDialog(){ document.getElementById('overlay').classList.remove('show'); }
document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeDialog(); });

function field(label, val, oninput, opts){
  opts=opts||{};
  const id='f'+Math.random().toString(36).slice(2,8);
  const suffix=opts.suffix?`<span class="suffix">${opts.suffix}</span>`:'';
  const hintId=opts.hintId?` id="${opts.hintId}"`:'';
  const hint=(opts.hint||opts.hintId)?`<div class="hint ${opts.err?'err':''}"${hintId}>${opts.hint||''}</div>`:'';
  const errcls=opts.err?'err':'';
  const wrapAttr=opts.wrapId?` id="${opts.wrapId}"`:'';
  const inputmode=opts.text?'':' inputmode="decimal"';
  window['_h_'+id]=oninput;
  return `<div class="field ${errcls}"${wrapAttr}><label>${label}</label><div class="wrap">
    <input id="${id}"${inputmode} value="${val==null?'':String(val).replace(/"/g,'&quot;')}"
      oninput="_h_${id}(this)">${suffix}</div>${hint}</div>`;
}
/* numeric field with Indian grouping while typing */
function numField(label, rawVal, setter, opts){
  opts=opts||{};
  const disp=opts.grouped?groupIndian(rawVal):rawVal;
  return field(label, disp, function(el){
    const caretPos = el.selectionStart==null ? el.value.length : el.selectionStart;
    const digitsBeforeCaret = (el.value.slice(0,caretPos).match(/[0-9.]/g)||[]).length;
    let raw = opts.grouped?ungroup(el.value):el.value;
    if(raw==='' || /^\d*\.?\d*$/.test(raw)){
      setter(raw);
      if(opts.grouped){
        const newDisp=groupIndian(raw);
        el.value=newDisp;
        // restore caret after the same count of numeric characters, so typing mid-number
        // (or the very first digit) doesn't jump the cursor or trigger a mobile scroll-into-view
        let count=0, pos=newDisp.length;
        for(let k=0;k<newDisp.length;k++){
          if(/[0-9.]/.test(newDisp[k])) count++;
          if(count>=digitsBeforeCaret){ pos=k+1; break; }
        }
        try{ el.setSelectionRange(pos,pos); }catch(e){}
      }
      if(opts.rerender) opts.rerender();
    } else { el.value=disp; }
  }, opts);
}

/* ============================ shared components =========================== */
function customerCard(state, showErr, rerender){
  const nameErr = showErr && !state.name.trim();
  return `<div class="card"><div class="sect-title">Customer details</div>
    ${field('Customer name', state.name, el=>{state.name=el.value;}, {text:true, err:nameErr, hint:nameErr?'Customer name is required to save or share':''})}
    ${field('Location', state.location, el=>{state.location=el.value;}, {text:true})}
    ${field('Route of operation', state.route, el=>{state.route=el.value;}, {text:true})}
  </div>`;
}
function actionsRow(onReset, onShow){
  return `<div class="actions">
    <button class="btn btn-outline" onclick="${onReset}">&#8635; Reset</button>
    ${onShow?`<button class="btn btn-primary" onclick="${onShow}">&#128241; Show customer</button>`:''}
  </div>`;
}
function heroBox(cap, amount, sub){
  return `<div class="hero"><div class="cap">${cap}</div><div class="big">${inrWords(amount)}</div>
    <div class="exact">${inr(Math.round(amount))}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
}
function missingNotice(show){
  return show?`<div class="notice">&#9432;&nbsp; Enter the customer name above to share or save this estimate.</div>`:'';
}

/* re-render helpers bound per screen */
function bindReset(which, fn){ window['__reset_'+which]=fn; }

/* ============================ FE screen ================================== */
let feShowErr=false;
function renderFe(){
  const s=State.fe; saveDraft('fe');
  const i={monthlyKm:toD(s.monthlyKm),mileage:toD(s.mileage),diesel:toD(s.diesel),years:toD(s.years,5)};
  const base=FeLogic.baseline(i);
  const table=FeLogic.savingsTable(i);
  const sel=table.find(r=>r.pct===s.selectedPct);
  const mileageErr = s.mileage!=='' && toD(s.mileage)<=0 ? 'Must be greater than 0' : '';

  let html = actionsRow('feReset()', sel?'feShow()':'');
  html += customerCard(s, feShowErr, renderFe);
  html += `<div class="card"><div class="sect-title">Step 1 &mdash; Vehicle &amp; usage</div>
    ${field('Vehicle / Tonnage', s.vehicle, el=>{s.vehicle=el.value;}, {text:true})}
    ${numField('Monthly running', s.monthlyKm, v=>{s.monthlyKm=v;}, {suffix:'km', grouped:true, rerender:()=>softUpdateFe()})}
    ${numField('Current mileage', s.mileage, v=>{s.mileage=v;}, {suffix:'km/l', err:!!mileageErr, hint:mileageErr, wrapId:'feMileageWrap', hintId:'feMileageHint', rerender:()=>softUpdateFeMileage()})}
    <div class="row2">
      ${numField('Diesel price', s.diesel, v=>{s.diesel=v;}, {suffix:'\u20B9/l', rerender:()=>softUpdateFe()})}
      ${numField('Years of operation', s.years, v=>{s.years=v;}, {suffix:'yrs', rerender:()=>softUpdateFe()})}
    </div></div>`;

  html += `<div class="card"><div class="sect-title">Step 2 &mdash; Savings with FE Series</div>
    <div class="slider-val" id="feSliderLabel">Mileage improvement: ${s.selectedPct}% &nbsp;<span style="color:var(--grey);font-weight:400">(FE Series range 7&ndash;10%)</span></div>
    <input type="range" min="1" max="12" value="${s.selectedPct}" oninput="feSlideLive(this.value)" onchange="feSlide(this.value)">
    <div id="feHero">${sel?heroBox('Savings per year at '+sel.pct+'% better FE', sel.savePerYear, 'New mileage: '+num(sel.newMileage,2)+' km/l'):''}</div>
  </div>`;

  // in-app savings table (kept in app, per requirements)
  if(table.length){
    html += `<div class="card"><div class="sect-title">Full savings table (1%&ndash;12%)</div>
      <table class="cmp" id="feTable"><tr><th>FE%</th><th>km/l</th><th>Saved L/mo</th><th>&#8377;/month</th><th>&#8377;/year</th></tr>
      ${table.map(r=>`<tr data-pct="${r.pct}" class="${r.pct===s.selectedPct?'bold':''}"><td>${r.pct}%</td><td>${num(r.newMileage,2)}</td><td>${num(r.litresSaved)}</td><td>${inr(r.savePerMonth)}</td><td>${inr(r.savePerYear)}</td></tr>`).join('')}
      </table></div>`;
  }

  html += missingNotice(!s.name.trim());
  html += `<button class="btn btn-primary" onclick="feShare()">&#128196; Share PDF estimate with customer</button>`;
  html += `<button class="btn btn-outline" onclick="feSave()">Save estimate</button>`;
  html += `<div class="foot-note">Actual fuel efficiency depends on road conditions, load, driver habits and maintenance. Indicative planning tool only.</div>`;
  document.getElementById('screen-fe').innerHTML=html;
}
function softUpdateFe(){ // update hero without full re-render (keeps keyboard focus)
  const s=State.fe; saveDraft('fe');
  const i={monthlyKm:toD(s.monthlyKm),mileage:toD(s.mileage),diesel:toD(s.diesel),years:toD(s.years,5)};
  const sel=FeLogic.savingsTable(i).find(r=>r.pct===s.selectedPct);
  const h=document.getElementById('feHero');
  if(h&&sel) h.innerHTML=heroBox('Savings per year at '+sel.pct+'% better FE', sel.savePerYear, 'New mileage: '+num(sel.newMileage,2)+' km/l');
}
function softUpdateFeMileage(){ // update error state + hero, without rebuilding the input (avoids focus loss / scroll jump)
  const s=State.fe; saveDraft('fe');
  const mileageErr = s.mileage!=='' && toD(s.mileage)<=0 ? 'Must be greater than 0' : '';
  const wrap=document.getElementById('feMileageWrap');
  const hint=document.getElementById('feMileageHint');
  if(wrap) wrap.classList.toggle('err', !!mileageErr);
  if(hint){ hint.textContent=mileageErr; hint.classList.toggle('err', !!mileageErr); }
  softUpdateFe();
}
function feSlideLive(v){
  // Live update while dragging: DOM patches only, no innerHTML rebuild, so the
  // native drag gesture on the range input is never interrupted.
  const s=State.fe; s.selectedPct=parseInt(v,10); saveDraft('fe');
  const i={monthlyKm:toD(s.monthlyKm),mileage:toD(s.mileage),diesel:toD(s.diesel),years:toD(s.years,5)};
  const sel=FeLogic.savingsTable(i).find(r=>r.pct===s.selectedPct);
  const lab=document.getElementById('feSliderLabel');
  if(lab) lab.textContent='Mileage improvement: '+s.selectedPct+'%';
  const h=document.getElementById('feHero');
  if(h&&sel) h.innerHTML=heroBox('Savings per year at '+sel.pct+'% better FE', sel.savePerYear, 'New mileage: '+num(sel.newMileage,2)+' km/l');
  const tbl=document.getElementById('feTable');
  if(tbl){ tbl.querySelectorAll('tr[data-pct]').forEach(tr=>{
    tr.classList.toggle('bold', tr.getAttribute('data-pct')===String(s.selectedPct));
  }); }
}
function feSlide(v){ State.fe.selectedPct=parseInt(v,10); renderFe(); }
function feReset(){ confirmReset(()=>{ State.fe=feDefaults(); feShowErr=false; renderFe(); toast('Calculator reset'); }); }
function feShow(){
  const s=State.fe; const i={monthlyKm:toD(s.monthlyKm),mileage:toD(s.mileage),diesel:toD(s.diesel),years:toD(s.years,5)};
  const sel=FeLogic.savingsTable(i).find(r=>r.pct===s.selectedPct); if(!sel) return;
  summaryDialog('FE Series &mdash; Fuel Savings', s.name, 'Savings per year at '+sel.pct+'% better FE', sel.savePerYear, [
    ['Diesel saved / month', num(sel.litresSaved)+' L', false],
    ['Savings / month', inr(sel.savePerMonth), false],
    ['Savings / year', inr(sel.savePerYear), true],
    ['Savings in '+Math.round(i.years)+' years', inr(sel.saveOverYears), true],
  ]);
}
function feSave(){
  const s=State.fe;
  if(!s.name.trim()){ feShowErr=true; renderFe(); toast('Enter customer name first'); return; }
  Store.save('FEMAX','FE MaX', s, JSON.stringify(s)); toast('Estimate saved to dashboard');
}
function feShare(){
  const s=State.fe;
  if(!s.name.trim()){ feShowErr=true; renderFe(); toast('Enter customer name to share the estimate'); return; }
  buildFePdf(s);
}

/* ============================ HPT screen ================================= */
let hptShowErr=false;
function renderHpt(){
  const s=State.hpt; saveDraft('hpt');
  const pt=HptLogic.POINTS[Math.min(s.tonnageIdx, HptLogic.POINTS.length-1)];
  const res=HptLogic.calc({add:toD(s.addlPayload),loadedPct:toD(s.loadedPct),monthlyKm:toD(s.monthlyKm),rate:toD(s.rate),totalYears:toD(s.years,5)});
  const yrs=Math.round(toD(s.years,5));
  const loadedErr = s.loadedPct!=='' && toD(s.loadedPct)>100 ? 'Cannot exceed 100%' : '';

  let html=actionsRow('hptReset()','hptShow()');
  html+=customerCard(s, hptShowErr, renderHpt);
  html+=`<div class="card"><div class="sect-title">Vehicle selection</div>
    <div class="field"><label>Tonnage point</label><div class="wrap">
      <select onchange="hptTonnage(this.value)">
      ${HptLogic.POINTS.map((p,idx)=>`<option value="${idx}" ${idx===s.tonnageIdx?'selected':''}>${p.label} (vs base ${p.base}, +${p.add}T payload)</option>`).join('')}
      </select></div></div>
    ${numField('Additional payload', s.addlPayload, v=>{s.addlPayload=v;}, {suffix:'tonnes', hint:'Auto-filled from tonnage point ('+pt.label+' vs '+pt.base+'); editable', rerender:()=>softUpdateHpt()})}
  </div>`;
  html+=`<div class="card"><div class="sect-title">Operating inputs</div>
    ${numField('Loaded running', s.loadedPct, v=>{s.loadedPct=v;}, {suffix:'%', err:!!loadedErr, hint:loadedErr, rerender:()=>softUpdateHpt()})}
    ${numField('Monthly running', s.monthlyKm, v=>{s.monthlyKm=v;}, {suffix:'km', grouped:true, hint:'Yearly running = '+num(toD(s.monthlyKm)*12)+' km', hintId:'hptMonthlyHint', rerender:()=>softUpdateHptMonthly()})}
    ${numField('Freight rate', s.rate, v=>{s.rate=v;}, {suffix:'\u20B9 / tonne-km', rerender:()=>softUpdateHpt()})}
    ${numField('Years of operation', s.years, v=>{s.years=v;}, {suffix:'years', rerender:()=>softUpdateHpt()})}
  </div>`;
  html+=`<div id="hptHero">
    ${heroBox('Annual revenue advantage', res.annual, 'From carrying '+toD(s.addlPayload)+' tonnes more on the same trip')}
    ${heroBox('Lifetime revenue advantage ('+yrs+' years)', res.lifetime, '')}
  </div>`;
  html+=missingNotice(!s.name.trim());
  html+=`<button class="btn btn-primary" onclick="hptShare()">&#128196; Share PDF estimate with customer</button>`;
  html+=`<button class="btn btn-outline" onclick="hptSave()">Save estimate</button>`;
  html+=`<div class="foot-note">Every extra tonne carried is direct revenue &mdash; same trip, same fuel, more earnings. Indicative planning tool.</div>`;
  document.getElementById('screen-hpt').innerHTML=html;
}
function softUpdateHpt(){
  const s=State.hpt; saveDraft('hpt');
  const res=HptLogic.calc({add:toD(s.addlPayload),loadedPct:toD(s.loadedPct),monthlyKm:toD(s.monthlyKm),rate:toD(s.rate),totalYears:toD(s.years,5)});
  const yrs=Math.round(toD(s.years,5));
  const h=document.getElementById('hptHero');
  if(h) h.innerHTML=heroBox('Annual revenue advantage', res.annual, 'From carrying '+toD(s.addlPayload)+' tonnes more on the same trip')+
    heroBox('Lifetime revenue advantage ('+yrs+' years)', res.lifetime, '');
}
function softUpdateHptMonthly(){ // update the yearly-running hint + hero, without rebuilding the input
  const s=State.hpt;
  const hint=document.getElementById('hptMonthlyHint');
  if(hint) hint.textContent='Yearly running = '+num(toD(s.monthlyKm)*12)+' km';
  softUpdateHpt();
}
function hptTonnage(v){ const idx=parseInt(v,10); State.hpt.tonnageIdx=idx; State.hpt.addlPayload=String(HptLogic.POINTS[idx].add); renderHpt(); }
function hptReset(){ confirmReset(()=>{ State.hpt=hptDefaults(); hptShowErr=false; renderHpt(); toast('Calculator reset'); }); }
function hptShow(){
  const s=State.hpt; const pt=HptLogic.POINTS[s.tonnageIdx];
  const res=HptLogic.calc({add:toD(s.addlPayload),loadedPct:toD(s.loadedPct),monthlyKm:toD(s.monthlyKm),rate:toD(s.rate),totalYears:toD(s.years,5)});
  const yrs=Math.round(toD(s.years,5));
  summaryDialog('High Payload &mdash; Revenue Advantage', s.name, 'Annual revenue advantage', res.annual, [
    ['Tonnage point', pt.label+' (vs '+pt.base+')', false],
    ['Additional payload', toD(s.addlPayload)+' tonnes', false],
    ['Annual advantage', inr(res.annual), true],
    ['Lifetime ('+yrs+' yrs)', inr(res.lifetime), true],
  ]);
}
function hptSave(){ const s=State.hpt; if(!s.name.trim()){hptShowErr=true;renderHpt();toast('Enter customer name first');return;} Store.save('HPT','Revenue MaX', s, JSON.stringify(s)); toast('Estimate saved to dashboard'); }
function hptShare(){ const s=State.hpt; if(!s.name.trim()){hptShowErr=true;renderHpt();toast('Enter customer name to share the estimate');return;} buildHptPdf(s); }

/* ============================ reset + summary dialogs ==================== */
function confirmReset(onYes){
  openDialog(`<h3>Reset this calculator?</h3>
    <p style="color:var(--grey);font-size:14px;text-align:center">All fields return to defaults. Saved estimates are not affected.</p>
    <div class="btn-row"><button class="btn btn-outline" onclick="closeDialog()">Cancel</button>
    <button class="btn btn-primary" onclick="closeDialog();(${'__reset_cb'})()">Reset</button></div>`);
  window.__reset_cb=onYes;
}
function summaryDialog(title, name, cap, amount, stats){
  openDialog(`<h3>${title}</h3>
    ${name?`<p style="text-align:center;margin:-8px 0 12px">for <b>${name}</b></p>`:''}
    ${heroBox(cap, amount, '')}
    ${stats.map(([l,v,hl])=>`<div class="summary-stat ${hl?'hl':''}"><span>${l}</span><span class="v">${v}</span></div>`).join('')}
    <button class="btn btn-primary" style="margin-top:14px" onclick="closeDialog()">Done</button>`);
}

/* ============================ BRT screen ================================= */
let brtTab=0, brtShowErr=false;
function brtModel(p){
  return {name:p.name,vehiclePrice:toD(p.vehiclePrice),bodyPrice:toD(p.bodyPrice),fundingPct:toD(p.fundingPct),
    interestPct:toD(p.interestPct),tenureYears:toD(p.tenureYears),moratorium:toD(p.moratorium),
    payload:toD(p.payload),primaryLoad:toD(p.primaryLoad),returnLoad:toD(p.returnLoad),primaryLead:toD(p.primaryLead),
    returnLead:toD(p.returnLead),emptyKm:toD(p.emptyKm),tripsPerMonth:toD(p.tripsPerMonth),operativeMonths:toD(p.operativeMonths),
    primaryRate:toD(p.primaryRate),secondaryRate:toD(p.secondaryRate),mileage:toD(p.mileage),fuelPrice:toD(p.fuelPrice),
    defPct:toD(p.defPct),defCost:toD(p.defCost),maintPerKm:toD(p.maintPerKm),tollPerKm:toD(p.tollPerKm),addlPerTon:toD(p.addlPerTon),
    crewSalary:toD(p.crewSalary),adminPerYear:toD(p.adminPerYear),insurancePct:toD(p.insurancePct),
    tyreGroups:p.tyreGroups.map(g=>({label:g.label,count:toD(g.count),cost:toD(g.cost),life:toD(g.life)}))};
}
function renderBrt(){
  const s=State.brt; saveDraft('brt');
  const c=BrtLogic.compare(brtModel(s.product1), brtModel(s.product2), toD(s.compareYears,5));
  const tmlWins=c.extraProfitPerYear>=0;
  const winner = tmlWins?s.product1.name:s.product2.name;

  let html=`<div class="tabs">
    <div class="tab ${brtTab===0?'active':''}" onclick="brtSetTab(0)">${escapeHtml(s.product1.name.slice(0,12))}</div>
    <div class="tab ${brtTab===1?'active':''}" onclick="brtSetTab(1)">${escapeHtml(s.product2.name.slice(0,12))}</div>
    <div class="tab ${brtTab===2?'active':''}" onclick="brtSetTab(2)">RESULTS</div>
  </div>`;
  html+=`<div class="sticky-sum"><span class="l">${tmlWins?'Extra profit / year':'Profit gap / year'}</span>
    <span class="r ${tmlWins?'':'neg'}">${inrWords(c.extraProfitPerYear)}</span></div>`;
  html+=actionsRow('brtReset()', brtTab===2?'brtShow()':'');

  if(brtTab===0) html+=productForm(s.product1,0);
  else if(brtTab===1) html+=productForm(s.product2,1);
  else html+=brtResults(s,c,tmlWins,winner);

  document.getElementById('screen-brt').innerHTML=html;
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function brtSetTab(t){ brtTab=t; renderBrt(); }
function brtReset(){ confirmReset(()=>{ State.brt=brtDefaults(); brtShowErr=false; brtTab=0; renderBrt(); toast('Calculator reset'); }); }

function collapsible(title, inner, open){
  const id='c'+Math.random().toString(36).slice(2,7);
  return `<div class="card">
    <div class="collapse-hd ${open?'':'closed'}" onclick="this.classList.toggle('closed');document.getElementById('${id}').classList.toggle('hidden')">
      <span class="sect-title" style="margin:0">${title}</span><span class="chev">&#9660;</span></div>
    <div class="collapse-bd ${open?'':'hidden'}" id="${id}">${inner}</div></div>`;
}
function productForm(p, idx){
  const pref='State.brt.'+(idx===0?'product1':'product2');
  let html=`<div class="card">${field('Product name', p.name, el=>{p.name=el.value;}, {text:true})}</div>`;
  html+=collapsible('Vehicle &amp; finance',
    numField('Vehicle price', p.vehiclePrice, v=>{p.vehiclePrice=v;}, {suffix:'\u20B9',grouped:true,rerender:softBrt})+
    numField('Body price', p.bodyPrice, v=>{p.bodyPrice=v;}, {suffix:'\u20B9',grouped:true,rerender:softBrt})+
    '<div class="row2">'+numField('Funding', p.fundingPct, v=>{p.fundingPct=v;}, {suffix:'%',rerender:softBrt})+
      numField('Interest p.a.', p.interestPct, v=>{p.interestPct=v;}, {suffix:'%',rerender:softBrt})+'</div>'+
    '<div class="row2">'+numField('Tenure', p.tenureYears, v=>{p.tenureYears=v;}, {suffix:'yrs',rerender:softBrt})+
      numField('Moratorium', p.moratorium, v=>{p.moratorium=v;}, {suffix:'months',rerender:softBrt})+'</div>', true);
  html+=collapsible('Route &amp; operations',
    '<div class="row2">'+numField('Rated payload', p.payload, v=>{p.payload=v;}, {suffix:'T',rerender:softBrt})+
      numField('Trips / month', p.tripsPerMonth, v=>{p.tripsPerMonth=v;}, {rerender:softBrt})+'</div>'+
    '<div class="row2">'+numField('Primary load', p.primaryLoad, v=>{p.primaryLoad=v;}, {suffix:'T',rerender:softBrt})+
      numField('Return load', p.returnLoad, v=>{p.returnLoad=v;}, {suffix:'T',rerender:softBrt})+'</div>'+
    '<div class="row2">'+numField('Primary lead', p.primaryLead, v=>{p.primaryLead=v;}, {suffix:'km',rerender:softBrt})+
      numField('Return lead', p.returnLead, v=>{p.returnLead=v;}, {suffix:'km',rerender:softBrt})+'</div>'+
    '<div class="row2">'+numField('Empty running / trip', p.emptyKm, v=>{p.emptyKm=v;}, {suffix:'km',rerender:softBrt})+
      numField('Operative months', p.operativeMonths, v=>{p.operativeMonths=v;}, {rerender:softBrt})+'</div>', false);
  html+=collapsible('Freight rates',
    '<div class="row2">'+numField('Primary rate', p.primaryRate, v=>{p.primaryRate=v;}, {suffix:'\u20B9/T-km',rerender:softBrt})+
      numField('Return rate', p.secondaryRate, v=>{p.secondaryRate=v;}, {suffix:'\u20B9/T-km',rerender:softBrt})+'</div>', false);
  html+=collapsible('Fuel &amp; DEF',
    '<div class="row2">'+numField('Trip mileage', p.mileage, v=>{p.mileage=v;}, {suffix:'km/l',rerender:softBrt})+
      numField('Fuel price', p.fuelPrice, v=>{p.fuelPrice=v;}, {suffix:'\u20B9/l',rerender:softBrt})+'</div>'+
    '<div class="row2">'+numField('DEF consumption', p.defPct, v=>{p.defPct=v;}, {suffix:'% diesel',rerender:softBrt})+
      numField('DEF cost', p.defCost, v=>{p.defCost=v;}, {suffix:'\u20B9/l',rerender:softBrt})+'</div>', false);
  // tyres
  let tyreInner='<div class="foot-note" style="margin-bottom:8px">Tyre cost/km = &Sigma; (count &times; cost &divide; life). Works for any axle layout.</div>';
  p.tyreGroups.forEach((g,gi)=>{
    tyreInner+=`<div class="card" style="background:var(--tert);box-shadow:none">
      <div class="row2" style="align-items:end">
        ${field('Axle group', g.label, el=>{g.label=el.value;}, {text:true})}
        ${p.tyreGroups.length>1?`<button class="btn btn-outline" style="flex:0 0 auto;width:auto;padding:10px 12px;margin:0" onclick="brtDelTyre(${idx},${gi})">&#128465;</button>`:''}
      </div>
      <div class="row2">
        ${numField('Tyres', g.count, v=>{g.count=v;}, {rerender:softBrt})}
        ${numField('Cost/tyre', g.cost, v=>{g.cost=v;}, {suffix:'\u20B9',grouped:true,rerender:softBrt})}
        ${numField('Life', g.life, v=>{g.life=v;}, {suffix:'km',grouped:true,rerender:softBrt})}
      </div></div>`;
  });
  const perKm=BrtLogic.tyrePerKm(brtModel(p).tyreGroups);
  tyreInner+=`<button class="btn btn-outline" onclick="brtAddTyre(${idx})">+ Add axle group</button>
    <div class="summary-stat hl"><span>Tyre cost per km</span><span class="v">${inr(perKm,2)}</span></div>`;
  html+=collapsible('Tyres (per axle group)', tyreInner, false);
  html+=collapsible('Other running &amp; fixed costs',
    '<div class="row2">'+numField('Maintenance', p.maintPerKm, v=>{p.maintPerKm=v;}, {suffix:'\u20B9/km',rerender:softBrt})+
      numField('Toll', p.tollPerKm, v=>{p.tollPerKm=v;}, {suffix:'\u20B9/km',rerender:softBrt})+'</div>'+
    numField('Additional expenses / tonne', p.addlPerTon, v=>{p.addlPerTon=v;}, {suffix:'\u20B9/T',rerender:softBrt})+
    '<div class="row2">'+numField('Crew salary', p.crewSalary, v=>{p.crewSalary=v;}, {suffix:'\u20B9/mo',grouped:true,rerender:softBrt})+
      numField('Admin / year', p.adminPerYear, v=>{p.adminPerYear=v;}, {suffix:'\u20B9',grouped:true,rerender:softBrt})+'</div>'+
    numField('Insurance & taxes', p.insurancePct, v=>{p.insurancePct=v;}, {suffix:'% of cost', hint:'BRT default: 4%',rerender:softBrt}), false);
  return html;
}
function softBrt(){ // update sticky bar live
  const s=State.brt; saveDraft('brt');
  const c=BrtLogic.compare(brtModel(s.product1), brtModel(s.product2), toD(s.compareYears,5));
  const el=document.querySelector('.sticky-sum .r');
  if(el){ el.textContent=inrWords(c.extraProfitPerYear); el.className='r '+(c.extraProfitPerYear>=0?'':'neg'); }
}
function softUpdateBrtYears(){ // update just the hero's "over N years" line, no full re-render
  const s=State.brt; saveDraft('brt');
  const c=BrtLogic.compare(brtModel(s.product1), brtModel(s.product2), toD(s.compareYears,5));
  const tmlWins=c.extraProfitPerYear>=0;
  const n1=s.product1.name, n2=s.product2.name;
  const h=document.getElementById('brtHero');
  if(h) h.innerHTML=heroBox(tmlWins?('Extra profit per year with '+n1):('Profit gap per year vs '+n2), c.extraProfitPerYear,
    'Over '+Math.round(c.years)+' years of operation: '+inrWords(c.extraProfitOverYears));
}
function brtAddTyre(idx){ (idx===0?State.brt.product1:State.brt.product2).tyreGroups.push({label:'Trailer axle',count:'4',cost:'25000',life:'100000'}); renderBrt(); }
function brtDelTyre(idx,gi){ (idx===0?State.brt.product1:State.brt.product2).tyreGroups.splice(gi,1); renderBrt(); }

function cmpRow(label,v1,v2,opts){
  opts=opts||{};
  const cur=opts.currency!==false, dec=opts.dec||0, lower=opts.lowerBetter, bold=opts.bold;
  const p1b = v1!==v2 && ((lower&&v1<v2)||(!lower&&v1>v2));
  const p2b = v1!==v2 && !p1b;
  const f=x=>cur?inr(x,dec):num(x,dec);
  let delta='';
  if(opts.showDelta && v1!==v2){ const d=v1-v2; delta=`<tr><td colspan="3" style="text-align:right;border:none;padding-top:0"><span class="delta ${d<0?'neg':''}">${d>=0?'\u25B2':'\u25BC'} ${inrWords(Math.abs(d))}</span></td></tr>`; }
  return `<tr class="${bold?'bold':''}"><td>${label}</td><td class="${p1b?'green':''}">${f(v1)}</td><td class="${p2b?'green':''}">${f(v2)}</td></tr>${delta}`;
}
function brtResults(s,c,tmlWins,winner){
  const r1=c.product1,r2=c.product2,yrs=Math.round(c.years);
  const n1=s.product1.name,n2=s.product2.name;
  let html=customerCard(s, brtShowErr, renderBrt);
  html+=`<div id="brtHero">${heroBox(tmlWins?('Extra profit per year with '+n1):('Profit gap per year vs '+n2), c.extraProfitPerYear,
    'Over '+yrs+' years of operation: '+inrWords(c.extraProfitOverYears))}</div>`;
  html+=`<div class="card">${numField('Years of operation', s.compareYears, v=>{s.compareYears=v;}, {suffix:'years', wrapId:'brtYearsWrap', rerender:()=>softUpdateBrtYears()})}</div>`;

  // bar chart
  const maxP=Math.max(1, r1.operatingProfitPerYear, r2.operatingProfitPerYear);
  html+=`<div class="card"><div class="sect-title">Profit per year &mdash; visual comparison</div>
    <div class="bar-item"><div class="lab"><b>${escapeHtml(n1)}</b><b>${inrWords(r1.operatingProfitPerYear)}</b></div>
      <div class="track"><div class="fill" style="width:${Math.max(2,r1.operatingProfitPerYear/maxP*100)}%;background:#00529C"></div></div></div>
    <div class="bar-item"><div class="lab"><b>${escapeHtml(n2)}</b><b>${inrWords(r2.operatingProfitPerYear)}</b></div>
      <div class="track"><div class="fill" style="width:${Math.max(2,r2.operatingProfitPerYear/maxP*100)}%;background:#9AA4AF"></div></div></div>
  </div>`;

  // cost donut
  const slices=[['Fuel',r1.fuelCostPerYear,'#00529C'],['Tyres',r1.tyreCostPerYear,'#1C7293'],['DEF',r1.defCostPerYear,'#21A0A0'],
    ['Maintenance',r1.maintenanceCostPerYear,'#6FB07F'],['Toll & addl.',r1.tollAndAddlPerYear,'#E0A458'],
    ['Fixed',r1.totalFixedCost,'#B85042'],['EMI',r1.emiPerYear,'#6D5B97']];
  html+=`<div class="card"><div class="sect-title">Where the money goes &mdash; ${escapeHtml(n1)}</div>
    <div class="donut-wrap">${donutSvg(slices)}<div class="legend">
    ${slices.map(([l,v,c2])=>`<div class="li"><span class="sw" style="background:${c2}"></span>${l} ${Math.round(v/slices.reduce((a,x)=>a+x[1],0)*100)}%</div>`).join('')}
    </div></div></div>`;

  // comparison table
  html+=`<div class="card"><div class="sect-title">Side-by-side comparison (per year)</div>
    <table class="cmp"><tr><th>Per year</th><th>${escapeHtml(n1)}</th><th>${escapeHtml(n2)}</th></tr>
    ${cmpRow('Initial cost', r1.initialCost, r2.initialCost, {lowerBetter:true})}
    ${cmpRow('Tons carried / year', r1.payloadTonsPerYear, r2.payloadTonsPerYear, {currency:false})}
    ${cmpRow('Freight earned', r1.freightPerYear, r2.freightPerYear, {bold:true})}
    ${cmpRow('Fuel cost', r1.fuelCostPerYear, r2.fuelCostPerYear, {lowerBetter:true})}
    ${cmpRow('DEF cost', r1.defCostPerYear, r2.defCostPerYear, {lowerBetter:true})}
    ${cmpRow('Tyre cost', r1.tyreCostPerYear, r2.tyreCostPerYear, {lowerBetter:true})}
    ${cmpRow('Maintenance', r1.maintenanceCostPerYear, r2.maintenanceCostPerYear, {lowerBetter:true})}
    ${cmpRow('Toll & addl.', r1.tollAndAddlPerYear, r2.tollAndAddlPerYear, {lowerBetter:true})}
    ${cmpRow('Total running cost', r1.totalRunningCost, r2.totalRunningCost, {lowerBetter:true,bold:true})}
    ${cmpRow('Fixed cost', r1.totalFixedCost, r2.totalFixedCost, {lowerBetter:true})}
    ${cmpRow('EMI / year', r1.emiPerYear, r2.emiPerYear, {lowerBetter:true})}
    ${cmpRow('TOTAL OPERATING COST', r1.totalOperatingCost, r2.totalOperatingCost, {lowerBetter:true,bold:true})}
    ${cmpRow('Cost per km', r1.costPerKm, r2.costPerKm, {lowerBetter:true,dec:2})}
    ${cmpRow('Cost per ton-km', r1.costPerTonKm, r2.costPerTonKm, {lowerBetter:true,dec:2})}
    ${cmpRow('OPERATING PROFIT / YEAR', r1.operatingProfitPerYear, r2.operatingProfitPerYear, {bold:true,showDelta:true})}
    </table>
    <div class="foot-note">Green = better parameter (lower cost / higher revenue &amp; profit). Equal values not highlighted.</div>
  </div>`;

  html+=missingNotice(!s.name.trim());
  html+=`<button class="btn btn-primary" onclick="brtShare()">&#128196; Share PDF comparison with customer</button>`;
  html+=`<button class="btn btn-outline" onclick="brtSave()">Save estimate</button>`;
  html+=`<div class="foot-note">EMI: reducing-balance over (tenure &minus; moratorium) months. Insurance as % of initial cost. Indicative planning tool.</div>`;
  return html;
}
function donutSvg(slices){
  const total=slices.reduce((a,s)=>a+s[1],0)||1;
  const R=54,r=30,cx=60,cy=60; let a=-Math.PI/2; let paths='';
  slices.forEach(([l,v,col])=>{
    const ang=v/total*2*Math.PI, a2=a+ang;
    const x1=cx+R*Math.cos(a),y1=cy+R*Math.sin(a),x2=cx+R*Math.cos(a2),y2=cy+R*Math.sin(a2);
    const xi2=cx+r*Math.cos(a2),yi2=cy+r*Math.sin(a2),xi1=cx+r*Math.cos(a),yi1=cy+r*Math.sin(a);
    const large=ang>Math.PI?1:0;
    paths+=`<path d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${col}"/>`;
    a=a2;
  });
  return `<svg width="120" height="120" viewBox="0 0 120 120">${paths}</svg>`;
}
function brtShow(){
  const s=State.brt; const c=BrtLogic.compare(brtModel(s.product1), brtModel(s.product2), toD(s.compareYears,5));
  const tmlWins=c.extraProfitPerYear>=0, winner=tmlWins?s.product1.name:s.product2.name, yrs=Math.round(c.years);
  summaryDialog('Business Return &mdash; Tata vs Competition', s.name,
    tmlWins?('Extra profit / year with '+winner):('Profit gap / year'), c.extraProfitPerYear, [
    [s.product1.name+' profit/yr', inr(c.product1.operatingProfitPerYear), true],
    [s.product2.name+' profit/yr', inr(c.product2.operatingProfitPerYear), false],
    ['Over '+yrs+' years', inr(c.extraProfitOverYears), true],
  ]);
}
function brtSave(){ const s=State.brt; if(!s.name.trim()){brtShowErr=true;brtTab=2;renderBrt();toast('Enter customer name first');return;} Store.save('BRT','BRT', s, JSON.stringify(s)); toast('Estimate saved to dashboard'); }
function brtShare(){ const s=State.brt; if(!s.name.trim()){brtShowErr=true;brtTab=2;renderBrt();toast('Enter customer name to share');return;} buildBrtPdf(s); }

/* ============================ Dashboard ================================= */
let dashQuery='', dashSort='newest';
function renderDash(){
  const all=Store.list();
  let html='';
  if(!all.length){
    html=`<div class="empty"><svg viewBox="0 0 24 24"><path d="M4 7h16v12H4z"/><path d="M4 7l3-3h5l2 3"/></svg>
      <b>No saved estimates yet</b><p style="font-size:13px">Use &ldquo;Save estimate&rdquo; inside any calculator and it will appear here.</p></div>`;
    document.getElementById('screen-dash').innerHTML=html; return;
  }
  const q=dashQuery.trim().toLowerCase();
  let list=all.filter(e=>!q || (e.customerName+e.location+e.route+e.typeLabel).toLowerCase().includes(q));
  if(dashSort==='newest') list.sort((a,b)=>b.savedAt-a.savedAt);
  else if(dashSort==='name') list.sort((a,b)=>(a.customerName||'').toLowerCase().localeCompare((b.customerName||'').toLowerCase()));
  else list.sort((a,b)=>a.typeLabel.localeCompare(b.typeLabel));

  html+=`<div class="search-row">
    <div class="sbox"><span class="si">&#128269;</span><input placeholder="Search customer, route, type" value="${escapeHtml(dashQuery)}" oninput="dashQuery=this.value;renderDashList()"></div>
    <button class="sortbtn" onclick="dashSortMenu()">&#8645; Sort</button></div>
  <div class="foot-note" style="margin:0 0 8px 4px">${list.length} of ${all.length} estimate${all.length===1?'':'s'} &bull; ${({newest:'Newest first',name:'Customer name',type:'Type'})[dashSort]}</div>
  <div id="dashList"></div>`;
  document.getElementById('screen-dash').innerHTML=html;
  renderDashList();
}
function renderDashList(){
  const all=Store.list(); const q=dashQuery.trim().toLowerCase();
  let list=all.filter(e=>!q || (e.customerName+e.location+e.route+e.typeLabel).toLowerCase().includes(q));
  if(dashSort==='newest') list.sort((a,b)=>b.savedAt-a.savedAt);
  else if(dashSort==='name') list.sort((a,b)=>(a.customerName||'').toLowerCase().localeCompare((b.customerName||'').toLowerCase()));
  else list.sort((a,b)=>a.typeLabel.localeCompare(b.typeLabel));
  const cnt=document.querySelector('#screen-dash .foot-note');
  if(cnt) cnt.innerHTML=`${list.length} of ${all.length} estimate${all.length===1?'':'s'} &bull; ${({newest:'Newest first',name:'Customer name',type:'Type'})[dashSort]}`;
  const el=document.getElementById('dashList'); if(!el) return;
  if(!list.length){ el.innerHTML=`<div class="empty"><b>No matches for &ldquo;${escapeHtml(dashQuery)}&rdquo;</b></div>`; return; }
  el.innerHTML=list.map(e=>`<div class="est-card" onclick="openEstimate('${e.id}')">
    <div class="body"><span class="chip">${e.typeLabel}</span>
      <div class="cn">${escapeHtml(e.customerName||'(No name)')}</div>
      <div class="meta">${[e.location,e.route].filter(Boolean).map(escapeHtml).join(' &bull; ')||'&mdash;'}</div>
      <div class="meta">Saved: ${fmtDate(e.savedAt)}</div></div>
    <button class="del" onclick="event.stopPropagation();delEstimate('${e.id}')">&#128465;</button>
  </div>`).join('');
}
function dashSortMenu(){
  openDialog(`<h3>Sort by</h3>
    ${[['newest','Newest first'],['name','Customer name'],['type','Calculator type']].map(([k,l])=>
      `<button class="btn btn-outline" onclick="dashSort='${k}';closeDialog();renderDash()">${l} ${dashSort===k?'&#10003;':''}</button>`).join('')}`);
}
function delEstimate(id){ Store.delete(id); renderDash(); toast('Estimate deleted'); }
function openEstimate(id){
  const e=Store.list().find(x=>x.id===id); if(!e) return;
  const data=JSON.parse(e.payload);
  if(e.type==='FEMAX'){ State.fe=Object.assign(feDefaults(),data); go('fe'); }
  else if(e.type==='HPT'){ State.hpt=Object.assign(hptDefaults(),data); go('hpt'); }
  else { State.brt=Object.assign(brtDefaults(),data); brtTab=2; go('brt'); }
}

/* ============================ PDF generation (jsPDF) ===================== */
/* A4 portrait, mirrors the Android branded PDFs: lockup header, tagline band,
   banner, customer block, hero, Quick view, tables, dark footer. */
const { jsPDF } = window.jspdf || {};
const PDFC={blue:[0,82,156],blueDark:[0,58,111],green:[27,135,59],greenLt:[230,244,234],
  grey:[96,102,110],dark:[24,28,33],rowAlt:[243,247,251],white:[255,255,255]};

/* PDF-safe formatters: the built-in PDF fonts (Helvetica) have no Indian rupee
   glyph (U+20B9), which renders as a broken superscript. Use "Rs" for PDFs. */
function pinr(v, dec){ return 'Rs ' + nfIN(v, dec||0); }
function pinrWords(v){
  const a=Math.abs(v);
  if(a>=1e7) return 'Rs '+nfIN(v/1e7,2)+' Cr';
  if(a>=1e5) return 'Rs '+nfIN(v/1e5,2)+' Lakh';
  return pinr(Math.round(v));
}
/* strip any stray rupee sign from a pre-formatted string for PDF use */
function pfix(s){ return String(s).replace(/\u20B9\s?/g,'Rs '); }

function PdfDoc(){
  const doc=new jsPDF({unit:'pt',format:'a4'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight();
  const M=40; let y=M;
  function header(){
    // lockup: large, top-left (width 230pt) — matches Android drawHeader
    if(ASSETS.lockup){
      try{
        const props=doc.getImageProperties(ASSETS.lockup);
        const w=230, h=w*props.height/props.width;
        doc.addImage(ASSETS.lockup,'PNG',M,y,w,h);
        y+=h+10;
      }catch(e){ y+=26; }
    } else { y+=26; }
    doc.setDrawColor(200).setLineWidth(1).line(M,y,PW-M,y);
    y+=14;
  }
  function footer(){
    // dark band at the bottom with TATA TRUCKS / DESH KE TRUCKS + disclaimer
    const bandTop=PH-64;
    doc.setFillColor(...PDFC.dark).rect(0,bandTop,PW,64,'F');
    doc.setTextColor(74,174,233).setFont('helvetica','bold').setFontSize(12).text('TATA TRUCKS',M,bandTop+24);
    doc.setTextColor(255).setFont('helvetica','bold').setFontSize(14).text('DESH KE TRUCKS',M,bandTop+42);
    doc.setTextColor(180,186,193).setFont('helvetica','normal').setFontSize(7)
      .text('Indicative planning estimate. Actual results depend on route, load, driver habits & maintenance. T&C apply.',M,PH-10);
  }
  function ensure(h){ if(y+h>PH-90){ footer(); doc.addPage(); y=M; header(); } }
  // Sanitize every string drawn into the PDF: replace the unsupported rupee glyph
  // with "Rs" so nothing renders distorted.
  const _origText = doc.text.bind(doc);
  doc.text = function(txt, x, yy, opts){
    if (typeof txt === 'string') txt = pfix(txt);
    else if (Array.isArray(txt)) txt = txt.map(t => typeof t==='string' ? pfix(t) : t);
    return _origText(txt, x, yy, opts);
  };
  header();
  return {
    doc,PW,PH,M,
    tagline(t,s){ ensure(70); doc.setFillColor(...PDFC.blue).roundedRect(M,y,PW-2*M,56,8,8,'F');
      doc.setTextColor(255).setFont('helvetica','bold').setFontSize(16).text(t,M+14,y+24);
      doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(211,230,248).text(s,M+14,y+43); y+=70; },
    banner(img,maxH){ if(!img) return; try{
        const props=doc.getImageProperties(img);
        const availW=PW-2*M;
        let w=availW, h=w*props.height/props.width;
        if(h>maxH){ w=maxH*props.width/props.height; h=maxH; }  // too tall: shrink width, keep aspect
        ensure(h+12);
        const left=M+(availW-w)/2;                              // center horizontally
        doc.addImage(img,'JPEG',left,y,w,h);
        y+=h+12;
      }catch(e){} },
    section(t){ ensure(26); doc.setTextColor(...PDFC.blueDark).setFont('helvetica','bold').setFontSize(11).text(t.toUpperCase(),M,y+12); y+=22; },
    kv(pairs){ pairs.forEach(([k,v])=>{ ensure(14);
      doc.setFont('helvetica','normal').setFontSize(9.5).setTextColor(...PDFC.grey).text(k,M,y+11);
      doc.setFont('helvetica','bold').setTextColor(...PDFC.dark).text(String(v),M+170,y+11); y+=14; }); y+=8; },
    hero(cap,amount,sub){ ensure(80); doc.setFillColor(...PDFC.greenLt).roundedRect(M,y,PW-2*M,68,10,10,'F');
      doc.setTextColor(...PDFC.grey).setFont('helvetica','bold').setFontSize(10).text(cap,M+14,y+20);
      doc.setTextColor(...PDFC.green).setFontSize(22).text(amount,M+14,y+46);
      if(sub){ doc.setTextColor(...PDFC.dark).setFont('helvetica','normal').setFontSize(9).text(sub,M+14,y+61); } y+=80; },
    quickView(title,stats){ const rowH=20,boxH=26+stats.length*rowH+10; ensure(boxH+8);
      doc.setFillColor(247,250,253).roundedRect(M,y,PW-2*M,boxH,10,10,'F');
      doc.setDrawColor(...PDFC.blue).setLineWidth(1).roundedRect(M,y,PW-2*M,boxH,10,10,'S');
      doc.setTextColor(...PDFC.blueDark).setFont('helvetica','bold').setFontSize(9.5).text(title.toUpperCase(),M+12,y+16);
      let ry=y+30; stats.forEach(([l,v,hl])=>{ doc.setFontSize(hl?10:9.5);
        doc.setTextColor(...(hl?PDFC.dark:PDFC.grey)).setFont('helvetica',hl?'bold':'normal').text(l,M+12,ry+9);
        doc.setTextColor(...(hl?PDFC.green:PDFC.dark)).setFont('helvetica','bold').text(String(v),PW-M-12,ry+9,{align:'right'}); ry+=rowH; }); y+=boxH+10; },
    barChart(title,items){ ensure(24+items.length*30+8); const maxV=Math.max(1,...items.map(i=>i[1]));
      doc.setTextColor(...PDFC.blueDark).setFont('helvetica','bold').setFontSize(9.5).text(title.toUpperCase(),M,y+12); let ry=y+24;
      const barMax=PW-2*M-110;
      items.forEach(([lab,val,col])=>{ doc.setTextColor(...PDFC.dark).setFont('helvetica','bold').setFontSize(9).text(lab,M,ry+9);
        doc.text(inrWords(val),PW-M,ry+9,{align:'right'});
        doc.setFillColor(238,242,246).roundedRect(M,ry+13,barMax,11,5,5,'F');
        const w=Math.max(2,val/maxV*barMax); doc.setFillColor(...col).roundedRect(M,ry+13,w,11,5,5,'F'); ry+=30; }); y+=24+items.length*30+8; },
    costBreak(title,slices){ const total=slices.reduce((a,s)=>a+s[1],0)||1; const legRows=Math.ceil(slices.length/3);
      const h=24+20+6+legRows*14+6; ensure(h+8);
      doc.setTextColor(...PDFC.blueDark).setFont('helvetica','bold').setFontSize(9.5).text(title.toUpperCase(),M,y+12);
      let bx=M; const barY=y+20, barW=PW-2*M;
      slices.forEach(([l,v,col])=>{ const w=v/total*barW; doc.setFillColor(...col).rect(bx,barY,w,20,'F'); bx+=w; });
      let lx=M,ly=barY+30; doc.setFont('helvetica','normal').setFontSize(8);
      slices.forEach(([l,v,col],idx)=>{ doc.setFillColor(...col).rect(lx,ly-6,8,8,'F');
        doc.setTextColor(...PDFC.dark).text(l+' '+Math.round(v/total*100)+'%',lx+12,ly); 
        if((idx+1)%3===0){lx=M;ly+=14;}else{lx+=(PW-2*M)/3;} }); y+=h+8; },
    table(headers,rows,weights,opts){ opts=opts||{}; const tableW=PW-2*M,rowH=18; const xs=[],cw=[]; let acc=M;
      weights.forEach(w=>{xs.push(acc);cw.push(tableW*w);acc+=tableW*w;}); ensure(rowH*2);
      const clip=(txt,colW)=>{ txt=pfix(String(txt)); const max=colW-8;
        if(doc.getTextWidth(txt)<=max) return txt;
        while(txt.length>1 && doc.getTextWidth(txt+'...')>max) txt=txt.slice(0,-1);
        return txt+'...'; };
      doc.setFillColor(...PDFC.blue).rect(M,y,tableW,rowH,'F');
      doc.setTextColor(255).setFont('helvetica','bold').setFontSize(8.5);
      headers.forEach((h,i)=>doc.text(clip(h,cw[i]),xs[i]+5,y+12.5)); y+=rowH;
      rows.forEach((row,r)=>{ ensure(rowH); if(r%2===1){ doc.setFillColor(...PDFC.rowAlt).rect(M,y,tableW,rowH,'F'); }
        const green=opts.greenMap&&opts.greenMap[r]; const bold=opts.boldRows&&opts.boldRows.has(r);
        row.forEach((cell,i)=>{ doc.setFont('helvetica',(bold||green===i)?'bold':'normal').setFontSize(8.5)
          .setTextColor(...(green===i?PDFC.green:PDFC.dark)); doc.text(clip(cell,cw[i]),xs[i]+5,y+12.5); }); y+=rowH; }); y+=10; },
    note(t){ doc.setFont('helvetica','normal').setFontSize(8).setTextColor(...PDFC.grey);
      const lines=doc.splitTextToSize(t,PW-2*M); ensure(lines.length*11+5); lines.forEach(ln=>{ doc.text(ln,M,y+8); y+=11; }); y+=5; },
    finish(){ footer(); return doc; }
  };
}

function customerPairs(s, extra){
  return [['Customer name',s.name||'\u2014'],['Location',s.location||'\u2014'],['Route of operation',s.route||'\u2014'],
    ['Date',new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})]].concat(extra||[]);
}

function buildFePdf(s){
  const i={monthlyKm:toD(s.monthlyKm),mileage:toD(s.mileage),diesel:toD(s.diesel),years:toD(s.years,5)};
  const base=FeLogic.baseline(i); const sel=FeLogic.savingsTable(i).find(r=>r.pct===s.selectedPct); if(!sel){toast('Enter valid inputs');return;}
  const yrs=Math.round(i.years); const p=PdfDoc();
  p.tagline('Go Further with Every Drop','FE Series Trucks  |  7-10% Better Fuel-Efficiency  |  Next-Gen Turbocharger  |  Aerodynamic Cabin');
  p.banner(ASSETS.fe,150);
  p.section('Customer details');
  p.kv(customerPairs(s,[['Vehicle / Tonnage',s.vehicle],['Monthly running',num(i.monthlyKm)+' km'],
    ['Current mileage',num(i.mileage,2)+' km/l'],['Diesel price',inr(i.diesel)+' / litre'],
    ['Years of operation',yrs+' years']]));
  p.section('Current fuel cost');
  p.table(['Diesel consumed / month','Monthly fuel cost','Yearly fuel cost'],
    [[num(base.litresPerMonth)+' L',inr(base.costPerMonth),inr(base.costPerYear)]],[0.34,0.33,0.33]);
  p.hero('Savings at '+sel.pct+'% better fuel efficiency', pinrWords(sel.savePerYear)+' every year',
    num(sel.litresSaved)+' litres saved/month  |  '+inr(sel.savePerMonth)+'/month  |  '+yrs+'-year savings: '+pinrWords(sel.saveOverYears));
  p.note('FE Series delivers 7-10% better fuel efficiency vs MY2025 and earlier models. T&C apply.');
  sharePdf(p.finish(),'FE_MaX_Estimate','Tata FE Series - Fuel Savings Estimate');
}

function buildHptPdf(s){
  const pt=HptLogic.POINTS[Math.min(s.tonnageIdx,HptLogic.POINTS.length-1)];
  const res=HptLogic.calc({add:toD(s.addlPayload),loadedPct:toD(s.loadedPct),monthlyKm:toD(s.monthlyKm),rate:toD(s.rate),totalYears:toD(s.years,5)});
  const yrs=Math.round(toD(s.years,5)); const p=PdfDoc();
  p.tagline('Carry More. Earn More','Higher Payload Trucks  |  Designed for versatile loads. Enhanced for maximum capacity.');
  p.banner(ASSETS.hpt,80);
  p.section('Customer details');
  p.kv(customerPairs(s));
  p.section('Revenue advantage calculation');
  p.table(['Parameter','Value'],[
    ['Tonnage point',pt.label+' (vs base '+pt.base+')'],
    ['Additional payload',toD(s.addlPayload)+' tonnes'],
    ['Loaded running',toD(s.loadedPct)+' %'],
    ['Monthly running',num(toD(s.monthlyKm))+' km'],
    ['Yearly running',num(res.yearlyKm)+' km'],
    ['Freight rate','Rs '+toD(s.rate)+' per tonne-km'],
    ['Years of operation',yrs+' years']],[0.5,0.5]);
  p.hero('Annual revenue advantage', pinrWords(res.annual)+' / year', 'Lifetime advantage over '+yrs+' years: '+pinrWords(res.lifetime));
  p.note('Every extra tonne carried is direct revenue - same trip, same route, more earnings.');
  sharePdf(p.finish(),'Revenue_MaX_Estimate','Tata High Payload Truck - Revenue Advantage');
}

function buildBrtPdf(s){
  const c=BrtLogic.compare(brtModel(s.product1),brtModel(s.product2),toD(s.compareYears,5));
  const r1=c.product1,r2=c.product2,n1=s.product1.name,n2=s.product2.name,yrs=Math.round(c.years);
  const tmlWins=c.extraProfitPerYear>=0, winner=tmlWins?n1:n2; const p=PdfDoc();
  p.tagline('Ab Profit Hoga Aur Bhi Zyaada','Business Return Template  |  Make transport business decisions');
  p.banner(ASSETS.brt,110);
  p.section('Customer details');
  p.kv(customerPairs(s));
  p.hero('Extra operating profit per year with '+winner, pinrWords(Math.abs(c.extraProfitPerYear))+' / year', 'Over '+yrs+' years of operation: '+pinrWords(Math.abs(c.extraProfitOverYears)));
  p.barChart('Operating profit per year - visual comparison',[[n1,r1.operatingProfitPerYear,PDFC.blue],[n2,r2.operatingProfitPerYear,[154,164,175]]]);
  // comparison table with green highlighting
  const rows=[
    ['Initial cost (vehicle + body)',r1.initialCost,r2.initialCost,true,true,false],
    ['Distance run / year (km)',r1.distancePerYear,r2.distancePerYear,false,false,false],
    ['Tons carried / year',r1.payloadTonsPerYear,r2.payloadTonsPerYear,false,false,false],
    ['Freight earned / year',r1.freightPerYear,r2.freightPerYear,false,true,true],
    ['Fuel cost / year',r1.fuelCostPerYear,r2.fuelCostPerYear,true,true,false],
    ['DEF cost / year',r1.defCostPerYear,r2.defCostPerYear,true,true,false],
    ['Tyre cost / year',r1.tyreCostPerYear,r2.tyreCostPerYear,true,true,false],
    ['Maintenance / year',r1.maintenanceCostPerYear,r2.maintenanceCostPerYear,true,true,false],
    ['Toll & addl. / year',r1.tollAndAddlPerYear,r2.tollAndAddlPerYear,true,true,false],
    ['Total running cost / year',r1.totalRunningCost,r2.totalRunningCost,true,true,true],
    ['Fixed cost / year',r1.totalFixedCost,r2.totalFixedCost,true,true,false],
    ['EMI / year',r1.emiPerYear,r2.emiPerYear,true,true,false],
    ['TOTAL OPERATING COST / year',r1.totalOperatingCost,r2.totalOperatingCost,true,true,true],
    ['Cost per km',r1.costPerKm,r2.costPerKm,true,true,false,2],
    ['Cost per ton-km',r1.costPerTonKm,r2.costPerTonKm,true,true,false,2],
    ['OPERATING PROFIT / YEAR',r1.operatingProfitPerYear,r2.operatingProfitPerYear,false,true,true],
    ['Operating profit / month',r1.operatingProfitPerMonth,r2.operatingProfitPerMonth,false,true,false],
  ];
  const greenMap={},boldRows=new Set();
  const trows=rows.map((r,idx)=>{ const [lab,v1,v2,lower,cur,bold,dec]=r;
    if(v1!==v2){ const p1b=(lower&&v1<v2)||(!lower&&v1>v2); greenMap[idx]=p1b?1:2; }
    if(bold) boldRows.add(idx);
    const f=x=>cur?inr(x,dec||0):num(x,dec||0);
    return [lab,f(v1),f(v2)];
  });
  p.section('Side-by-side business comparison');
  p.table(['Parameter',n1,n2],trows,[0.46,0.27,0.27],{greenMap,boldRows});
  p.costBreak('Where the money goes - '+n1+' (annual operating cost)',[
    ['Fuel',r1.fuelCostPerYear,PDFC.blue],['Tyres',r1.tyreCostPerYear,[28,114,147]],['DEF',r1.defCostPerYear,[33,160,160]],
    ['Maintenance',r1.maintenanceCostPerYear,[111,176,127]],['Toll & addl.',r1.tollAndAddlPerYear,[224,164,88]],
    ['Fixed',r1.totalFixedCost,[184,80,66]],['EMI',r1.emiPerYear,[109,91,151]]]);
  p.note('Green values indicate the better parameter (lower cost / higher revenue & tons). Equal values are not highlighted.');
  p.note('EMI: reducing-balance PMT over (tenure - moratorium) months. Insurance taken as % of initial cost.');
  sharePdf(p.finish(),'BRT_Comparison','Tata Motors - Business Return Comparison');
}

/* Share: preview dialog with Share PDF / Share image / Download options */
async function sharePdf(doc, fileBase, title){
  const blob=doc.output('blob');
  // Rasterise ALL pages of the PDF into one tall image via pdf.js (nothing cut off)
  let imgData=null;
  try{ imgData=await pdfToStackedImage(blob); }catch(e){ imgData=null; }
  openDialog(`<h3>Preview</h3>
    ${imgData?`<img class="preview-img" src="${imgData}" alt="preview">`:'<p style="text-align:center;color:var(--grey)">Preview unavailable — you can still share or download the PDF.</p>'}
    <div class="btn-row">
      <button class="btn btn-primary" id="btnSharePdf">Share / Download PDF</button>
      ${imgData?`<button class="btn btn-outline" id="btnShareImg">Share image</button>`:''}
    </div>
    <button class="btn btn-outline" onclick="closeDialog()">Close</button>`);
  document.getElementById('btnSharePdf').onclick=async ()=>{
    const file=new File([blob],fileBase+'.pdf',{type:'application/pdf'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file],title,text:title}); closeDialog(); return; }catch(e){}
    }
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileBase+'.pdf'; a.click(); closeDialog(); toast('PDF downloaded');
  };
  if(imgData){
    document.getElementById('btnShareImg').onclick=async ()=>{
      const res=await fetch(imgData); const b=await res.blob();
      const file=new File([b],fileBase+'.jpg',{type:'image/jpeg'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        try{ await navigator.share({files:[file],title,text:title}); closeDialog(); return; }catch(e){}
      }
      const a=document.createElement('a'); a.href=imgData; a.download=fileBase+'.jpg'; a.click(); closeDialog(); toast('Image downloaded');
    };
  }
}
/* render all pages of a PDF blob to a single tall JPEG using pdf.js */
async function pdfToStackedImage(blob){
  if(!window.pdfjsLib) throw new Error('pdfjs not loaded');
  const buf=await blob.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
  const scale=2, canvases=[];
  let maxW=0, totalH=0; const gap=12;
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const vp=page.getViewport({scale});
    const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
    await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    canvases.push(cv); maxW=Math.max(maxW,cv.width); totalH+=cv.height+(i>1?gap:0);
  }
  const out=document.createElement('canvas'); out.width=maxW; out.height=totalH;
  const ctx=out.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,maxW,totalH);
  let yy=0; canvases.forEach((cv,idx)=>{ ctx.drawImage(cv,(maxW-cv.width)/2,yy); yy+=cv.height+gap; });
  return out.toDataURL('image/jpeg',0.92);
}

/* ============================ init ====================================== */
// register service worker for offline use (ignored on file://)
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
// hide the install hint if already running as an installed app
if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches){
  var ih=document.getElementById('installHint'); if(ih) ih.style.display='none';
}
go('home');
