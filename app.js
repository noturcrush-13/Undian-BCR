/* ======================================================
   CONFIG
====================================================== */
const SPREADSHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbzmuxiS44kmQEaJ2atefQxUtVeA8J3i5TAV4ho4FGKT6SUrY0muVEQqUFc2RDD7iQW5/exec";

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
const BULK_BATCH_DELAY = 900;
/* ======================================================
   WORKER
====================================================== */
const worker = new Worker("./worker.js");

/* ======================================================
   NAVIGATION
====================================================== */
let pendingPage = null;

function navigate(page, needAuth = false) {
    console.group("NAVIGATE");
    console.log("navigate() dipanggil");
    console.log("page:", page);
    console.log("needAuth:", needAuth);

    if (needAuth) {
        console.log("Butuh auth → buka modal");
        pendingPage = page;
        openPasswordModal();
        console.groupEnd();
        return;
    }

    showPage(page);
    console.groupEnd();
}

function showPage(page) {
    console.group("SHOW PAGE");

    console.log("Target page:", page);

    const pages = document.querySelectorAll(".page");
    console.log("Jumlah .page ditemukan:", pages.length);

    pages.forEach(p => {
        console.log("Hide:", p.id);
        p.classList.add("hidden");
    });

    const targetId = `page-${page}`;
    const target = document.getElementById(targetId);

    console.log("Cari element:", targetId);
    console.log("Element ditemukan?", !!target);

    if (!target) {
        console.error("❌ ELEMENT TIDAK ADA:", targetId);
        console.groupEnd();
        return;
    }

    target.classList.remove("hidden");
    console.log("✅ SHOW:", targetId);
    console.log("Class sekarang:", target.className);

    console.groupEnd();
}

/* ================= PASSWORD MODAL ================= */

function openPasswordModal() {
    const modal = document.getElementById("passwordModal");
    const input = document.getElementById("adminPasswordInput");

    if (!modal || !input) {
        console.error("❌ Password modal / input tidak ditemukan di DOM");
        return;
    }

    input.value = "";
    modal.classList.remove("hidden");
}

function closePasswordModal() {
    const modal = document.getElementById("passwordModal");
    if (modal) modal.classList.add("hidden");
}

function confirmPassword() {
    const input = document.getElementById("adminPasswordInput");
    if (!input) return;

    if (input.value !== ADMIN_PASSWORD) {
        alert("Password salah");
        input.value = "";
        return;
    }

    closePasswordModal();
    showPage(pendingPage);
    pendingPage = null;
}

function showPage(page) {
  document.querySelectorAll(".page")
    .forEach(p => p.classList.add("hidden"));

  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.remove("hidden");
}
document.addEventListener("DOMContentLoaded", () => {
  navigate("cek");
});

document.addEventListener("DOMContentLoaded", () => {
    showPage("cek"); // halaman publik default
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
    // COMMIT STATE
    peserta = newPeserta;
    kandidat.push(...baru);

    /* ================= SINGLE ================= */
    if (baru.length === 1) {
      // 🛑 STOP SEKARANG
      stopGachaAnimation();
      document.querySelector(".gacha-display")?.classList.remove("running");

      const p = baru[0];
      gachaNumber.innerText = `${p.bib} - ${p.nama}`;

      fetch(
        `${SPREADSHEET_API_URL}?action=addPemenang`
        + `&bib=${encodeURIComponent(p.bib)}`
        + `&nama=${encodeURIComponent(p.nama)}`
        + `&hadiah=${encodeURIComponent(p.prize)}`
      );

      enableUndiButton();
      renderAll();
      return;
    }

    /* ================= BULK ================= */

    // ⚠️ JANGAN STOP ANIMASI DI SINI

    // SIMPAN BULK SEKALI
    fetch(
      `${SPREADSHEET_API_URL}?action=addPemenangBulk`
      + `&data=${encodeURIComponent(JSON.stringify(baru))}`
    );

    // TAMPILKAN PER BATCH
    renderBulkPerBatch(baru, () => {
      // 🛑 STOP SETELAH BATCH TERAKHIR
      stopGachaAnimation();
      document.querySelector(".gacha-display")?.classList.remove("running");
      enableUndiButton();
      renderAll();
    });

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

function renderBulkPerBatch(list, onComplete) {
  gachaResultList.innerHTML = "";

  let index = 0;

  function nextBatch() {
    const batch = list.slice(index, index + BULK_BATCH_SIZE);

    batch.forEach(k => {
      const div = document.createElement("div");
      div.className = "bib-item";
      div.innerHTML = `
        <div class="bib">${k.bib}</div>
        <div class="nama">${k.nama}</div>
      `;
      gachaResultList.appendChild(div);
    });

    index += BULK_BATCH_SIZE;

    if (index < list.length) {
      setTimeout(nextBatch, BULK_BATCH_DELAY);
    } else if (typeof onComplete === "function") {
        onComplete();
      }
  }
  nextBatch();
}

/* ======================================================
   VERIFIKASI
====================================================== */
function approve(bib) {
  const k = kandidat.find(x => String(x.bib) === String(bib));
  if (!k) return alert("Data pemenang tidak ditemukan");

  const h = hadiah.find(x => x.prize === k.prize);
  if (!h || h.stock <= 0) return alert("Stock habis");

  fetch(`${SPREADSHEET_API_URL}?action=approveSingle&bib=${encodeURIComponent(bib)}`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) {
        alert("Gagal approve");
        return;
      }

      k.status = "APPROVED";
      h.stock--;
      renderAll();
    })
    .catch(() => alert("Gagal koneksi API"));
}

function reject(bib) {
  if (!confirm("Peserta akan dihanguskan. Lanjutkan?")) return;

  const k = kandidat.find(x => String(x.bib) === String(bib));
  if (!k) return alert("Data tidak ditemukan");

  fetch(`${SPREADSHEET_API_URL}?action=reject&bib=${encodeURIComponent(bib)}`)
    .then(() => {
      k.status = "REJECTED";
      renderAll();
    });
}

function approveAll() {
  const pending = kandidat.filter(k => k.status === "PENDING");
  if (!pending.length) {
    alert("Tidak ada pending");
    return;
  }

  const prize = pending[0].prize;
  if (pending.some(k => k.prize !== prize)) {
    alert("Approve semua hanya boleh untuk hadiah yang sama");
    return;
  }

  const h = hadiah.find(x => x.prize === prize);
  if (!h || h.stock < pending.length) {
    alert("Stock hadiah tidak cukup");
    return;
  }

  const bibList = pending.map(k => k.bib).join(",");

  disableApproveAllButton();

  fetch(
    `${SPREADSHEET_API_URL}?action=approveAll&bib=${encodeURIComponent(bibList)}`
  )
    .then(r => r.json())
    .then(res => {
      if (!res.success) {
        alert("Gagal approve semua");
        return;
      }

      // update LOCAL STATE
      pending.forEach(k => k.status = "APPROVED");
      h.stock -= pending.length;

      renderAll();
    })
    .catch(() => alert("Gagal koneksi API"))
    .finally(enableApproveAllButton);
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
      const aksi =  `
        <div class="action-buttons">
          <button class="btn-action approve" onclick="approve(${k.bib})">Approve</button>
          <button class="btn-action reject" onclick="reject(${k.bib})">Reject</button>
        </div>
      `
      tabelKandidat.innerHTML += `
        <tr>
          <td>${k.bib}</td>
          <td>${k.nama}</td>
          <td>${k.prize}</td>
          <td>${k.status}</td>
          <td>${aksi}</td>
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

function disableApproveAllButton() {
  const btn = document.querySelector(".approve-all");
  if (!btn) return;

  btn.disabled = true;
  btn.dataset.originalText = btn.innerText;
  btn.innerText = "Memproses...";
  btn.classList.add("disabled");
}

function enableApproveAllButton() {
  const btn = document.querySelector(".approve-all");
  if (!btn) return;

  btn.disabled = false;
  btn.innerText = btn.dataset.originalText || "Sahkan Semua";
  btn.classList.remove("disabled");
}


