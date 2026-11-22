// RAPS STAR Admin - panel developer
// Semua data disimpan di Firebase proyek raps-star. Tidak memakai server lama.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup,
  signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, deleteField, query, where, limit, serverTimestamp, increment,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref as rRef, get as rGet } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPn1GeGFPzLKrybV1AoXnQOzzcvbeyeDQ",
  authDomain: "raps-star.firebaseapp.com",
  projectId: "raps-star",
  storageBucket: "raps-star.firebasestorage.app",
  messagingSenderId: "109949114150",
  appId: "1:109949114150:android:83625d507cff44c70c53e7",
  databaseURL: "https://raps-star-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const PEMILIK = "fedli840@gmail.com";
const RILIS_INFO = "https://tagalungpey-stack.github.io/RAPS-STAR-APK/unduh/build-info.json";
const RILIS_PATCH = "https://tagalungpey-stack.github.io/RAPS-STAR-APK/unduh/patch-info.json";
const ASET_CDN = "https://data.jsdelivr.com/v1/packages/gh/tagalungpey-stack/RAPS-STAR-ASET@main";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

/* ---------------- util ---------------- */
const $ = (id) => document.getElementById(id);
const aman = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const angka = (n) => Number(n || 0).toLocaleString("id-ID");
const tgl = (ms) => (Number(ms) > 0 ? new Date(Number(ms)).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "–");
const pesan = (id, teks, jenis = "") => {
  const e = $(id); if (!e) return;
  e.className = "pesan tampil " + jenis;
  e.textContent = teks;
};
const kosongkan = (id) => { const e = $(id); if (e) e.className = "pesan"; };
const uidDari = async (nilai) => {
  const t = String(nilai || "").trim();
  if (!t) throw new Error("Isi ID user dulu");
  if (!/^\d+$/.test(t) || t.length > 20) return t;
  try {
    const r = await rGet(rRef(rtdb, "ids/i/" + t + "/uid"));
    if (r.exists() && r.val()) return String(r.val());
  } catch (e) { }
  const s = await getDoc(doc(db, "userIds", t));
  if (s.exists() && s.data().uid) return s.data().uid;
  for (const medan of ["userId", "uid"]) {
    const q = await getDocs(query(collection(db, "userIds"), where(medan, "==", t), limit(1)));
    if (!q.empty) { const u = q.docs[0].data().uid; if (u) return u; }
  }
  const q2 = await getDocs(query(collection(db, "users"), where("userId", "==", t), limit(1)));
  if (!q2.empty) return q2.docs[0].id;
  throw new Error("ID " + t + " tidak ditemukan di Realtime Database maupun Firestore. Pakai UID panjang atau email akun itu.");
};
const namaUser = async (uid) => {
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) {
      const d = s.data();
      return { nama: d.name || d.nama || d.fullName || "", id: d.userId || d.idAngka || "" };
    }
  } catch (e) { }
  try {
    const s = await rGet(rRef(rtdb, "pub/" + uid));
    if (s.exists()) return { nama: s.val().name || "", id: s.val().userId || "" };
  } catch (e) { }
  return { nama: "", id: "" };
};
const stafDoc = async (uid) => {
  const s = await getDoc(doc(db, "stafApk", uid));
  return s.exists() ? s.data() : { uid, peran: {}, stok: {} };
};
const peranAktif = (d) => Object.entries(d.peran || {}).filter(([, v]) => v && v.aktif !== false).map(([k]) => k);

/* ---------------- menu ---------------- */
const MENU = [
  ["dashboard", "🏠", "Dashboard"],
  ["user", "👥", "User"],
  ["room", "🎤", "Room"],
  ["gift", "🎁", "Gift"],
  ["cashback", "🎰", "Cashback gift"],
  ["frame", "🖼️", "Frame & banner"],
  ["asetvip", "✨", "Aset & VIP"],
  ["asetvps", "🗄️", "Aset di VPS"],
  ["emote", "😀", "Emote room"],
  ["kirim", "📤", "Kirim ke user"],
  ["staf", "👤", "Staf & seller"],
  ["cs", "💬", "Customer Service"],
  ["laporan", "🚩", "Laporan user"],
  ["coin", "🪙", "Coin & reset"],
  ["checkin", "📅", "Cek in harian"],
  ["rilis", "📦", "Rilis aplikasi"],
  ["blokir", "🚫", "Blokir user"]
];

let halaman = "dashboard";

function gambarMenu() {
  $("daftarMenu").innerHTML = MENU.map(([k, ikon, nama]) =>
    `<button class="menu${k === halaman ? " aktif" : ""}" data-hal="${k}"><i>${ikon}</i>${aman(nama)}</button>`
  ).join("");
  $("daftarMenu").querySelectorAll("[data-hal]").forEach((b) => {
    b.onclick = () => { halaman = b.dataset.hal; gambarMenu(); bukaHalaman(); $("sisi").classList.remove("buka"); };
  });
}

/* ---------------- gerbang ---------------- */
async function bolehPanel(u) {
  const email = (u.email || "").toLowerCase();
  if (email === PEMILIK) return { email, peran: "pemilik" };
  try {
    const s = await getDoc(doc(db, "panelAdmins", email));
    if (s.exists() && s.data().aktif !== false) return { email, peran: "admin" };
  } catch (e) { }
  return null;
}

onAuthStateChanged(auth, async (u) => {
  if (!u) {
    $("layarMasuk").style.display = "block";
    $("layarPanel").style.display = "none";
    return;
  }
  const izin = await bolehPanel(u);
  if (!izin) {
    await signOut(auth);
    $("layarMasuk").style.display = "block";
    $("layarPanel").style.display = "none";
    pesan("pesanMasuk", "Akun " + (u.email || "") + " tidak terdaftar sebagai admin panel.", "err");
    return;
  }
  $("layarMasuk").style.display = "none";
  $("layarPanel").style.display = "flex";
  $("emailSaya").textContent = izin.email;
  $("namaSaya").textContent = izin.email.split("@")[0];
  $("hurufSaya").textContent = (izin.email[0] || "?").toUpperCase();
  $("peranSaya").textContent = izin.peran;
  gambarMenu();
  bukaHalaman();
});

/* ---------------- login ---------------- */
const ponsel = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

async function masukGoogle() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  if (ponsel) { await signInWithRedirect(auth, p); return; }
  try { await signInWithPopup(auth, p); }
  catch (e) {
    const kode = e?.code || "";
    if (/popup-closed-by-user|popup-blocked|cancelled-popup-request|operation-not-supported/.test(kode)) {
      await signInWithRedirect(auth, p); return;
    }
    throw e;
  }
}
$("masukGoogle").onclick = async () => {
  pesan("pesanMasuk", "Membuka Google…");
  try { await masukGoogle(); }
  catch (e) { pesan("pesanMasuk", "Gagal masuk Google: " + (e.code || e.message), "err"); }
};
$("masukEmail").onclick = async () => {
  const email = $("email").value.trim(), sandi = $("sandi").value;
  if (!email || !sandi) { pesan("pesanMasuk", "Isi email dan sandi.", "err"); return; }
  pesan("pesanMasuk", "Memeriksa…");
  try { await signInWithEmailAndPassword(auth, email, sandi); }
  catch (e) {
    const kode = e?.code || "";
    pesan("pesanMasuk", /invalid-credential|wrong-password|user-not-found/.test(kode)
      ? "Email atau sandi salah." : "Gagal masuk: " + kode, "err");
  }
};
$("sandi").addEventListener("keydown", (e) => { if (e.key === "Enter") $("masukEmail").click(); });
$("keluar").onclick = () => signOut(auth);
$("bukaSisi").onclick = () => $("sisi").classList.toggle("buka");
getRedirectResult(auth).catch((e) => pesan("pesanMasuk", "Gagal masuk Google: " + (e.code || e.message), "err"));

/* ---------------- halaman ---------------- */
const JUDUL = Object.fromEntries(MENU.map(([k, , n]) => [k, n]));
async function bukaHalaman() {
  $("judulHal").textContent = JUDUL[halaman] || "Dashboard";
  const kotak = $("isiHal");
  kotak.innerHTML = '<div class="kartu redup">Memuat…</div>';
  try {
    const fn = {
      dashboard: halDashboard, user: halUser, room: halRoom, gift: () => halKatalog("Gift", "gift"),
      cashback: () => halKatalog("Cashback gift", "cashback"), frame: () => halKatalog("Frame & banner", "frame"),
      asetvip: () => halKatalog("Aset & VIP", ""), asetvps: halAsetVps, emote: () => halKatalog("Emote room", "emote"),
      kirim: halKirim, staf: halStaf, cs: () => halKoleksi("Customer Service", "csContacts"),
      laporan: () => halKoleksi("Laporan user", "reports"), coin: halCoin, checkin: () => halKoleksi("Cek in harian", "checkin"),
      rilis: halRilis, blokir: halBlokir
    }[halaman];
    kotak.innerHTML = await fn();
    pasangAksi();
  } catch (e) {
    kotak.innerHTML = `<div class="kartu"><div class="pesan tampil err">Gagal memuat: ${aman(e.message || e)}</div></div>`;
  }
}

/* ---------------- dashboard ---------------- */
async function halDashboard() {
  const hitung = async (k) => { try { return (await getCountFromServer(collection(db, k))).data().count; } catch (e) { return 0; } };
  const [u, s, a] = await Promise.all([hitung("users"), hitung("stafApk"), hitung("aset")]);
  let rilis = { versi: "–" };
  try { rilis = await (await fetch(RILIS_INFO + "?t=" + Date.now())).json(); } catch (e) { }
  return `
    <div class="grid4">
      <div class="angka"><b>${angka(u)}</b><span>Pengguna</span></div>
      <div class="angka"><b>${angka(s)}</b><span>Staf panel</span></div>
      <div class="angka"><b>${angka(a)}</b><span>Aset</span></div>
      <div class="angka"><b>${aman(rilis.versi || "–")}</b><span>Versi rilis</span></div>
    </div>
    <div class="grid2">
      <div class="kartu">
        <h2>Rincian<span class="label">langsung dari Firebase</span></h2>
        <table>
          <tr><td>Proyek</td><td class="mono">raps-star</td></tr>
          <tr><td>Pemilik panel</td><td class="mono">${PEMILIK}</td></tr>
          <tr><td>Paket aplikasi</td><td class="mono">com.rapsstar.app</td></tr>
          <tr><td>Halaman unduh</td><td><a class="tautan" href="https://tagalungpey-stack.github.io/RAPS-STAR-APK/" target="_blank" rel="noopener">buka</a></td></tr>
        </table>
      </div>
      <div class="kartu">
        <h2>Kunci<span class="label">akses</span></h2>
        <table>
          <tr><td>Aturan Firestore</td><td>terbuka untuk admin</td></tr>
          <tr><td>Login</td><td>${ponsel ? "pengalihan Google" : "popup Google"}</td></tr>
          <tr><td>Penyimpanan aset</td><td>repo GitHub gratis</td></tr>
        </table>
      </div>
    </div>
    <div class="kartu">
      <h2>Aksi cepat</h2>
      <div class="baris">
        <button class="tombol" data-pindah="kirim">Kirim ke user</button>
        <button class="tombol polos" data-pindah="staf">Staf & seller</button>
        <button class="tombol polos" data-pindah="rilis">Rilis aplikasi</button>
        <button class="tombol polos" data-pindah="user">Cari user</button>
      </div>
    </div>`;
}

/* ---------------- user ---------------- */
function kartuCari(judul, isiTombol) {
  return `<div class="kartu">
    <h2>${aman(judul)}</h2>
    <div class="baris">
      <div class="bidang"><label>ID user, UID, atau email</label><input id="cariId" placeholder="100000 atau UID"></div>
      <button class="tombol" id="cariTombol">Cari</button>
    </div>
    <div class="pesan" id="cariPesan"></div>
    ${isiTombol || ""}
  </div>`;
}
async function halUser() {
  return kartuCari("Cari user") + `<div id="hasilUser"></div>`;
}

/* ---------------- room ---------------- */
async function halRoom() {
  let daftar = null;
  for (const jalur of ["pub/rooms", "roomsPub", "rooms"]) {
    try {
      const s = await rGet(rRef(rtdb, jalur));
      if (s.exists()) { daftar = s.val(); break; }
    } catch (e) { }
  }
  if (!daftar) return `<div class="kartu"><h2>Room</h2><div class="pesan tampil">Daftar room publik belum bisa dibaca dari Realtime Database. Isi jalur publiknya belum ada.</div></div>`;
  const baris = Object.entries(daftar).slice(0, 60).map(([id, r]) => {
    const d = r || {};
    return `<tr><td class="mono">${aman(id)}</td><td>${aman(d.name || d.nama || "–")}</td><td>${aman(String(d.ownerUid || "").slice(0, 10))}</td></tr>`;
  }).join("");
  return `<div class="kartu"><h2>Room<span class="label">${Object.keys(daftar).length} room</span></h2>
    <table><tr><th>ID</th><th>Nama</th><th>Pemilik</th></tr>${baris}</table></div>`;
}

/* ---------------- katalog (gift, frame, emote, cashback) ---------------- */
async function halKatalog(judul, jenis) {
  const s = await getDocs(collection(db, "vipConfig"));
  const semua = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const isi = jenis ? semua.filter((x) => String(x.kind || x.jenis || "").toLowerCase().includes(jenis)) : semua;
  if (!isi.length) {
    return `<div class="kartu"><h2>${aman(judul)}</h2>
      <div class="pesan tampil">Belum ada item ${aman(judul.toLowerCase())} di koleksi vipConfig. Tambahkan dari Firebase Console atau panel lama.</div></div>`;
  }
  const baris = isi.map((x) => `<tr>
      <td>${aman(x.name || x.nama || x.id)}</td>
      <td>${aman(x.kind || x.jenis || "–")}</td>
      <td>${angka(x.harga || x.price || 0)}</td>
      <td>${angka(x.days || x.hari || 0)} hari</td>
    </tr>`).join("");
  return `<div class="kartu"><h2>${aman(judul)}<span class="label">${isi.length} item</span></h2>
    <table><tr><th>Nama</th><th>Jenis</th><th>Harga</th><th>Durasi</th></tr>${baris}</table></div>`;
}

/* ---------------- aset di repo gratis ---------------- */
async function halAsetVps() {
  let isi = [];
  try {
    const j = await (await fetch(ASET_CDN + "?t=" + Date.now())).json();
    const jelajah = (f, jalur) => f.forEach((x) => {
      const p = jalur ? jalur + "/" + x.name : x.name;
      if (x.type === "directory") jelajah(x.files || [], p); else isi.push({ nama: p, ukuran: x.size || 0 });
    });
    jelajah(j.files || [], "");
  } catch (e) {
    return `<div class="kartu"><h2>Aset di VPS</h2><div class="pesan tampil err">Gagal membaca daftar aset: ${aman(e.message)}</div></div>`;
  }
  if (!isi.length) return `<div class="kartu"><h2>Aset di VPS</h2><div class="pesan tampil">Belum ada berkas aset di repo RAPS-STAR-ASET.</div></div>`;
  const baris = isi.slice(0, 80).map((f) => `<tr>
      <td class="mono">${aman(f.nama)}</td>
      <td>${(f.ukuran / 1024).toFixed(0)} KB</td>
      <td><a class="tautan" target="_blank" rel="noopener" href="https://cdn.jsdelivr.net/gh/tagalungpey-stack/RAPS-STAR-ASET@main/${encodeURI(f.nama)}">buka</a></td>
    </tr>`).join("");
  return `<div class="kartu"><h2>Aset di VPS<span class="label">${isi.length} berkas · CDN gratis</span></h2>
    <table><tr><th>Berkas</th><th>Ukuran</th><th>Tautan</th></tr>${baris}</table></div>`;
}

/* ---------------- koleksi umum ---------------- */
async function halKoleksi(judul, koleksi) {
  let docs = [];
  try { docs = (await getDocs(collection(db, koleksi))).docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { }
  if (!docs.length) return `<div class="kartu"><h2>${aman(judul)}</h2>
    <div class="pesan tampil">Koleksi <b>${aman(koleksi)}</b> masih kosong atau belum ada. Menu ini akan terisi otomatis begitu ada data.</div></div>`;
  const kolom = Object.keys(docs[0]).slice(0, 5);
  const baris = docs.slice(0, 50).map((d) => `<tr>${kolom.map((k) => `<td>${aman(typeof d[k] === "object" ? JSON.stringify(d[k]) : d[k])}</td>`).join("")}</tr>`).join("");
  return `<div class="kartu"><h2>${aman(judul)}<span class="label">${docs.length} data</span></h2>
    <table><tr>${kolom.map((k) => `<th>${aman(k)}</th>`).join("")}</tr>${baris}</table></div>`;
}

/* ---------------- kirim ke user ---------------- */
async function halKirim() {
  return `<div class="kartu">
    <h2>Kirim ke user</h2>
    <div class="baris">
      <div class="bidang"><label>ID user / UID</label><input id="kId"></div>
      <div class="bidang"><label>Coin</label><input id="kCoin" type="number" value="0"></div>
      <div class="bidang"><label>VIP (0 = tidak)</label><input id="kVip" type="number" min="0" max="9" value="0"></div>
      <div class="bidang"><label>Hari VIP</label><input id="kHari" type="number" value="30"></div>
      <button class="tombol" id="kKirim">Kirim</button>
    </div>
    <div class="pesan" id="kPesan"></div>
  </div>`;
}

/* ---------------- staf ---------------- */
async function halStaf() {
  const s = await getDocs(collection(db, "stafApk"));
  const baris = [];
  for (const d of s.docs) {
    const data = d.data();
    const peran = peranAktif(data);
    if (!peran.length) continue;
    const p = await namaUser(d.id);
    baris.push(`<tr>
      <td>${aman(p.nama || "–")}<div class="kecil mono">${aman(d.id.slice(0, 12))}</div></td>
      <td class="mono">${aman(p.id || "–")}</td>
      <td>${peran.map((r) => `<span class="mono">${aman(r)}</span>`).join(", ")}</td>
      <td>${Object.keys(data.stok || {}).length}</td>
      <td><button class="tombol bahaya" data-cabut="${aman(d.id)}" style="padding:5px 9px">Cabut</button></td>
    </tr>`);
  }
  return `<div class="kartu">
      <h2>Kirim panel<span class="label">manager atau admin</span></h2>
      <div class="baris">
        <div class="bidang"><label>ID user / UID</label><input id="pId"></div>
        <div class="bidang"><label>Peran</label><select id="pPeran"><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
        <div class="bidang"><label>Stok coin untuk peran ini</label><input id="pCoin" type="number" value="0"></div>
        <button class="tombol" id="pKirim">Kirim panel</button>
      </div>
      <div class="pesan" id="pPesan"></div>
    </div>
    <div class="kartu"><h2>Staf & seller<span class="label">${baris.length} aktif</span></h2>
      ${baris.length ? `<table><tr><th>Nama</th><th>ID</th><th>Peran</th><th>Stok</th><th></th></tr>${baris.join("")}</table>`
      : '<div class="pesan tampil">Belum ada staf yang punya panel aktif.</div>'}
    </div>`;
}

/* ---------------- coin & reset ---------------- */
async function halCoin() {
  return `<div class="kartu">
    <h2>Coin & reset</h2>
    <div class="baris">
      <div class="bidang"><label>ID user / UID</label><input id="cId"></div>
      <div class="bidang"><label>Jumlah coin</label><input id="cJumlah" type="number" value="1000"></div>
      <button class="tombol" id="cTambah">Tambah</button>
      <button class="tombol polos" id="cSet">Set</button>
      <button class="tombol bahaya" id="cReset">Reset 0</button>
    </div>
    <div class="pesan" id="cPesan"></div>
  </div>
  <div class="kartu"><h2>Status dompet</h2><div id="cStatus" class="redup">Cari user untuk melihat saldo.</div></div>`;
}

/* ---------------- blokir ---------------- */
async function halBlokir() {
  return `<div class="kartu">
    <h2>Blokir user</h2>
    <div class="baris">
      <div class="bidang"><label>ID user / UID</label><input id="bId"></div>
      <div class="bidang"><label>Alasan</label><input id="bAlasan" placeholder="mis. spam"></div>
      <button class="tombol bahaya" id="bBlokir">Blokir</button>
      <button class="tombol hijau" id="bBuka">Buka blokir</button>
    </div>
    <div class="pesan" id="bPesan"></div>
  </div>
  <div id="bDaftar"></div>`;
}

/* ---------------- rilis ---------------- */
async function halRilis() {
  let info = null, patch = null;
  try { info = await (await fetch(RILIS_INFO + "?t=" + Date.now())).json(); } catch (e) { }
  try { patch = await (await fetch(RILIS_PATCH + "?t=" + Date.now())).json(); } catch (e) { }
  if (!info) return `<div class="kartu"><h2>Rilis aplikasi</h2><div class="pesan tampil err">Info rilis tidak terbaca.</div></div>`;
  const abis = Object.entries(info.abis || {}).map(([k, v]) =>
    `<tr><td>${aman(k)}</td><td>${(v.ukuran / 1048576).toFixed(1)} MB</td><td class="mono">${aman(String(v.sha256 || "").slice(0, 12))}</td></tr>`).join("");
  const pat = (patch?.patch || []).map((p) => `<tr><td>${aman(p.dari)} → ${aman(p.ke)}</td>
      <td>${p.arm64 ? (p.arm64.ukuran / 1048576).toFixed(1) + " MB" : "–"}</td>
      <td>${p.armv7 ? (p.armv7.ukuran / 1048576).toFixed(1) + " MB" : "–"}</td></tr>`).join("");
  return `<div class="kartu">
      <h2>Rilis terbaru<span class="label">versi ${aman(info.versi)}</span></h2>
      <div class="redup" style="white-space:pre-wrap;margin-bottom:10px">${aman(info.catatan || "")}</div>
      <table><tr><th>Arsitektur</th><th>Ukuran</th><th>SHA-256</th></tr>${abis}</table>
      <div class="baris" style="margin-top:12px">
        <a class="tombol" style="text-decoration:none" href="https://tagalungpey-stack.github.io/RAPS-STAR-APK/" target="_blank" rel="noopener">Halaman unduh</a>
      </div>
    </div>
    <div class="kartu"><h2>Patch kecil<span class="label">unduhan pembaruan</span></h2>
      ${pat ? `<table><tr><th>Versi</th><th>arm64</th><th>armv7</th></tr>${pat}</table>` : '<div class="pesan tampil">Belum ada data patch.</div>'}
    </div>`;
}

/* ---------------- aksi ---------------- */
function pasangAksi() {
  document.querySelectorAll("[data-pindah]").forEach((b) => {
    b.onclick = () => { halaman = b.dataset.pindah; gambarMenu(); bukaHalaman(); };
  });

  if ($("cariTombol")) $("cariTombol").onclick = async () => {
    pesan("cariPesan", "Mencari…");
    try {
      const uid = await uidDari($("cariId").value);
      const p = await namaUser(uid);
      const w = await getDoc(doc(db, "wallets", uid));
      const wd = w.exists() ? w.data() : {};
      const st = await stafDoc(uid);
      const bn = await getDoc(doc(db, "banned", uid));
      const peran = peranAktif(st);
      $("hasilUser").innerHTML = `<div class="kartu">
        <h2>${aman(p.nama || "Tanpa nama")}<span class="label mono">${aman(uid)}</span></h2>
        <table>
          <tr><td>ID angka</td><td class="mono">${aman(p.id || "–")}</td></tr>
          <tr><td>Coin</td><td>${angka(wd.coins || 0)}</td></tr>
          <tr><td>Berlian</td><td>${angka(wd.diamonds || 0)}</td></tr>
          <tr><td>VIP</td><td>${wd.vip ? "VIP" + wd.vip + " sampai " + tgl(wd.vipUntil) : "tidak aktif"}</td></tr>
          <tr><td>Panel</td><td>${peran.length ? peran.map(aman).join(", ") : "tidak ada"}</td></tr>
          <tr><td>Blokir</td><td>${bn.exists() ? "diblokir: " + aman(bn.data().reason || "tanpa alasan") : "tidak"}</td></tr>
        </table>
      </div>`;
      pesan("cariPesan", "Ditemukan.", "ok");
    } catch (e) { pesan("cariPesan", e.message, "err"); }
  };

  if ($("kKirim")) $("kKirim").onclick = async () => {
    pesan("kPesan", "Mengirim…");
    try {
      const uid = await uidDari($("kId").value);
      const coin = Number($("kCoin").value) || 0;
      const vip = Number($("kVip").value) || 0;
      const hari = Number($("kHari").value) || 30;
      const ubah = {};
      if (coin) ubah.coins = increment(coin);
      if (vip > 0) { ubah.vip = vip; ubah.vipUntil = Date.now() + hari * 86400000; }
      if (!Object.keys(ubah).length) throw new Error("Isi coin atau VIP dulu");
      ubah.diperbarui = serverTimestamp();
      await setDoc(doc(db, "wallets", uid), ubah, { merge: true });
      pesan("kPesan", "Terkirim" + (coin ? " · " + angka(coin) + " coin" : "") + (vip ? " · VIP" + vip + " " + hari + " hari" : "") + ".", "ok");
    } catch (e) { pesan("kPesan", e.message, "err"); }
  };

  if ($("pKirim")) $("pKirim").onclick = async () => {
    pesan("pPesan", "Menyimpan…");
    try {
      const uid = await uidDari($("pId").value);
      const peran = $("pPeran").value;
      const coin = Number($("pCoin").value) || 0;
      const d = await stafDoc(uid);
      const peta = { ...(d.peran || {}) };
      peta[peran] = { ...(peta[peran] || {}), aktif: true, coins: coin, manager: peran === "manager" ? "" : (peta[peran]?.manager || "") };
      await setDoc(doc(db, "stafApk", uid), {
        uid, peran: peta, aktif: Object.values(peta).some((x) => x && x.aktif !== false), diperbarui: serverTimestamp()
      }, { merge: true });
      pesan("pPesan", "Panel " + peran + " dikirim. User perlu membuka aplikasi ulang agar menu muncul.", "ok");
    } catch (e) { pesan("pPesan", e.message, "err"); }
  };
  document.querySelectorAll("[data-cabut]").forEach((b) => {
    b.onclick = async () => {
      const uid = b.dataset.cabut;
      if (!confirm("Cabut semua panel milik user ini?")) return;
      try {
        const d = await stafDoc(uid);
        const peta = {};
        for (const [k, v] of Object.entries(d.peran || {})) peta[k] = { ...(v || {}), aktif: false };
        await setDoc(doc(db, "stafApk", uid), { peran: peta, aktif: false, diperbarui: serverTimestamp() }, { merge: true });
        bukaHalaman();
      } catch (e) { alert("Gagal: " + e.message); }
    };
  });

  if ($("cTambah") || $("cSet") || $("cReset")) {
    const ubahCoin = async (mode) => {
      pesan("cPesan", "Menyimpan…");
      try {
        const uid = await uidDari($("cId").value);
        const n = Number($("cJumlah").value) || 0;
        const isi = mode === "tambah" ? { coins: increment(n) } : { coins: mode === "set" ? n : 0 };
        await setDoc(doc(db, "wallets", uid), { ...isi, diperbarui: serverTimestamp() }, { merge: true });
        const w = await getDoc(doc(db, "wallets", uid));
        pesan("cPesan", "Saldo sekarang " + angka(w.data()?.coins || 0) + " coin.", "ok");
        $("cStatus").innerHTML = `Saldo: <b>${angka(w.data()?.coins || 0)}</b> coin · VIP${w.data()?.vip || 0}`;
      } catch (e) { pesan("cPesan", e.message, "err"); }
    };
    $("cTambah").onclick = () => ubahCoin("tambah");
    $("cSet").onclick = () => ubahCoin("set");
    $("cReset").onclick = () => ubahCoin("reset");
  }

  if ($("bBlokir") || $("bBuka")) {
    const kerja = async (blokir) => {
      pesan("bPesan", "Memproses…");
      try {
        const uid = await uidDari($("bId").value);
        if (blokir) {
          await setDoc(doc(db, "banned", uid), { reason: $("bAlasan").value.trim() || "Diblokir admin", oleh: auth.currentUser?.email || "", waktu: serverTimestamp() }, { merge: true });
          pesan("bPesan", "User diblokir. Aplikasi menampilkan layar blokir.", "ok");
        } else {
          await deleteDoc(doc(db, "banned", uid));
          pesan("bPesan", "Blokir dibuka.", "ok");
        }
      } catch (e) { pesan("bPesan", e.message, "err"); }
    };
    $("bBlokir").onclick = () => kerja(true);
    $("bBuka").onclick = () => kerja(false);
  }
}

/* ---------------- jam ---------------- */
setInterval(() => {
  const d = new Date();
  $("jam").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}, 1000);
