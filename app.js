/* ========= UTIL ========= */
function save(k,v){ localStorage.setItem(k,JSON.stringify(v)) }
function load(k){ return JSON.parse(localStorage.getItem(k)) || [] }
function yieldToBrowser(){ return new Promise(r=>setTimeout(r,0)) }

/* ========= STATE ========= */
let peserta = load("peserta");
let hadiah = load("hadiah");
let initialHadiah = load("initialHadiah");
let kandidat = load("kandidat");

init();

/* ========= INIT ========= */
function init(){
    renderPeserta();
    renderHadiah();
    renderSelectHadiah();
    renderKandidat();
    renderLaporan();
}

/* ========= US-02 ========= */
async function uploadPeserta(){
    const f=filePeserta.files[0];
    if(!f) return alert("Pilih file peserta");
    document.body.style.cursor="wait";

    const r=new FileReader();
    r.onload=async e=>{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
        let added=0;

        for(let i=0;i<rows.length;i++){
            if(i%20===0) await yieldToBrowser();
            const row=rows[i];
            const keys=Object.keys(row).reduce((a,k)=>{a[k.trim().toLowerCase()]=row[k];return a},{});
            if(!keys.bib) continue;
            if(!peserta.some(p=>p.bib===keys.bib.toString())){
                peserta.push({bib:keys.bib.toString(),nama:keys.nama||"-"});
                added++;
            }
        }
        save("peserta",peserta);
        renderPeserta();
        document.body.style.cursor="default";
        alert(`Peserta ditambahkan: ${added}`);
    };
    r.readAsArrayBuffer(f);
}

function renderPeserta(){
    listPeserta.innerHTML="";
    totalPeserta.innerText=peserta.length;
    peserta.forEach(p=>listPeserta.innerHTML+=`<li>${p.bib} - ${p.nama}</li>`);
}

function resetPeserta(){
    if(!confirm("Reset peserta?"))return;
    peserta=[]; save("peserta",peserta); renderPeserta();
}

/* ========= US-03 ========= */
async function uploadHadiah(){
    const f=fileHadiah.files[0];
    if(!f)return alert("Pilih file hadiah");
    document.body.style.cursor="wait";

    const r=new FileReader();
    r.onload=async e=>{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
        hadiah=[]; initialHadiah=[];
        for(let i=0;i<rows.length;i++){
            if(i%20===0) await yieldToBrowser();
            if(rows[i].prize && rows[i].stock!=null){
                const h={prize:rows[i].prize,stock:parseInt(rows[i].stock)};
                hadiah.push({...h}); initialHadiah.push({...h});
            }
        }
        save("hadiah",hadiah); save("initialHadiah",initialHadiah);
        renderHadiah(); renderSelectHadiah();
        document.body.style.cursor="default";
    };
    r.readAsArrayBuffer(f);
}

function renderHadiah(){
    listHadiah.innerHTML="";
    totalHadiah.innerText=hadiah.length;
    hadiah.forEach((h,i)=>listHadiah.innerHTML+=
        `<tr><td>${i+1}</td><td>${h.prize}</td><td>${h.stock}</td></tr>`);
}

function resetHadiah(){
    if(!confirm("Reset hadiah?"))return;
    hadiah=[]; initialHadiah=[];
    save("hadiah",hadiah); save("initialHadiah",initialHadiah);
    renderHadiah(); renderSelectHadiah();
}

/* ========= US-04 ========= */
function renderSelectHadiah(){
    selectHadiah.innerHTML="";
    hadiah.forEach((h,i)=>h.stock>0&&
        (selectHadiah.innerHTML+=`<option value="${i}">${h.prize} (${h.stock})</option>`));
    onHadiahChange();
}

function onHadiahChange(){
    if(selectHadiah.value==="")return jumlahPemenang.disabled=true;
    jumlahPemenang.disabled=false;
    jumlahPemenang.max=hadiah[selectHadiah.value].stock;
    jumlahPemenang.value=1;
}

async function undi(){
    const i=selectHadiah.value;
    const j=parseInt(jumlahPemenang.value);
    if(i===""||j>hadiah[i].stock)return alert("Input tidak valid");

    document.body.style.cursor="wait";
    for(let x=0;x<j;x++){
        if(x%10===0) await yieldToBrowser();
        const r=Math.floor(Math.random()*peserta.length);
        const p=peserta.splice(r,1)[0];
        kandidat.push({...p,prize:hadiah[i].prize,status:"PENDING"});
    }
    save("peserta",peserta); save("kandidat",kandidat);
    renderPeserta(); renderKandidat();
    document.body.style.cursor="default";
}

/* ========= US-05 ========= */
function renderKandidat(){
    tabelKandidat.innerHTML="";
    kandidat.forEach((k,i)=>{
        let aksi="-";
        if(k.status==="PENDING")
            aksi=`<button onclick="approve(${i})">Approve</button>
                  <button class="danger" onclick="reject(${i})">Reject</button>`;
        tabelKandidat.innerHTML+=
        `<tr><td>${k.bib}</td><td>${k.nama}</td><td>${k.prize}</td><td>${k.status}</td><td>${aksi}</td></tr>`;
    });
    renderLaporan();
}

async function approve(i){
    document.body.style.cursor="wait";
    await yieldToBrowser();
    const k=kandidat[i];
    const h=hadiah.find(x=>x.prize===k.prize);
    if(!h||h.stock<=0)return alert("Stock habis");
    h.stock--; k.status="APPROVED";
    saveAll(); document.body.style.cursor="default";
}

async function reject(i){
    document.body.style.cursor="wait";
    await yieldToBrowser();
    peserta.push({bib:kandidat[i].bib,nama:kandidat[i].nama});
    kandidat[i].status="REJECTED";
    saveAll(); document.body.style.cursor="default";
}

async function approveAll(){
    const p=kandidat.filter(k=>k.status==="PENDING");
    if(p.length<2)return alert("Tidak ada massal");
    const prize=p[0].prize;
    if(p.some(x=>x.prize!==prize))return alert("Hadiah berbeda");
    const h=hadiah.find(x=>x.prize===prize);
    if(!h||h.stock<p.length)return alert("Stock tidak cukup");

    document.body.style.cursor="wait";
    for(let i=0;i<p.length;i++){
        if(i%10===0) await yieldToBrowser();
        p[i].status="APPROVED";
    }
    h.stock-=p.length;
    saveAll(); document.body.style.cursor="default";
}

function resetUndian(){
    if(!confirm("Reset undian?"))return;
    kandidat.forEach(k=>k.status!=="REJECTED"&&peserta.push({bib:k.bib,nama:k.nama}));
    kandidat=[]; hadiah=initialHadiah.map(h=>({...h}));
    saveAll();
}

/* ========= US-06 ========= */
function renderLaporan(){
    tabelLaporan.innerHTML="";
    kandidat.filter(k=>k.status==="APPROVED")
        .forEach(k=>tabelLaporan.innerHTML+=
            `<tr><td>${k.bib}</td><td>${k.nama}</td><td>${k.prize}</td></tr>`);
}

function exportCSV(){
    let csv="BIB,Nama,Hadiah\n";
    kandidat.filter(k=>k.status==="APPROVED")
        .forEach(k=>csv+=`${k.bib},${k.nama},${k.prize}\n`);
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download="laporan_pemenang.csv"; a.click();
}

/* ========= SAVE ========= */
function saveAll(){
    save("peserta",peserta);
    save("hadiah",hadiah);
    save("kandidat",kandidat);
    renderPeserta(); renderHadiah(); renderSelectHadiah(); renderKandidat();
}
