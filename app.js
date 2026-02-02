/* ======================================================
   CONFIG
====================================================== */
const SPREADSHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbyjovIwCqxInw45UzhAikAIjjgF7QKsG9KJ9yjIP0WB5G3UsS1HQD4xgFOKeNpEjnXw/exec";

const ADMIN_PASSWORD = "bcr2026";

/* ======================================================
   DOM
====================================================== */
const selectHadiah      = document.getElementById("selectHadiah");
const jumlahPemenang    = document.getElementById("jumlahPemenang");
const gachaNumber       = document.getElementById("gachaNumber");
const gachaResultList   = document.getElementById("gachaResultList");
const tabelKandidat     = document.getElementById("tabelKandidat");
const tabelLaporan      = document.getElementById("tabelLaporan");
const tabelStatusHadiah = document.getElementById("tabelStatusHadiah");
const totalPeserta      = document.getElementById("totalPeserta");
const cekBibInput       = document.getElementById("cekBibInput");
const cekResult         = document.getElementById("cekResult");
const btnUndi           = document.getElementById("btnUndi");

/* ======================================================
   STATE
====================================================== */
let peserta = [];
let hadiah = [];
let initialHadiah = [];
let kandidat = [];

/* ======================================================
   GACHA CONTROL
====================================================== */
let gachaInterval = null;
let gachaStartTime = 0;
let currentAnimationDuration = 1500;
const BULK_BATCH_SIZE = 5;

/* ======================================================
   WORKER
====================================================== */
const worker = new Worker("./worker.js");

/* ======================================================
   NAVIGATION
====================================================== */
function navigate(page, needAuth = false) {
  if (needAuth) {
    const pass = prompt("Masukkan password admin:");
    if (pass !== ADMIN_PASSWORD) {
      alert("Password salah");
      return;
    }
  }

  document.querySelectorAll(".page")
    .forEach(p => p.classList.add("hidden"));

  document.getElementById(`page-${page}`)?.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  navigate("cek");
});

/* ======================================================
   INIT (READ FROM SPREADSHEET)
====================================================== */
async function init() {
  try {
    peserta = await fetch(`${SPREADSHEET_API_URL}?action=getPeserta`).then(r => r.json());
    hadiah  = await fetch(`${SPREADSHEET_API_URL}?action=getHadiah`).then(r => r.json());
    kandidat = await fetch(`${SPREADSHEET_API_URL}?action=getPemenang`).then(r => r.json());

    initialHadiah = hadiah.map(h => ({
      prize: h.prize,
      stock: h.stock,
      initialStock: h.initialStock
    }));

    renderAll();
  } catch (e) {
    console.error(e);
    alert("Gagal load data dari Spreadsheet");
  }
}
init();

/* ======================================================
   UNDI
====================================================== */
function startUndian() {
  if (btnUndi.disabled) return;
  disableUndiButton();

  if (!peserta.length) {
    enableUndiButton();
    return alert("Peserta habis");
  }

  const hadiahIndex = selectHadiah.value;
  const jumlah = parseInt(jumlahPemenang.value);

  if (hadiahIndex === "") {
    enableUndiButton();
    return alert("Pilih hadiah");
  }

  if (jumlah > hadiah[hadiahIndex].stock) {
    enableUndiButton();
    return alert("Stock tidak cukup");
  }

  gachaNumber.innerText = "-----";
  gachaResultList.innerHTML = "";
  document.querySelector(".gacha-display")?.classList.add("running");

  stopGachaAnimation();

  requestAnimationFrame(() => {
    gachaStartTime = Date.now();
    currentAnimationDuration = getAnimationDuration(jumlah);
    startGachaAnimation();

    worker.postMessage({
      type: "UNDI",
      payload: { peserta, hadiah, hadiahIndex, jumlah }
    });
  });
}

/* ======================================================
   WORKER RESULT
====================================================== */
worker.onmessage = (e) => {
  if (e.data.type !== "UNDI_RESULT") return;

  const { peserta: newPeserta, kandidat: baru } = e.data.data;
  const delay =
    Math.max(0, currentAnimationDuration - (Date.now() - gachaStartTime));

  setTimeout(() => {
    stopGachaAnimation();
    document.querySelector(".gacha-display")?.classList.remove("running");

    peserta = newPeserta;
    kandidat.push(...baru);

    // TAMPILKAN
    if (baru.length === 1) {
      gachaNumber.innerText = `${baru[0].bib} - ${baru[0].nama}`;
    } else {
      renderBulkResult(baru);
    }

    // SIMPAN KE SHEET (GET ONLY)
    baru.forEach(k => {
      fetch(
        `${SPREADSHEET_API_URL}?action=addPemenang`
        + `&bib=${encodeURIComponent(k.bib)}`
        + `&nama=${encodeURIComponent(k.nama)}`
        + `&hadiah=${encodeURIComponent(k.prize)}`
      );
    });
    console.log(baru)
    enableUndiButton();
    renderAll();
  }, delay);
};

/* ======================================================
   ANIMATION
====================================================== */
function startGachaAnimation() {
  stopGachaAnimation();
  gachaInterval = setInterval(() => {
    gachaNumber.innerText =
      Math.floor(10000 + Math.random() * 90000);
  }, 40);
}

function stopGachaAnimation() {
  if (gachaInterval) {
    clearInterval(gachaInterval);
    gachaInterval = null;
  }
}

/* ======================================================
   BULK RESULT
====================================================== */
function renderBulkResult(list) {
  gachaResultList.innerHTML = "";
  list.forEach(k => {
    const div = document.createElement("div");
    div.className = "bib-item";
    div.innerHTML = `
      <div class="bib">${k.bib}</div>
      <div class="nama">${k.nama}</div>
    `;
    gachaResultList.appendChild(div);
  });
}

/* ======================================================
   VERIFIKASI
====================================================== */
function approve(i) {
  const k = kandidat[i];
  const h = hadiah.find(x => x.prize === k.prize);
  if (!h || h.stock <= 0) return alert("Stock habis");

  fetch(`${SPREADSHEET_API_URL}?action=approve&bib=${encodeURIComponent(k.bib)}`)
    .then(() => {
      k.status = "APPROVED";
      h.stock--;
      renderAll();
    });
}

function reject(i) {
  if (!confirm("Peserta hangus, lanjutkan?")) return;

  fetch(`${SPREADSHEET_API_URL}?action=reject&bib=${encodeURIComponent(kandidat[i].bib)}`)
    .then(() => {
      kandidat[i].status = "REJECTED";
      renderAll();
    });
}

function approveAll() {
  const pending = kandidat.filter(k => k.status === "PENDING");
  if (!pending.length) return alert("Tidak ada pending");

  const prize = pending[0].prize;
  if (pending.some(k => k.prize !== prize))
    return alert("Hadiah berbeda");

  const h = hadiah.find(x => x.prize === prize);
  if (!h || h.stock < pending.length)
    return alert("Stock tidak cukup");

  pending.forEach(k => {
    fetch(
      `${SPREADSHEET_API_URL}?action=approve&bib=${encodeURIComponent(k.bib)}`
    );
    k.status = "APPROVED";
  });

  h.stock -= pending.length;
  renderAll();
}

/* ======================================================
   RESET
====================================================== */
function resetUndian() {
  if (!confirm("Reset undian?")) return;
  fetch(`${SPREADSHEET_API_URL}?action=reset`)
    .then(() => init());
}

/* ======================================================
   RENDER
====================================================== */
function renderAll() {
  totalPeserta.innerText = peserta.length;

  selectHadiah.innerHTML = "";
  hadiah.forEach((h, i) => {
    if (h.stock > 0) {
      selectHadiah.innerHTML +=
        `<option value="${i}">${h.prize} (${h.stock})</option>`;
    }
  });
  jumlahPemenang.value = 1;

  tabelKandidat.innerHTML = "";
  kandidat
    .filter(k => k.status === "PENDING")
    .forEach((k, i) => {
      tabelKandidat.innerHTML += `
        <tr>
          <td>${k.bib}</td>
          <td>${k.nama}</td>
          <td>${k.prize}</td>
          <td>${k.status}</td>
          <td>
            <button onclick="approve(${i})">Approve</button>
            <button class="danger" onclick="reject(${i})">Reject</button>
          </td>
        </tr>`;
    });

  tabelLaporan.innerHTML = "";
  kandidat
    .filter(k => k.status === "APPROVED")
    .forEach(k => {
      tabelLaporan.innerHTML += `
        <tr>
          <td>${k.bib}</td>
          <td>${k.nama}</td>
          <td>${k.prize}</td>
        </tr>`;
    });

  renderStatusHadiah();
}

function renderStatusHadiah() {
  tabelStatusHadiah.innerHTML = "";
  hadiah.forEach(h => {
    tabelStatusHadiah.innerHTML += `
      <tr>
        <td>${h.prize}</td>
        <td>${h.stock}</td>
      </tr>`;
  });
}

/* ======================================================
   CEK UNDIAN (PUBLIK)
====================================================== */
function cekUndian() {
  const bib = cekBibInput.value.trim();
  if (!bib) return;

  fetch(`${SPREADSHEET_API_URL}?action=cekUndian&bib=${encodeURIComponent(bib)}`)
    .then(r => r.json())
    .then(res => cekResult.innerText = res.message);
}

/* ======================================================
   UTIL
====================================================== */
function getAnimationDuration(jumlah) {
  if (jumlah === 1) return 3500;
  if (jumlah <= 5) return 2200;
  if (jumlah <= 10) return 1600;
  return 1200;
}

function disableUndiButton() {
  btnUndi.disabled = true;
  btnUndi.innerText = "SEDANG MENGUNDI...";
}

function enableUndiButton() {
  btnUndi.disabled = false;
  btnUndi.innerText = "UNDI SEKARANG";
}
