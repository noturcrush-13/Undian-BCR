self.onmessage = (e) => {
    const { type, payload } = e.data;

    /* ================= UNDI ================= */
    if (type === "UNDI") {
        const { peserta, hadiah, hadiahIndex, jumlah } = payload;
        const h = hadiah[hadiahIndex];

        // HARD GUARD
        if (!h || jumlah > h.stock || !peserta.length) {
            self.postMessage({
                type: "UNDI_RESULT",
                data: { peserta, kandidat: [] }
            });
            return;
        }

        let pool = [...peserta];
        let winners = [];

        for (let i = 0; i < jumlah; i++) {
            const r = Math.floor(Math.random() * pool.length);
            const p = pool.splice(r, 1)[0];
            winners.push({
                bib: p.bib,
                nama: p.nama,
                prize: h.prize,
                status: "PENDING"
            });
        }

        // ⏱️ MICRO DELAY
        // single: hampir instan
        // bulk: sedikit jeda biar UI smooth
        const delay = jumlah === 1 ? 50 : 250;

        setTimeout(() => {
            self.postMessage({
                type: "UNDI_RESULT",
                data: {
                    peserta: pool,
                    kandidat: winners
                }
            });
        }, delay);
    }

    /* ================= APPROVE ALL ================= */
    if (type === "APPROVE_ALL") {
        let { kandidat, hadiah } = payload;

        const pending = kandidat.filter(k => k.status === "PENDING");
        if (!pending.length) return;

        const {prize} = pending[0];
        const h = hadiah.find(x => x.prize === prize);
        if (!h || h.stock < pending.length) return;

        pending.forEach(k => (k.status = "APPROVED"));
        h.stock -= pending.length;

        self.postMessage({
            type: "APPROVE_ALL_RESULT",
            data: { kandidat, hadiah }
        });
    }
};
