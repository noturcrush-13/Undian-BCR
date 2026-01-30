/* ======================================================
   GACHA CONTROL (WAJIB DI PALING ATAS)
====================================================== */
let gachaInterval = null;
let gachaStartTime = 0;
let currentAnimationDuration = 1500;
const MIN_GACHA_DURATION = 2000; // ms
const BULK_BATCH_SIZE = 5;
const BULK_BATCH_DELAY = 900; // ms antar batch

/* ======================================================
   WORKER
====================================================== */
const worker = new Worker("./worker.js");

/* ======================================================
   UTIL
====================================================== */
function save(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
}
function load(k) {
    return JSON.parse(localStorage.getItem(k)) || [];
}

/* ======================================================
   STATE
====================================================== */
let peserta = load("peserta");
let hadiah = load("hadiah");
let initialHadiah = load("initialHadiah");
let kandidat = load("kandidat");

/* ======================================================
   INIT
====================================================== */
renderAll();

/* ======================================================
   Slicing Page
====================================================== */
const ADMIN_PASSWORD = "bcr2026";
let isFirstLoad = true;

function navigate(page, needAuth = false) {

    // 🔐 SELALU MINTA PASSWORD JIKA ADMIN PAGE
    if (needAuth) {
        const pass = prompt("Masukkan password admin:");
        if (pass !== ADMIN_PASSWORD) {
            alert("Password salah");
            return; // ⛔ TIDAK PINDAH HALAMAN
        }
    }

    // 🔄 PINDAH HALAMAN
    document.querySelectorAll(".page")
        .forEach(p => p.classList.add("hidden"));

    document
        .getElementById(`page-${page}`)
        ?.classList.remove("hidden");
}


// default halaman
navigate("cek");


/* ======================================================
   WORKER RESPONSE
====================================================== */
worker.onmessage = (e) => {
    const { type, data } = e.data;

    /* ================= UNDI RESULT ================= */
    if (type === "UNDI_RESULT") {
        const { peserta: newPeserta, kandidat: kandidatBaru } = data;
        const jumlah = kandidatBaru.length;

        const elapsed = Date.now() - gachaStartTime;
        const delay = Math.max(0, currentAnimationDuration - elapsed);

        setTimeout(() => {
            const display = document.querySelector(".gacha-display");

            // ===== SINGLE =====
            if (jumlah === 1) {
                stopGachaAnimation();
                display?.classList.remove("running");

                requestAnimationFrame(() => {
                    gachaNumber.innerText = `${kandidatBaru[0].bib} - ${kandidatBaru[0].nama}`;

                    peserta = newPeserta;
                    kandidat.push(kandidatBaru[0]);
                    saveAll();

                    enableUndiButton(); // optional helper  
                });
                return;
            }

            // ===== BULK =====
            peserta = newPeserta;
            renderBulkBatchesWithRolling(kandidatBaru);

        }, delay);

        return;
    }

    /* ================= APPROVE ALL RESULT ================= */
    if (type === "APPROVE_ALL_RESULT") {
        kandidat = data.kandidat;
        hadiah = data.hadiah;
        saveAll();
        return;
    }
};

/* ======================================================
   UPLOAD PESERTA (HEADER FLEKSIBEL)
====================================================== */
function uploadPeserta() {
    const f = filePeserta.files[0];
    if (!f) return alert("Pilih file peserta");

    const r = new FileReader();
    r.onload = e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        let added = 0;

        rows.forEach(row => {
            const keys = Object.keys(row).reduce((a, k) => {
                a[k.trim().toLowerCase()] = row[k];
                return a;
            }, {});

            const bib = keys["bib"];
            const nama = keys["nama"] || keys["nama peserta"] || "-";

            if (!bib) return;
            if (peserta.some(p => p.bib === bib.toString())) return;

            peserta.push({
                bib: bib.toString(),
                nama: nama.toString()
            });
            added++;
        });

        saveAll();
        alert(`Peserta ditambahkan: ${added}`);
    };
    r.readAsArrayBuffer(f);
}

/* ======================================================
   UPLOAD HADIAH
====================================================== */
function uploadHadiah() {
    const f = fileHadiah.files[0];
    if (!f) return alert("Pilih file hadiah");

    const r = new FileReader();
    r.onload = e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

        hadiah = [];
        initialHadiah = [];

        rows.forEach(r => {
            if (r.prize && r.stock != null) {
                const h = {
                    prize: r.prize.toString(),
                    stock: parseInt(r.stock)
                };
                hadiah.push({ ...h });
                initialHadiah.push({ ...h });
            }
        });

        saveAll();
    };
    r.readAsArrayBuffer(f);
}

/* ======================================================
   GACHA
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

    // RESET UI
    gachaNumber.innerText = "-----";
    document.getElementById("gachaResultList").innerHTML = "";
    document.querySelector(".gacha-display")?.classList.add("running");

    // ⛔ STOP semua interval sebelumnya
    stopGachaAnimation();

    // 🔥 PAKSA REPAINT DULU
    requestAnimationFrame(() => {
        gachaStartTime = Date.now();
        currentAnimationDuration = getAnimationDuration(jumlah);

        startGachaAnimation();

        // Kirim ke worker
        setTimeout(() => {
            worker.postMessage({
                type: "UNDI",
                payload: { peserta, hadiah, hadiahIndex, jumlah }
            });
        }, 0);
    });
}

function startGachaAnimation() {
    stopGachaAnimation(); // ⛔ pastikan bersih dulu

    gachaInterval = setInterval(() => {
        gachaNumber.innerText =
            Math.floor(10000 + Math.random() * 90000);
    }, 40);
}

function stopGachaAnimation() {
    if (gachaInterval !== null) {
        clearInterval(gachaInterval);
        gachaInterval = null;
    }
}

/* ======================================================
   Render Gacha List
====================================================== */

function renderGachaResultList(list) {
    const el = document.getElementById("gachaResultList");
    if (!el) return;

    el.innerHTML = "";

    list.forEach(item => {
        const div = document.createElement("div");
        div.className = "bib-item";
        div.innerHTML = `
            <div class="bib">${item.bib}</div>
            <div class="nama">${item.nama}</div>
        `;
        el.appendChild(div);
    });
}

/* ======================================================
   VERIFIKASI
====================================================== */
function approveAll() {
    const pending = kandidat.filter(k => k.status === "PENDING");
    if (pending.length < 1) {
        alert("Tidak ada kandidat PENDING");
        return;
    }

    // validasi hadiah sama
    const prize = pending[0].prize;
    if (pending.some(k => k.prize !== prize)) {
        alert("Hadiah berbeda, tidak bisa approve massal");
        return;
    }

    worker.postMessage({
        type: "APPROVE_ALL",
        payload: {
            kandidat,
            hadiah
        }
    });
}

function resetUndian() {
    if (!confirm("Reset undian? Semua hasil (approve / reject) akan dibatalkan.")) return;

    kandidat.forEach(k => {
        peserta.push({
            bib: k.bib,
            nama: k.nama
        });
    });

    kandidat = [];
    hadiah = initialHadiah.map(h => ({ ...h }));

    saveAll();
}


/* ======================================================
   RENDER
====================================================== */

function renderStatusHadiah() {
    const tbody = document.getElementById("tabelStatusHadiah");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!hadiah.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="2" style="text-align:center;opacity:.6">
                    Belum ada data hadiah
                </td>
            </tr>`;
        return;
    }

    hadiah.forEach(h => {
        const stockColor = h.stock === 0 ? "style='color:#ef4444;font-weight:bold'" : "";
        tbody.innerHTML += `
            <tr>
                <td>${h.prize}</td>
                <td ${stockColor}>${h.stock}</td>
            </tr>
        `;
    });
}

function renderAll() {
    /* ================= TOTAL PESERTA ================= */
    totalPeserta.innerText = peserta.length;

    /* ================= SELECT HADIAH UNDI ================= */
    selectHadiah.innerHTML = "";
    hadiah.forEach((h, i) => {
        if (h.stock > 0) {
            selectHadiah.innerHTML +=
                `<option value="${i}">${h.prize} (${h.stock})</option>`;
        }
    });

    /* 🔥 RESET JUMLAH PEMENANG SETIAP HADIAH BERUBAH */
    jumlahPemenang.value = 1;
    const selectedIndex = selectHadiah.value;
    if (selectedIndex !== "") {
        jumlahPemenang.max = hadiah[selectedIndex].stock;
    }

    /* ================= FILTER VALUE (KHUSUS LAPORAN) ================= */
    const filterPrize =
        document.getElementById("filterHadiah")?.value || "";

    const searchBib =
        document.getElementById("searchBib")?.value
            ?.trim()
            .toLowerCase() || "";

    /* ================= VERIFIKASI (PENDING ONLY) ================= */
    tabelKandidat.innerHTML = "";

    kandidat.forEach((k, indexAsli) => {
        if (k.status !== "PENDING") return;

        const aksi = `
            <div class="action-buttons">
                <button class="btn-action approve"
                        onclick="approve(${indexAsli})">
                    Approve
                </button>
                <button class="btn-action reject"
                        onclick="reject(${indexAsli})">
                    Reject
                </button>
            </div>
        `;

        tabelKandidat.innerHTML += `
            <tr>
                <td>${k.bib}</td>
                <td>${k.nama}</td>
                <td>${k.prize}</td>
                <td>${k.status}</td>
                <td>${aksi}</td>
            </tr>`;
    });

    /* ================= LAPORAN PEMENANG ================= */
    tabelLaporan.innerHTML = "";

    kandidat
        .filter(k => k.status === "APPROVED")
        .filter(k => {
            if (filterPrize && k.prize !== filterPrize) return false;
            if (
                searchBib &&
                !String(k.bib).toLowerCase().includes(searchBib)
            ) return false;
            return true;
        })
        .forEach(k => {
            tabelLaporan.innerHTML += `
                <tr>
                    <td>${k.bib}</td>
                    <td>${k.nama}</td>
                    <td class="text-green">${k.prize}</td>
                </tr>`;
        });

    renderFilterHadiah();
    renderStatusHadiah();
}



/* ======================================================
   Render Bulk Batch
====================================================== */

function renderBulkBatches(list) {
    const el = document.getElementById("gachaResultList");
    if (!el) return;

    el.innerHTML = "";
    gachaNumber.innerText = ""; // kosongkan hero angka

    let index = 0;

    function showNextBatch() {
        const batch = list.slice(index, index + BULK_BATCH_SIZE);

        batch.forEach(item => {
            const div = document.createElement("div");
            div.className = "bib-item";
            div.innerHTML = `
                <div class="bib">${item.bib}</div>
                <div class="nama">${item.nama}</div>
            `;
            el.appendChild(div);
        });

        index += BULK_BATCH_SIZE;

        if (index < list.length) {
            setTimeout(showNextBatch, BULK_BATCH_DELAY);
        }
    }

    showNextBatch();
}

function renderBulkBatchesWithRolling(list) {
    const el = document.getElementById("gachaResultList");
    if (!el) return;

    el.innerHTML = "";
    gachaNumber.innerText = "-----";

    let index = 0;
    const display = document.querySelector(".gacha-display");

    display?.classList.add("running");

    function showNextBatch() {
        const batch = list.slice(index, index + BULK_BATCH_SIZE);

        batch.forEach(item => {
            const div = document.createElement("div");
            div.className = "bib-item";
            div.innerHTML = `
                <div class="bib">${item.bib}</div>
                <div class="nama">${item.nama}</div>
            `;
            el.appendChild(div);
        });

        index += BULK_BATCH_SIZE;

        if (index < list.length) {
            setTimeout(showNextBatch, BULK_BATCH_DELAY);
        } else {
            // 🏁 BATCH TERAKHIR
            stopGachaAnimation();
            display?.classList.remove("running");

            const last = list[list.length - 1];
            if (last) gachaNumber.innerText = last.bib;

            // 🔥 COMMIT DATA KE STATE YANG BENAR
            kandidat.push(...list);   // <-- FIX UTAMA
            saveAll();

            enableUndiButton();
          // <-- ini akan trigger renderKandidat()

        }
    }

    showNextBatch();
}

/* ======================================================
   Validasi Peserta
====================================================== */

function approve(i) {
    const k = kandidat[i];
    const h = hadiah.find(x => x.prize === k.prize);
    if (!h || h.stock <= 0) return alert("Stock habis");

    k.status = "APPROVED";
    h.stock--;

    saveAll();
}

function reject(i) {
    if (!confirm("Peserta akan hangus dan tidak bisa diundi lagi. Lanjutkan?")) return;

    kandidat[i].status = "REJECTED";
    saveAll();
}

/* ======================================================
   SAVE
====================================================== */
function saveAll() {
    save("peserta", peserta);
    save("hadiah", hadiah);
    save("kandidat", kandidat);

    renderAll(); // ✅ SATU-SATUNYA RENDER
    renderFilterHadiah();
}

/* ======================================================
   EXPORT
====================================================== */
function exportCSV() {
    const data = kandidat.filter(k => k.status === "APPROVED");
    if (!data.length) return alert("Belum ada pemenang");

    let csv = "BIB,Nama,Hadiah\n";
    data.forEach(k => {
        csv += `"${k.bib}","${k.nama}","${k.prize}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "laporan_pemenang.csv";
    a.click();

    URL.revokeObjectURL(url);
}

function exportPDF() {
    const data = kandidat.filter(k => k.status === "APPROVED");
    if (!data.length) return alert("Belum ada pemenang");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    // Judul
    doc.setFontSize(16);
    doc.text("LAPORAN PEMENANG UNDIAN", 105, 15, { align: "center" });

    // Info
    doc.setFontSize(10);
    doc.text(`Tanggal: ${new Date().toLocaleString("id-ID")}`, 14, 25);

    // Table
    const tableData = data.map((k, i) => [
        i + 1,
        k.bib,
        k.nama,
        k.prize
    ]);

    doc.autoTable({
        startY: 30,
        head: [["No", "BIB", "Nama", "Hadiah"]],
        body: tableData,
        styles: {
            fontSize: 9,
            cellPadding: 3
        },
        headStyles: {
            fillColor: [13, 110, 253] // biru
        }
    });

    doc.save("laporan_pemenang.pdf");
}

/* ======================================================
   Reset Hadiah dan Peserta
====================================================== */

function resetPeserta() {
    if (!confirm("Reset semua peserta?")) return;

    peserta = [];
    save("peserta", peserta);

    renderAll();
}

function resetHadiah() {
    if (!confirm("Reset semua hadiah?")) return;

    hadiah = [];
    initialHadiah = [];

    save("hadiah", hadiah);
    save("initialHadiah", initialHadiah);

    renderAll();
}

/* ======================================================
   Config Undian
====================================================== */
function getAnimationDuration(jumlah) {
    if (jumlah === 1) return 3500;   // 🔥 DRAMATIS
    if (jumlah <= 5) return 2200;
    if (jumlah <= 10) return 1600;
    return 1200;
}

const btnUndi = document.getElementById("btnUndi");

function disableUndiButton() {
    btnUndi.disabled = true;
    btnUndi.innerText = "SEDANG MENGUNDI...";
}

function enableUndiButton() {
    btnUndi.disabled = false;
    btnUndi.innerText = "UNDI SEKARANG";
}

/* ======================================================
   Config Search & Filter Pemenang
====================================================== */
function renderFilterHadiah() {
    const select = document.getElementById("filterHadiah");
    if (!select) return;

    const currentValue = select.value; // simpan pilihan user

    // Ambil HADIAH DARI DATA APPROVED SAAT INI
    const prizeSet = new Set(
        kandidat
            .filter(k => k.status === "APPROVED")
            .map(k => k.prize)
    );

    select.innerHTML = `<option value="">Semua Hadiah</option>`;

    [...prizeSet].forEach(prize => {
        select.innerHTML += `
            <option value="${prize}">${prize}</option>
        `;
    });

    // restore selection jika masih valid
    if ([...prizeSet].includes(currentValue)) {
        select.value = currentValue;
    } else {
        select.value = "";
    }
}

// ================= EVENT: GANTI HADIAH =================
if (window.selectHadiah && window.jumlahPemenang) {
    selectHadiah.addEventListener("change", () => {
        // reset jumlah ke default
        jumlahPemenang.value = 1;

        const idx = selectHadiah.value;
        if (idx !== "") {
            jumlahPemenang.max = hadiah[idx].stock;
        }
    });
}

// ================= CEK UNDIAN (PUBLIK) =================
function cekUndian() {
    const bib = document
        .getElementById("cekBibInput")
        .value
        .trim();

    const resultEl = document.getElementById("cekResult");
    resultEl.innerHTML = "";

    if (!bib) {
        resultEl.innerText = "Silakan masukkan nomor BIB.";
        return;
    }

    const pesertaAda = peserta.some(p => p.bib === bib)
        || kandidat.some(k => k.bib === bib);

    if (!pesertaAda) {
        resultEl.innerText =
            "Nomor BIB tidak ditemukan, pastikan penulisan sudah benar.";
        return;
    }

    const menang = kandidat.find(
        k => k.bib === bib && k.status === "APPROVED"
    );

    if (menang) {
        resultEl.innerHTML = `
            <div class="success">
                🎉 Selamat! Anda memenangkan <b>${menang.prize}</b>
            </div>
        `;
    } else {
        resultEl.innerText =
            "Mohon maaf, Anda belum beruntung atau nomor belum diundi.";
    }
}
