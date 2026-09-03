const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DBKEY='solarFaturasHTML_v1';
const db=JSON.parse(localStorage.getItem(DBKEY)||'null')||{clients:[],invoices:[],logs:[],settings:{defaultDiscount:'',defaultShare:50,autoClients:true,autoEnabled:false,emailEnabled:false,cron:'0 8 * * *'}};
if(!db.solar) db.solar={plants:[{id:'cd0f6bee-8a45-4e2b-8070-3e9e93d49320',name:'Usina 01',url:'https://app.solarz.com.br/pages/shareable/usina/cd0f6bee-8a45-4e2b-8070-3e9e93d49320',production:0},{id:'a51f2c3f-3981-4257-a468-d7508ff32e31',name:'Usina 02',url:'https://app.solarz.com.br/pages/shareable/usina/a51f2c3f-3981-4257-a468-d7508ff32e31',production:0}],updatedAt:null};
const save=()=>localStorage.setItem(DBKEY,JSON.stringify(db));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=v=>Number(String(v??'').replace(/\./g,'').replace(',','.'))||0;
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2500)};
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

function go(id){
  $$('.page').forEach(x=>x.classList.remove('active'));
  $('#'+id).classList.add('active');
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===id));
  $('#title').textContent={dashboard:'Dashboard',importar:'Importar PDF',clientes:'Clientes',faturas:'Faturas',creditos:'Usinas e Créditos',automacao:'Automação',config:'Configurações'}[id];
  renderAll();
}
$$('.nav').forEach(b=>b.onclick=()=>go(b.dataset.page));

/*
  REGRA FINANCEIRA
  1) Energia = consumo x (TUSD + TE)
  2) Aplica desconto do cliente
  3) 50% da conta/taxa Coelba é somada à cobrança do cliente
  4) O Dashboard contabiliza 100% da conta/taxa Coelba como custo
  5) Lucro = total a receber - 100% das taxas Coelba
*/
function calc(d){
  const consumption=Math.max(0,Number(d.curr||0)-Number(d.prev||0));
  const kwh=Number(d.tusd||0)+Number(d.te||0);
  const gross=consumption*kwh;
  const discount=gross*(Number(d.discount||0)/100);
  const discounted=gross-discount;
  const clientShare=Number(d.bill||0)*0.5;
  const otherShare=Math.max(0,Number(d.bill||0)-clientShare);
  return {consumption,kwh,gross,discount,discounted,share:clientShare,clientShare,otherShare,final:discounted+clientShare};
}

function normalizedInvoice(i){
  const share=Number(i.clientShare ?? i.share ?? (Number(i.bill||0)*0.5));
  const otherShare=Number(i.otherShare ?? Math.max(0,Number(i.bill||0)-share));
  return {...i,share,clientShare:share,otherShare};
}

function getInvoiceAddress(i){
  if(i.address) return i.address;
  const c=db.clients.find(c=>c.id===i.clientId);
  return c?.address||'';
}

function renderAll(){renderDashboard();renderClients();renderInvoices();renderCredits();renderSettings();renderLogs()}

function renderDashboard(){
  const invoices=db.invoices.map(normalizedInvoice);
  const pending=invoices.filter(i=>i.status==='pending');
  const paid=invoices.filter(i=>i.status==='paid');
  const valid=invoices.filter(i=>i.status!=='review');
  const coelbaFeesTotal=valid.reduce((a,b)=>a+Number(b.bill||0),0);
  const receivableTotal=pending.reduce((a,b)=>a+Number(b.final||0),0);
  const profitTotal=receivableTotal-coelbaFeesTotal;

  $('#sClients').textContent=db.clients.length;
  $('#sInvoices').textContent=db.invoices.length;
  $('#sReceivable').textContent=money(receivableTotal);
  $('#sPaid').textContent=money(paid.reduce((a,b)=>a+Number(b.final||0),0));
  if($('#sCoelbaFees')) $('#sCoelbaFees').textContent=money(coelbaFeesTotal);
  if($('#sProfit')) $('#sProfit').textContent=money(profitTotal);
  $('#sReview').textContent=db.invoices.filter(i=>i.status==='review').length;

  $('#recent').innerHTML=invoices.slice(-6).reverse().map(i=>`<div class="recent-row"><div><b>${esc(i.clientName||'Cliente')}</b><small>${esc(getInvoiceAddress(i)||'Endereço não identificado')} · ${esc(i.reference||'-')}</small></div><strong>${money(i.final)}</strong><span class="badge ${i.status==='paid'?'ok':i.status==='review'?'warn':'info'}">${labelStatus(i.status)}</span></div>`).join('')||'<div class="empty">Nenhuma fatura ainda.</div>';
}


function kwh(v){return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh'}
function creditInvoices(){return db.invoices.map(normalizedInvoice).filter(i=>i.status!=='review')}
function renderCredits(){
  const grid=$('#plantGrid');
  if(!grid)return;
  const plants=db.solar?.plants||[];
  const produced=plants.reduce((sum,p)=>sum+Number(p.production||0),0);
  const used=creditInvoices().reduce((sum,i)=>sum+Number(i.consumption||0),0);
  const balance=produced-used;
  const rate=produced>0?Math.min(100,(used/produced)*100):0;
  $('#creditProduced').textContent=kwh(produced);
  $('#creditUsed').textContent=kwh(used);
  $('#creditBalance').textContent=kwh(balance);
  $('#creditUseRate').textContent=rate.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  $('#creditBalance').classList.toggle('negative-value',balance<0);
  grid.innerHTML=plants.map((p,idx)=>`<article class="card plant-card">
    <div class="plant-head"><div><p class="eyebrow">USINA ${String(idx+1).padStart(2,'0')}</p><h2>${esc(p.name)}</h2></div><span class="badge info">SOLARZ</span></div>
    <label class="plant-input-label">Créditos produzidos acumulados (kWh)<input class="plant-production" type="number" min="0" step="0.01" data-plant="${esc(p.id)}" value="${Number(p.production||0)}"></label>
    <div class="plant-meta"><span>Última atualização</span><b>${db.solar.updatedAt?esc(db.solar.updatedAt):'Ainda não atualizada'}</b></div>
    <div class="plant-actions"><a class="btn plant-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Abrir usina na SolarZ ↗</a><button class="btn primary save-production" type="button" data-plant="${esc(p.id)}">Salvar produção</button></div>
  </article>`).join('');
  $$('.save-production').forEach(btn=>btn.addEventListener('click',()=>savePlantProduction(btn.dataset.plant)));
  $$('.plant-production').forEach(inp=>inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();savePlantProduction(inp.dataset.plant)}}));
}
function savePlantProduction(id){
  const plant=db.solar.plants.find(p=>p.id===id); if(!plant)return;
  const input=document.querySelector(`.plant-production[data-plant="${id}"]`); if(!input)return;
  plant.production=Math.max(0,Number(input.value||0));
  db.solar.updatedAt=new Date().toLocaleString('pt-BR');
  save(); renderCredits(); toast('Produção da usina atualizada');
}

function labelStatus(s){return s==='paid'?'PAGA':s==='review'?'REVISAR':'PENDENTE'}

function renderClients(){
  const q=($('#clientSearch')?.value||'').toLowerCase();
  $('#clientsBody').innerHTML=db.clients.filter(c=>[c.name,c.installation,c.code,c.address].join(' ').toLowerCase().includes(q)).map(c=>`<tr><td><b>${esc(c.name)}</b><small>${esc(c.unit||'')}</small><small class="address-mini">${esc(c.address||'')}</small></td><td>${esc(c.installation||'-')}</td><td>${esc(c.code||'-')}</td><td>${c.discount===''?'—':c.discount+'%'}</td><td>${c.share}%</td><td><button class="mini" onclick="openClient('${c.id}')">Editar</button> <button class="mini danger" onclick="delClient('${c.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhum cliente cadastrado.</td></tr>';
}
$('#clientSearch').oninput=renderClients;

function openClient(id){
  const c=db.clients.find(x=>x.id===id)||{id:'',name:'',installation:'',code:'',phone:'',email:'',discount:db.settings.defaultDiscount,share:db.settings.defaultShare||50,unit:'',address:''};
  $('#cid').value=c.id; $('#cname').value=c.name; $('#cinst').value=c.installation; $('#ccode').value=c.code; $('#cphone').value=c.phone; $('#cemail').value=c.email; $('#cdiscount').value=c.discount; $('#cshare').value=50; $('#cunit').value=c.unit; $('#caddress').value=c.address; $('#modal').classList.add('open');
}
function closeModal(){$('#modal').classList.remove('open')}
$('#clientForm').onsubmit=e=>{
  e.preventDefault();
  const id=$('#cid').value||uid();
  const c={id,name:$('#cname').value.trim(),installation:$('#cinst').value.trim(),code:$('#ccode').value.trim(),phone:$('#cphone').value.trim(),email:$('#cemail').value.trim(),discount:$('#cdiscount').value,share:50,unit:$('#cunit').value.trim(),address:$('#caddress').value.trim()};
  const ix=db.clients.findIndex(x=>x.id===id); ix>=0?db.clients[ix]=c:db.clients.push(c);
  save(); closeModal(); renderAll(); toast('Cliente salvo');
}
function delClient(id){if(confirm('Excluir este cliente?')){db.clients=db.clients.filter(x=>x.id!==id);save();renderAll()}}

function renderInvoices(){
  const st=$('#status')?.value||'all';
  const filtered=db.invoices.filter(i=>st==='all'||i.status===st).slice().reverse();
  const rows=filtered.map(raw=>{
    const i=normalizedInvoice(raw);
    const address=getInvoiceAddress(i);
    const pixId='pixqr_'+String(i.id).replace(/[^a-zA-Z0-9_-]/g,'');
    return `<tr>
      <td class="pix-cell">${i.pixCode?`<div class="pix-box"><div id="${pixId}" class="pix-qr"></div><button class="mini pix-copy" onclick="copyPix('${i.id}')">Copiar PIX</button></div>`:'<span class="pix-missing">PIX não identificado</span>'}</td>
      <td class="address-cell"><span class="pin">⌖</span><span>${esc(address||'Não identificado')}</span></td>
      <td><b>${esc(i.clientName)}</b></td>
      <td>${esc(i.reference||'-')}</td>
      <td>${Number(i.consumption||0).toFixed(2)} kWh</td>
      <td>${Number(i.discount||0)}%</td>
      <td>${money(i.clientShare)}</td>
      <td><b class="other-share">${money(i.otherShare)}</b></td>
      <td><b>${money(i.final)}</b></td>
      <td>${esc(i.source||'PDF')}</td>
      <td><span class="badge ${i.status==='paid'?'ok':i.status==='review'?'warn':'info'}">${labelStatus(i.status)}</span></td>
      <td><div class="actions"><button class="mini" onclick="openInvoice('${i.id}')">Baixar fatura</button><button class="mini" onclick="togglePaid('${i.id}')">${i.status==='paid'?'Reabrir':'Marcar paga'}</button><button class="mini danger" onclick="delInvoice('${i.id}')">Excluir</button></div></td>
    </tr>`;
  }).join('');
  $('#invoicesBody').innerHTML=rows||'<tr><td colspan="12" class="empty">Nenhuma fatura.</td></tr>';
  if(window.QRCode){
    filtered.forEach(raw=>{
      const i=normalizedInvoice(raw);
      if(!i.pixCode)return;
      const el=document.getElementById('pixqr_'+String(i.id).replace(/[^a-zA-Z0-9_-]/g,''));
      if(el){el.innerHTML='';new QRCode(el,{text:i.pixCode,width:92,height:92,correctLevel:QRCode.CorrectLevel.M});}
    });
  }
}
function copyPix(id){
  const i=db.invoices.find(x=>x.id===id);
  if(!i?.pixCode){toast('Código PIX não identificado nesta fatura');return}
  navigator.clipboard?.writeText(i.pixCode).then(()=>toast('Código PIX copiado')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=i.pixCode;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Código PIX copiado');
  });
}

$('#status').onchange=renderInvoices;
if($('#refreshCredits')) $('#refreshCredits').onclick=()=>{renderCredits();toast('Saldo de créditos recalculado')};
function togglePaid(id){const i=db.invoices.find(x=>x.id===id);if(i){i.status=i.status==='paid'?'pending':'paid';save();renderAll()}}
function delInvoice(id){if(confirm('Excluir esta fatura?')){db.invoices=db.invoices.filter(x=>x.id!==id);save();renderAll()}}

function renderSettings(){
  if(!$('#defaultShare'))return;
  $('#defaultDiscount').value=db.settings.defaultDiscount;
  $('#defaultShare').value=50;
  $('#autoClients').checked=db.settings.autoClients;
  $('#autoEnabled').checked=db.settings.autoEnabled;
  $('#cron').value=db.settings.cron;
  $('#emailEnabled').checked=db.settings.emailEnabled;
}
$('#settingsForm').onsubmit=e=>{
  e.preventDefault();
  db.settings={defaultDiscount:$('#defaultDiscount').value,defaultShare:50,autoClients:$('#autoClients').checked,autoEnabled:$('#autoEnabled').checked,emailEnabled:$('#emailEnabled').checked,cron:$('#cron').value};
  save(); toast('Configurações salvas');
}
function log(msg){db.logs.unshift({at:new Date().toLocaleString('pt-BR'),msg});db.logs=db.logs.slice(0,50);save();renderLogs()}
function renderLogs(){$('#logs').innerHTML=db.logs.map(l=>`<div class="log"><small>${esc(l.at)}</small><span>${esc(l.msg)}</span></div>`).join('')||'<div class="empty">Nenhuma execução ainda.</div>'}
$('#runAuto').onclick=()=>{log('Verificação manual executada. Em versão HTML pura, o navegador só processa arquivos enviados enquanto a página está aberta.');$('#autoResult').innerHTML='<div class="notice">Verificação concluída. Para buscar sozinho no site da Coelba com o computador desligado, é necessário backend/servidor.</div>'}

async function extractPdf(file){
  if(!window.pdfjsLib)throw new Error('Biblioteca PDF não carregou. Verifique sua internet.');
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let text='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    text+='\n'+tc.items.map(x=>x.str).join(' ');
  }
  return text;
}
function match(text,re){const m=text.match(re);return m?m[1].trim():''}

function cleanAddress(v){
  return String(v||'')
    .replace(/\s+/g,' ')
    .replace(/\s+(?:CPF|CNPJ|CÓDIGO DO CLIENTE|CODIGO DO CLIENTE|CÓDIGO DA INSTALAÇÃO|CODIGO DA INSTALACAO|VENCIMENTO|REF:?MÊS\/ANO).*$/i,'')
    .replace(/\s{2,}/g,' ')
    .trim()
    .replace(/[|;,-]+$/,'')
    .trim();
}

function extractAddress(clean){
  const patterns=[
    /ENDERE[ÇC]O(?:\s+DA\s+UNIDADE\s+CONSUMIDORA)?\s*:?\s*(.{8,180}?)(?=\s+(?:CEP|CPF|CNPJ|C[ÓO]DIGO DO CLIENTE|C[ÓO]DIGO DA INSTALA[ÇC][ÃA]O|REF:?M[ÊE]S\/ANO|VENCIMENTO|CLASSIFICA[ÇC][ÃA]O))/i,
    /ENDERE[ÇC]O\s*:?\s*(.{8,180}?\b(?:BA|Bahia)\b)/i,
    /(?:RUA|AV(?:ENIDA)?|TRAVESSA|TV\.?|PRA[ÇC]A|RODOVIA|FAZENDA|ESTRADA|POVOADO|LOTEAMENTO|ALAMEDA)\s+.{5,160}?(?:\b\d{5}-?\d{3}\b|\bBA\b)/i
  ];
  for(const re of patterns){
    const m=clean.match(re);
    if(m){
      const candidate=cleanAddress(m[1]||m[0]);
      if(candidate.length>=8) return candidate;
    }
  }
  return '';
}

function extractPixCode(text){
  const compact=String(text||'').replace(/\s+/g,'');
  const starts=[]; let pos=compact.indexOf('000201');
  while(pos>=0){starts.push(pos);pos=compact.indexOf('000201',pos+1)}
  for(const start of starts){
    const tail=compact.slice(start,start+800);
    const crc=tail.match(/6304([0-9A-Fa-f]{4})/);
    if(crc){
      const end=(crc.index||0)+8;
      const code=tail.slice(0,end);
      if(code.length>=80)return code;
    }
  }
  const loose=String(text||'').match(/(?:PIX\s+Copia\s+e\s+Cola|PIX\s+COPIA\s+E\s+COLA|BR\s*CODE)[^0-9A-Za-z]{0,40}([0-9A-Za-z.\-]{80,})/i);
  return loose?loose[1].replace(/\s+/g,''):'';
}

function parseNeoenergia(text){
  const clean=text.replace(/\s+/g,' ');
  const name=match(clean,/NOME DO CLIENTE:?\s*([A-ZÀ-Ú0-9 .'-]+?)\s+(?:CPF|CNPJ|ENDEREÇO)/i);
  const installation=match(clean,/C[ÓO]DIGO DA INSTALA[ÇC][ÃA]O\s*([0-9]+)/i);
  const code=match(clean,/C[ÓO]DIGO DO CLIENTE\s*([0-9]+)/i);
  const reference=match(clean,/REF:?M[ÊE]S\/ANO\s*([0-9]{2}\/20[0-9]{2})/i)||match(clean,/\b([0-9]{2}\/20[0-9]{2})\b/);
  const due=match(clean,/VENCIMENTO\s*([0-9]{2}\/[0-9]{2}\/20[0-9]{2})/i);
  const total=num(match(clean,/TOTAL A PAGAR R\$\s*([0-9.,]+)/i));
  const address=extractAddress(clean);
  const pixCode=extractPixCode(text);
  let prev=0,curr=0;
  const meter=clean.match(/LEITURA\s+ANTERIOR\s+ATUAL.*?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s+1,00000/i);
  if(meter){prev=num(meter[1]);curr=num(meter[2])}
  else {
    const m=clean.match(/Energia Ativa.*?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i);
    if(m){prev=num(m[1]);curr=num(m[2])}
  }
  const tusd=num(match(clean,/Consumo-TUSD\s+kWh\s+[0-9.,]+\s+([0-9.,]+)/i));
  const te=num(match(clean,/Consumo-TE\s+kWh\s+[0-9.,]+\s+([0-9.,]+)/i));
  return {name,installation,code,reference,due,total,address,pixCode,prev,curr,tusd,te,text:clean};
}

let pending=null;
let pendingQueue=[];
let batchTotal=0;
let batchDone=0;

$('#pdf').onchange=e=>handleFiles(e.target.files);
['dragenter','dragover'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.add('hover')}));
['dragleave','drop'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.remove('hover')}));
$('#drop').addEventListener('drop',e=>handleFiles(e.dataTransfer.files));

async function parsePdfFile(file){
  if(!file)return null;
  if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error(`${file.name}: arquivo não é PDF`);
  const text=await extractPdf(file);
  const p=parseNeoenergia(text);
  let client=db.clients.find(c=>(p.installation&&c.installation===p.installation)||(p.code&&c.code===p.code));
  if(!client&&db.settings.autoClients&&p.name){
    client={id:uid(),name:p.name,installation:p.installation,code:p.code,phone:'',email:'',discount:db.settings.defaultDiscount,share:db.settings.defaultShare||50,unit:'',address:p.address||''};
    db.clients.push(client); save(); log('Cliente criado automaticamente: '+p.name);
  } else if(client && p.address && !client.address){
    client.address=p.address; save();
  }
  return {...p,fileName:file.name,client};
}

async function handleFiles(fileList){
  const files=[...(fileList||[])];
  if(!files.length)return;
  const pdfs=files.filter(f=>f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf'));
  if(!pdfs.length){toast('Selecione arquivos PDF');return}
  batchTotal=pdfs.length; batchDone=0; pendingQueue=[]; pending=null;
  $('#uploadProgress').classList.remove('hidden');
  $('#preview').innerHTML=`<div class="empty">Preparando ${pdfs.length} PDF${pdfs.length>1?'s':''}...</div>`;
  const errors=[];
  for(let n=0;n<pdfs.length;n++){
    const file=pdfs[n];
    $('#uploadProgress div').style.width=`${Math.max(5,Math.round((n/pdfs.length)*100))}%`;
    $('#preview').innerHTML=`<div class="empty">Lendo ${n+1} de ${pdfs.length}: <b>${esc(file.name)}</b></div>`;
    try{
      const item=await parsePdfFile(file);
      if(item) pendingQueue.push(item);
    }catch(err){errors.push(err.message||`${file.name}: erro ao ler`)}
  }
  $('#uploadProgress div').style.width='100%';
  setTimeout(()=>$('#uploadProgress').classList.add('hidden'),500);
  if(!pendingQueue.length){
    $('#preview').innerHTML=`<div class="notice danger">Nenhum PDF pôde ser lido.${errors.length?'<br>'+errors.map(esc).join('<br>'):''}</div>`;
    return;
  }
  pending=pendingQueue.shift();
  renderPreview();
  if(errors.length) toast(`${errors.length} arquivo(s) não puderam ser lidos`);
}

function renderPreview(){
  const p=pending;if(!p)return;
  const discount=p.client?.discount!==''&&p.client?.discount!=null?p.client.discount:db.settings.defaultDiscount;
  const share=p.client?.share??db.settings.defaultShare??50;
  const c=calc({prev:p.prev,curr:p.curr,tusd:p.tusd,te:p.te,bill:p.total,discount,share});
  const currentNumber=batchTotal?batchDone+1:1;
  const batchInfo=batchTotal>1?`<div class="batch-info"><b>PDF ${currentNumber} de ${batchTotal}</b><span>${pendingQueue.length} aguardando revisão</span></div>`:'';
  $('#preview').innerHTML=`${batchInfo}<div class="preview-grid">
    <div><small>Cliente</small><b>${esc(p.name||'Não identificado')}</b></div>
    <div><small>Endereço da conta</small><b>${esc(p.address||p.client?.address||'Não identificado')}</b></div>
    <div><small>Instalação</small><b>${esc(p.installation||'-')}</b></div>
    <div><small>Referência</small><b>${esc(p.reference||'-')}</b></div>
    <div><small>Vencimento</small><b>${esc(p.due||'-')}</b></div>
    <div><small>Leitura anterior</small><b>${p.prev||'-'}</b></div>
    <div><small>Leitura atual</small><b>${p.curr||'-'}</b></div>
    <div><small>TUSD</small><b>${p.tusd||'-'}</b></div>
    <div><small>TE</small><b>${p.te||'-'}</b></div>
    <div><small>Conta/taxa Coelba</small><b>${money(p.total)}</b></div>
    <div><small>PIX da Coelba</small><b>${p.pixCode?'Identificado ✓':'Não identificado'}</b></div>
    <div><small>50% somado ao cliente</small><b>${money(c.clientShare)}</b></div>
    <div><small>Outros 50% contabilizados</small><b>${money(c.otherShare)}</b></div>
    <div><small>Consumo calculado</small><b>${c.consumption.toFixed(2)} kWh</b></div>
  </div><button class="btn primary full" onclick="openReviewFromPending()">Revisar e gerar cobrança</button><small class="muted">Confira os campos antes de confirmar, pois PDFs podem variar de layout.</small>`;
}

function openReviewFromPending(){
  const p=pending;if(!p)return;
  $('#rid').value=''; $('#rprev').value=p.prev; $('#rcurr').value=p.curr; $('#rtusd').value=p.tusd; $('#rte').value=p.te; $('#rbill').value=p.total;
  $('#rdisc').value=p.client?.discount!==''&&p.client?.discount!=null?p.client.discount:db.settings.defaultDiscount;
  $('#rshare').value=50;
  $('#reviewModal').classList.add('open'); updateLive();
}
function closeReview(){$('#reviewModal').classList.remove('open')}
['rprev','rcurr','rtusd','rte','rbill','rdisc','rshare'].forEach(id=>$('#'+id).oninput=updateLive);
function updateLive(){
  const c=calc({prev:$('#rprev').value,curr:$('#rcurr').value,tusd:$('#rtusd').value,te:$('#rte').value,bill:$('#rbill').value,discount:$('#rdisc').value,share:$('#rshare').value});
  $('#liveCalc').innerHTML=`<div><small>Consumo</small><b>${c.consumption.toFixed(2)} kWh</b></div><div><small>kWh (TUSD + TE)</small><b>${money(c.kwh)}</b></div><div><small>Energia antes desconto</small><b>${money(c.gross)}</b></div><div><small>Desconto</small><b>- ${money(c.discount)}</b></div><div><small>50% somado ao cliente</small><b>+ ${money(c.clientShare)}</b></div><div><small>Outros 50% da taxa</small><b>${money(c.otherShare)}</b></div><div class="total"><small>VALOR FINAL DO CLIENTE</small><strong>${money(c.final)}</strong></div>`;
}

$('#reviewForm').onsubmit=e=>{
  e.preventDefault(); if(!pending)return;
  let client=pending.client;
  if(!client){
    client=db.clients.find(c=>c.installation===pending.installation||c.code===pending.code);
    if(!client){
      client={id:uid(),name:pending.name||'Cliente sem nome',installation:pending.installation,code:pending.code,phone:'',email:'',discount:$('#rdisc').value,share:50,unit:'',address:pending.address||''};
      db.clients.push(client);
    }
  }
  if(pending.address && !client.address) client.address=pending.address;
  const data={prev:Number($('#rprev').value),curr:Number($('#rcurr').value),tusd:Number($('#rtusd').value),te:Number($('#rte').value),bill:Number($('#rbill').value),discount:Number($('#rdisc').value),share:50};
  const c=calc(data);
  const duplicate=db.invoices.some(i=>i.clientId===client.id&&i.reference===pending.reference);
  if(duplicate&&!confirm('Já existe uma fatura deste cliente para esta referência. Salvar mesmo assim?'))return;
  db.invoices.push({id:uid(),clientId:client.id,clientName:client.name,address:pending.address||client.address||'',pixCode:pending.pixCode||'',reference:pending.reference,due:pending.due,source:'PDF',fileName:pending.fileName,status:'pending',...data,...c,createdAt:new Date().toISOString()});
  save(); log(`Fatura ${pending.reference||''} processada para ${client.name}: ${money(c.final)} | taxa Coelba integral: ${money(data.bill)}`);
  closeReview(); batchDone++; renderAll(); toast('Cobrança gerada');
  if(pendingQueue.length){
    pending=pendingQueue.shift();
    renderPreview();
    go('importar');
  }else{
    pending=null; $('#pdf').value='';
    $('#preview').innerHTML=`<div class="notice"><b>${batchTotal>1?batchDone+' faturas processadas com sucesso.':'Fatura salva com sucesso.'}</b><br><span>Você pode selecionar novos PDFs quando quiser.</span></div>`;
    batchTotal=0; batchDone=0;
    go('dashboard');
  }
}

let currentInvoiceId=null;
function openInvoice(id){
  const raw=db.invoices.find(x=>x.id===id); if(!raw)return;
  currentInvoiceId=id;
  const i=normalizedInvoice(raw);
  const address=getInvoiceAddress(i)||'Endereço não informado';
  $('#invoicePaper').innerHTML=`<div class="invoice-sheet">
    <div class="invoice-brand"><div><span class="invoice-logo">☀</span><strong>Solar Faturas Pro</strong><small>Demonstrativo de cobrança</small></div><span class="invoice-status">${labelStatus(i.status)}</span></div>
    <div class="invoice-title"><div><small>CLIENTE</small><h2>${esc(i.clientName||'Cliente')}</h2><p>${esc(address)}</p></div><div class="invoice-ref"><small>REFERÊNCIA</small><strong>${esc(i.reference||'-')}</strong><span>Vencimento: ${esc(i.due||'-')}</span></div></div>
    <div class="invoice-values">
      <div><small>Consumo</small><strong>${Number(i.consumption||0).toFixed(2)} kWh</strong></div>
      <div><small>Energia após desconto</small><strong>${money(i.discounted)}</strong></div>
      <div><small>50% da taxa Coelba</small><strong>${money(i.clientShare)}</strong></div>
    </div>
    <div class="invoice-total"><span>VALOR FINAL</span><strong>${money(i.final)}</strong></div>
    <p class="invoice-note">A cobrança inclui a energia calculada conforme consumo e tarifa, com o desconto cadastrado, acrescida de 50% do valor da conta/taxa Coelba.</p>
  </div>`;
  $('#invoiceModal').classList.add('open');
}
function closeInvoice(){$('#invoiceModal').classList.remove('open');currentInvoiceId=null}
async function downloadCurrentInvoice(){
  if(!currentInvoiceId)return;
  if(!window.html2canvas||!window.jspdf){toast('Biblioteca de PDF não carregou');return}
  const paper=$('#invoicePaper .invoice-sheet');
  const canvas=await html2canvas(paper,{scale:2,backgroundColor:'#ffffff'});
  const img=canvas.toDataURL('image/png');
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  const pageW=210, margin=10, usable=190;
  const h=canvas.height*usable/canvas.width;
  pdf.addImage(img,'PNG',margin,10,usable,Math.min(h,277));
  const i=db.invoices.find(x=>x.id===currentInvoiceId);
  const safe=(i?.clientName||'cliente').replace(/[^a-z0-9_-]+/gi,'_');
  pdf.save(`fatura_${safe}_${(i?.reference||'').replace('/','-')}.pdf`);
}

window.savePlantProduction=savePlantProduction; window.copyPix=copyPix; window.go=go; window.openClient=openClient; window.closeModal=closeModal; window.delClient=delClient; window.togglePaid=togglePaid; window.delInvoice=delInvoice; window.closeReview=closeReview; window.openReviewFromPending=openReviewFromPending; window.openInvoice=openInvoice; window.closeInvoice=closeInvoice; window.downloadCurrentInvoice=downloadCurrentInvoice;
renderAll();
