const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1TLWTKRlJohJyO3iJMpc2BT7hwPAw1NzXR7j5llG39dinMXHFHD_B4-ShCccmytFQ/exec";
const IMGBB_API_KEY = "3bfecfc2ba198517bfa79d76fe0c9e5e";
const DRAFT_KEY = "cs69_draft_v1";
const THEME_KEY = "theme";
const SESSION_KEY = "cs69_admin_session";
const ADMIN_IDLE_MS = 30 * 60 * 1000;

const PRICE_RULES = {
  base: 279,
  surcharge: { "2XL": 10 }
};
function computePrice(basePrice, size) {
  const base = Number(basePrice) || PRICE_RULES.base;
  const extra = PRICE_RULES.surcharge[size] || 0;
  return { base, extra, total: base + extra };
}

const state = {
  style: "เสื้อฟุตบอล", price: 279, basePrice: 279, surcharge: 0, size: "M",
  slipFile: null, slipOCR: "", slipRef: "", slipAmount: null,
  slipAmountMatched: false, slipOCRDone: false,
  adminOrders: [], publicOrders: [], lastOrderId: null,
  adminName: ""
};

const $ = id => document.getElementById(id);
const toast = (msg, type) => { const t = $("toast"); t.textContent = msg; t.className = "toast show " + (type || ""); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600); };
const formatTHB = n => "฿" + n.toLocaleString("th-TH");

async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res;
  } finally { clearTimeout(timer); }
}
async function fetchWithRetry(url, options = {}, { retries = 2, ms = 20000, backoff = 800 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fetchWithTimeout(url, options, ms); }
    catch (err) { lastErr = err; if (i < retries) await new Promise(r => setTimeout(r, backoff * (i + 1))); }
  }
  throw lastErr;
}

// THEME
if (localStorage.getItem(THEME_KEY) === "light") {
  document.body.classList.remove("dark-mode");
  $("themeText").textContent = "Dark Mode";
  if ($("themeSwitch")) $("themeSwitch").checked = false;
} else {
  document.body.classList.add("dark-mode");
  $("themeText").textContent = "Light Mode";
  $("themeIcon").innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';
  if ($("themeSwitch")) $("themeSwitch").checked = true;
}

function toggleMenu() {
  const menu = $("sideMenu"), overlay = $("menuOverlay");
  if (menu.classList.contains("open")) { menu.classList.remove("open"); overlay.style.display = "none"; }
  else { menu.classList.add("open"); overlay.style.display = "block"; }
}
function toggleTheme() {
  const body = document.body, themeText = $("themeText"), themeIcon = $("themeIcon"), switchBox = $("themeSwitch");
  body.classList.toggle("dark-mode");
  if (body.classList.contains("dark-mode")) {
    themeText.textContent = "Light Mode";
    themeIcon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';
    if (switchBox) switchBox.checked = true;
    localStorage.setItem(THEME_KEY, "dark");
  } else {
    themeText.textContent = "Dark Mode";
    themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    if (switchBox) switchBox.checked = false;
    localStorage.setItem(THEME_KEY, "light");
  }
}

function closeModal(id) { $(id).style.display = "none"; }
function openTrackModal() { $("trackModal").style.display = "flex"; $("trackPhone").value = ""; $("trackResult").className = "status-result"; $("trackResult").style.display = "none"; }
function openSizeGuide() { $("sizeModal").style.display = "flex"; }
function goBackHome() { $("screen-success").style.display = "none"; $("screen-form").style.display = "block"; resetForm(); window.scrollTo(0, 0); }
function goBackFromHistory() { $("screen-history").style.display = "none"; $("screen-form").style.display = "block"; $("trackPhone").value = ""; window.scrollTo(0, 0); }

// DRAFT
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({
    backName: $("backName").value, backNumber: $("backNumber").value,
    firstName: $("firstName").value, lastName: $("lastName").value,
    customerEmail: $("customerEmail").value, phone: $("phone").value,
    classRoom: $("classRoom").value, style: state.style, size: state.size
  })); } catch (e) {}
}
function loadDraft() { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function dismissDraft() { localStorage.removeItem(DRAFT_KEY); $("draftBanner").classList.remove("show"); }
function restoreDraft() {
  const d = loadDraft(); if (!d) return;
  $("backName").value = d.backName || ""; $("backNumber").value = d.backNumber || "";
  $("firstName").value = d.firstName || ""; $("lastName").value = d.lastName || "";
  $("customerEmail").value = d.customerEmail || ""; $("phone").value = d.phone || "";
  $("classRoom").value = d.classRoom || "";
  if (d.style) {
    document.querySelectorAll("#stylePicker .style-btn").forEach(b => b.classList.toggle("active", b.dataset.style === d.style));
    state.style = d.style;
    const activeBtn = document.querySelector("#stylePicker .style-btn.active");
    state.basePrice = activeBtn ? (parseInt(activeBtn.dataset.price, 10) || PRICE_RULES.base) : PRICE_RULES.base;
  }
  if (d.size) {
    document.querySelectorAll("#sizePicker .size-btn").forEach(b => b.classList.toggle("active", b.dataset.size === d.size));
    state.size = d.size;
  }
  const calc = computePrice(state.basePrice, state.size);
  state.surcharge = calc.extra;
  state.price = calc.total;
  $("draftBanner").classList.remove("show");
  updateSummary(); checkFormValid(); updateNumberPreview();
  toast("กู้คืนข้อมูลแล้ว", "success");
}
(function initDraftBanner() { const d = loadDraft(); if (d && (d.backName || d.firstName || d.phone)) $("draftBanner").classList.add("show"); })();

// PHONE CHECK
let isPhoneDuplicate = false;
let phoneCheckTimeout;

async function checkPhoneLive() {
  const phone = $("phone").value.trim();
  const warningBox = $("phoneWarning");
  if (phone.replace(/\D/g,"").length < 9) {
    if(warningBox) warningBox.style.display = "none";
    isPhoneDuplicate = false;
    checkFormValid();
    return;
  }
  clearTimeout(phoneCheckTimeout);
  phoneCheckTimeout = setTimeout(async () => {
    try {
      const res = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?action=check_phone&phone=${encodeURIComponent(phone)}`);
      const r = await res.json();
      if (r.status === "success" && r.duplicate) {
        isPhoneDuplicate = true;
        if(warningBox) {
          warningBox.textContent = "เบอร์โทรนี้เคยสั่งซื้อแล้ว (หากต้องการสั่งเพิ่มจริงๆ ให้กดปุ่มยืนยันด้านล่างได้เลย)";
          warningBox.style.display = "block";
        }
      } else {
        isPhoneDuplicate = false;
        if(warningBox) warningBox.style.display = "none";
      }
    } catch (e) {
      console.warn("Phone check failed", e);
    }
    checkFormValid();
  }, 800);
}

// OCR
const SlipValidator = {
  normalizeDigits(text) { return String(text || "").replace(/[๐-๙]/g, d => "๐๑๒๓๔๕๖๗๘๙".indexOf(d)); },
  extractAmount(text) {
    const normalized = this.normalizeDigits(text).replace(/,/g, "");
    const lines = normalized.split(/\r?\n/);
    for (const line of lines) {
      if (/amount|ยอดเงิน|จำนวนเงิน|บาท|thb/i.test(line)) {
        const matches = line.match(/\b\d{1,6}(?:\.\d{1,2})?\b/g);
        if (matches) {
          const nums = matches.map(Number).filter(n => Number.isFinite(n) && n > 0 && n < 1000000);
          if (nums.length) return nums[nums.length - 1];
        }
      }
    }
    const decimal = normalized.match(/\b\d{1,6}\.\d{2}\b/g);
    if (decimal && decimal.length) return Number(decimal[decimal.length - 1]);
    return null;
  },
  extractReference(text) {
    const normalized = this.normalizeDigits(text).replace(/[^\d]/g, " ");
    const candidates = normalized.match(/\b\d{12,20}\b/g) || [];
    return candidates[0] || "";
  }
};

async function analyzeSlip(file) {
  $("aiScannerBox").style.display = "block";
  $("aiStatusText").style.display = "block";
  $("aiStatusText").textContent = "กำลังอ่านข้อมูลจากสลิป...";
  state.slipOCRDone = false;
  state.slipAmountMatched = false;
  state.slipOCR = ""; state.slipRef = ""; state.slipAmount = null;
  checkFormValid();

  let worker;
  try {
    worker = await Tesseract.createWorker("eng");
    const result = await worker.recognize(file);
    const text = result?.data?.text || "";
    state.slipOCR = text;
    state.slipRef = SlipValidator.extractReference(text);
    state.slipAmount = SlipValidator.extractAmount(text);
    state.slipOCRDone = true;
    state.slipAmountMatched = state.slipAmount !== null &&
      Math.abs(Number(state.slipAmount) - Number(state.price)) < 0.01;

    if (state.slipAmountMatched) {
      $("aiStatusText").innerHTML =
        `อ่านยอดได้ <strong>${formatTHB(state.slipAmount)}</strong> ตรงกับยอดสั่งซื้อ ` +
        `<strong>${formatTHB(state.price)}</strong> — OCR ตรงกัน (ยังต้องตรวจสลิปจริง)`;
    } else if (state.slipAmount !== null) {
      $("aiStatusText").textContent =
        `อ่านยอดได้ ${formatTHB(state.slipAmount)} แต่ยอดสั่งซื้อ ${formatTHB(state.price)} ไม่ตรงกัน กรุณาตรวจสอบสลิป`;
    } else {
      $("aiStatusText").textContent =
        "อ่านยอดเงินไม่สำเร็จ กรุณาตรวจสอบสลิปด้วยตนเอง หรืออัปโหลดภาพที่ชัดขึ้น";
    }
  } catch (err) {
    state.slipOCRDone = true;
    $("aiStatusText").textContent = "OCR ทำงานไม่สำเร็จ กรุณาตรวจสอบสลิปด้วยตนเอง";
  } finally {
    if (worker) try { await worker.terminate(); } catch (_) {}
    checkFormValid();
  }
}

async function handleSlipUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { toast("กรุณาอัปโหลดไฟล์รูปภาพ", "error"); e.target.value = ""; return; }
  if (file.size > 5 * 1024 * 1024) { toast("ไฟล์ใหญ่เกิน 5MB", "error"); e.target.value = ""; return; }
  state.slipFile = file;
  state.slipOCR = ""; state.slipRef = ""; state.slipAmount = null;
  state.slipOCRDone = false; state.slipAmountMatched = false;
  const preview = $("slipPreview");
  if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
  preview.dataset.objectUrl = URL.createObjectURL(file);
  preview.src = preview.dataset.objectUrl; preview.style.display = "block";
  $("slipText").textContent = "แนบแล้ว: " + file.name;
  $("slipDrop").classList.add("has-file");
  $("aiStatusText").textContent = "";
  $("aiScannerBox").style.display = "none";
  checkFormValid(); saveDraft();
  if ($("aiToggle").checked) await analyzeSlip(file);
}

$("aiToggle").addEventListener("change", async () => {
  if (state.slipFile && $("aiToggle").checked) await analyzeSlip(state.slipFile);
  else { $("aiScannerBox").style.display = "none"; checkFormValid(); }
});

function updateNumberPreview() {
  const num = $("backNumber").value.trim();
  if (num.length > 0) {
    $("numberPreviewBox").style.display = "block"; $("numberPreviewText").textContent = num;
    $("numberPreviewText").style.transform = "scale(1.1)";
    setTimeout(() => $("numberPreviewText").style.transform = "scale(1)", 100);
  } else $("numberPreviewBox").style.display = "none";
  updateSummary(); checkFormValid(); saveDraft();
}
function randomLuckyNumber() {
  const lucky = ["01","02","03","05","06","07","08","09","10","11","12","13","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","35","36","37","38","39","40","41","42","43","45","46","47","48","49","50","51","52","53","55","56","57","58","59","60","61","62","63","65","66","67","68","69","70","71","72","73","75","76","77","78","79","80","81","82","83","85","86","87","88","89","90","91","92","93","95","96","97","98","99"];
  const r = lucky[Math.floor(Math.random() * lucky.length)];
  $("backNumber").value = r; updateNumberPreview(); toast("สุ่มได้เบอร์ " + r);
}

// TRACKING
function trackingEscape(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]); }
function trackingFormatDate(v) { if (!v) return "ไม่ระบุเวลา"; const d = new Date(v); if (Number.isNaN(d.getTime())) return trackingEscape(v); return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); }
function trackingStatusClass(s) { if (s === "จัดส่งแล้ว") return "delivered"; if (s === "กำลังผลิต") return "producing"; if (s === "ยกเลิก") return "cancelled"; return "pending"; }
function buildStatusTimeline(status) {
  const stages = [{n:"รอตรวจสอบ",d:"ระบบได้รับคำสั่งซื้อแล้ว"},{n:"กำลังผลิต",d:"กำลังดำเนินการผลิตเสื้อ"},{n:"จัดส่งแล้ว",d:"คำสั่งซื้อถูกจัดส่งแล้ว"}];
  if (status === "ยกเลิก") return `<div class="tracking-cancelled"><span class="tracking-step-icon">×</span><div><strong>คำสั่งซื้อถูกยกเลิก</strong><p>หากต้องการสอบถามรายละเอียด กรุณาติดต่อผู้ดูแลระบบ</p></div></div>`;
  const idx = stages.findIndex(s => s.n === status);
  return `<div class="tracking-timeline">${stages.map((s, i) => `<div class="tracking-timeline-item ${idx >= i ? "completed" : ""} ${idx === i ? "active" : ""}"><div class="tracking-timeline-marker">${idx >= i ? "✓" : i + 1}</div><div class="tracking-timeline-copy"><strong>${s.n}${idx === i ? " · สถานะปัจจุบัน" : ""}</strong><p>${s.d}</p></div></div>`).join("")}</div>`;
}
async function loadOrderHistory(id) {
  const res = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?action=get_order_history&orderid=${encodeURIComponent(id)}`, {}, { retries: 2, ms: 15000 });
  const r = await res.json();
  if (r.status !== "success" || !Array.isArray(r.data)) throw new Error(r.message || "อ่านประวัติไม่ได้");
  return r.data;
}
function renderOrderHistory(h) {
  if (!h.length) return `<div class="tracking-empty-history">ยังไม่มีประวัติ</div>`;
  return `<div class="tracking-history-list">${h.map(i => `<div class="tracking-history-item"><span class="tracking-history-dot"></span><div class="tracking-history-content"><strong>${trackingEscape(i.newStatus || "อัปเดต")}</strong><span>${trackingEscape(trackingFormatDate(i.changedAt))}</span>${i.changedBy ? `<small>ผู้ดำเนินการ: ${trackingEscape(i.changedBy)}</small>` : ""}</div></div>`).join("")}</div>`;
}

async function trackOrder() {
  const id = $("trackPhone").value.trim().toUpperCase();
  const resDiv = $("trackResult"), btn = $("trackBtn");
  if (!/^CS69-\d{4}$/.test(id)) { resDiv.style.display = "block"; resDiv.className = "status-result error"; resDiv.textContent = "กรุณากรอกรหัสออเดอร์รูปแบบ CS69-1234"; return; }
  const orig = btn.textContent; btn.textContent = "กำลังค้นหา..."; btn.disabled = true;
  resDiv.style.display = "block"; resDiv.className = "status-result loading"; resDiv.textContent = "กำลังค้นหา...";
  try {
    const response = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?orderid=${encodeURIComponent(id)}`, {}, { retries: 2, ms: 15000 });
    const r = await response.json();
    if (r.status === "not_found") { resDiv.className = "status-result error"; resDiv.textContent = `ไม่พบคำสั่งซื้อรหัส ${id}`; return; }
    if (r.status !== "success" || !r.data) throw new Error(r.message || "ข้อมูลไม่ถูกต้อง");
    const o = r.data;
    let history = [], historyMsg = "";
    try { history = await loadOrderHistory(id); }
    catch (e) { historyMsg = "ขณะนี้ยังโหลดประวัติย้อนหลังไม่ได้"; }
    const status = o.status || "รอตรวจสอบ";
    const statusCls = trackingStatusClass(status);
    const priceLine = o.price ? `<div class="tracking-detail-row"><span>ยอดชำระ</span><strong style="color:var(--brand-red);">${formatTHB(o.price)}</strong></div>` : "";
    $("historyPageContent").innerHTML = `
      <section class="tracking-order-heading">
        <div class="tracking-eyebrow">CHIANG SAEN GEAR · ORDER TRACKING</div>
        <div class="tracking-order-id">${trackingEscape(o.orderId || id)}</div>
        <div class="tracking-customer-name">คุณ ${trackingEscape(o.name || "ลูกค้า")}</div>
        <div class="tracking-order-date">สั่งซื้อเมื่อ ${trackingEscape(trackingFormatDate(o.date))}</div>
      </section>
      <section class="tracking-detail-card">
        <h3>รายละเอียดคำสั่งซื้อ</h3>
        <div class="tracking-detail-row"><span>รูปแบบเสื้อ</span><strong>${trackingEscape(o.style || "—")}</strong></div>
        <div class="tracking-detail-row"><span>ไซส์</span><strong>${trackingEscape(o.size || "—")}</strong></div>
        <div class="tracking-detail-row"><span>ชื่อสกรีน</span><strong>${trackingEscape(o.backName || "—")}</strong></div>
        <div class="tracking-detail-row"><span>เบอร์หลังเสื้อ</span><strong>${trackingEscape(o.backNumber || "—")}</strong></div>
        ${priceLine}
      </section>
      <section class="tracking-current-card ${statusCls}">
        <div class="tracking-current-label">สถานะปัจจุบัน</div>
        <div class="tracking-current-status">${trackingEscape(status)}</div>
      </section>
      <section class="tracking-section"><h3>ความคืบหน้าคำสั่งซื้อ</h3>${buildStatusTimeline(status)}</section>
      <section class="tracking-section"><h3>ประวัติการอัปเดต</h3>${historyMsg ? `<p class="tracking-history-warning">${trackingEscape(historyMsg)}</p>` : ""}${renderOrderHistory(history)}</section>
      <div class="share-row">
        <button class="share-btn" onclick="shareOrderLink('${trackingEscape(id)}')">แชร์ลิงก์ติดตาม</button>
        <button class="share-btn" onclick="copyToClipboard('${trackingEscape(id)}', 'คัดลอกรหัสแล้ว')">คัดลอกรหัส</button>
      </div>
      <button type="button" class="btn btn-primary" style="margin-top:16px;" onclick="trackOrderAgain('${trackingEscape(id)}')">ตรวจสอบอีกครั้ง</button>`;
    closeModal("trackModal");
    $("screen-form").style.display = "none";
    $("screen-history").style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    resDiv.className = "status-result error";
    resDiv.textContent = "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง";
  } finally { btn.textContent = orig; btn.disabled = false; }
}
function trackOrderAgain(id) { $("screen-history").style.display = "none"; $("screen-form").style.display = "block"; $("trackPhone").value = id; $("trackModal").style.display = "flex"; $("trackResult").style.display = "none"; trackOrder(); }

// SELECTION & PRICING
document.querySelectorAll("#stylePicker .style-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("#stylePicker .style-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.style = btn.dataset.style;
    state.basePrice = parseInt(btn.dataset.price, 10) || PRICE_RULES.base;
    const calc = computePrice(state.basePrice, state.size);
    state.surcharge = calc.extra;
    state.price = calc.total;
    updateSummary(); checkFormValid(); saveDraft();
    if (state.slipFile && $("aiToggle").checked) await analyzeSlip(state.slipFile);
  });
});
document.querySelectorAll("#sizePicker .size-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("#sizePicker .size-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.size = btn.dataset.size;
    const calc = computePrice(state.basePrice, state.size);
    state.surcharge = calc.extra;
    state.price = calc.total;
    updateSummary(); checkFormValid(); saveDraft();
    if (state.slipFile && $("aiToggle").checked) await analyzeSlip(state.slipFile);
  });
});

function updateSummary() {
  $("sumStyle").textContent = state.style;
  $("sumSize").textContent = state.size;
  $("sumBack").textContent = $("backName").value.trim() || "—";
  $("sumNumber").textContent = $("backNumber").value.trim() || "—";
  $("sumClass").textContent = $("classRoom").value || "—";

  const totalEl = $("sumTotal");
  if (state.surcharge > 0) {
    totalEl.innerHTML = `${formatTHB(state.price)} <small>(ฐาน ${formatTHB(state.basePrice)} + ไซส์ ${state.size} ${formatTHB(state.surcharge)})</small>`;
  } else {
    totalEl.textContent = formatTHB(state.price);
  }
  
  $("payAmount").textContent = formatTHB(state.price);
}
["backName","firstName","lastName","phone","customerEmail"].forEach(id => { $(id).addEventListener("input", () => { updateSummary(); checkFormValid(); saveDraft(); }); });
function checkFormValid() {
  let ok = true, missing = [];
  if (!$("backName").value.trim()) { ok = false; missing.push("ชื่อสกรีน"); }
  if (!$("firstName").value.trim()) { ok = false; missing.push("ชื่อ"); }
  if (!$("lastName").value.trim()) { ok = false; missing.push("นามสกุล"); }
  if (!$("customerEmail").value.includes("@")) { ok = false; missing.push("อีเมล"); }
  if ($("phone").value.replace(/\D/g,"").length < 9) { ok = false; missing.push("เบอร์โทร"); }
  if (!$("classRoom").value) { ok = false; missing.push("ห้องเรียน"); }
  if (!state.slipFile) { ok = false; missing.push("สลิปโอนเงิน"); }
  if (state.slipFile && $("aiToggle").checked && !state.slipAmountMatched) {
    ok = false;
    missing.push(state.slipOCRDone ? "ยอด OCR ไม่ตรง/อ่านไม่ได้" : "รอ OCR ตรวจยอด");
  }
  const btn = $("submitBtn");
  const errMsg = $("errorMsg");
  if (isPhoneDuplicate) {
    errMsg.innerHTML = "<span style='color:#dc3545;font-weight:bold;'>เบอร์นี้เคยสั่งแล้ว! หากต้องการสั่งเพิ่มจริงๆ ให้กดปุ่มยืนยันด้านบน</span>";
  } else {
    errMsg.textContent = ok ? "" : "กรุณาแก้ไข: " + missing.join(", ");
  }
  btn.disabled = !ok;
}

// SUBMIT
$("submitBtn").addEventListener("click", async () => {
  if ($("submitBtn").disabled) return;
  const btn = $("submitBtn");
  btn.classList.add("loading"); btn.disabled = true;
  $("uploadProgress").classList.add("show");
  try {
    let imageUrl = "ไม่ได้แนบรูป";
    if (state.slipFile) {
      const fd = new FormData(); fd.append("image", state.slipFile);
      let imgData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        $("uploadProgressBar").style.width = (attempt * 30) + "%";
        try {
          const r = await fetchWithTimeout(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd }, 30000);
          imgData = await r.json();
          if (imgData && imgData.success) break;
        } catch (err) {
          if (attempt === 3) throw new Error("อัปโหลดสลิปไม่สำเร็จ (ลอง 3 ครั้ง)");
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
      if (!imgData || !imgData.success) throw new Error("อัปโหลดสลิปไม่สำเร็จ");
      imageUrl = imgData.data.url;
      $("uploadProgressBar").style.width = "100%";
    }
    const fullName = $("firstName").value.trim() + " " + $("lastName").value.trim();
    const orderData = {
      fullName, classRoom: $("classRoom").value, phone: $("phone").value.trim(),
      style: state.style, size: state.size, backName: $("backName").value.trim(),
      backNumber: $("backNumber").value.trim(), slipLink: imageUrl,
      slipRef: state.slipRef || "", slipAmount: state.slipAmount,
      expectedAmount: state.price, slipOCR: state.slipOCR || "",
      customerEmail: $("customerEmail").value.trim()
    };
    const response = await fetchWithRetry(GOOGLE_SCRIPT_URL, {
      method: "POST", body: JSON.stringify(orderData),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    }, { retries: 1, ms: 30000 });
    const r = await response.json();
    if (r.status === "error" && r.code === "DUPLICATE_PHONE") throw new Error(r.message);
    if (!r.status || r.status !== "success") throw new Error(r.message || "บันทึกไม่สำเร็จ");

    localStorage.removeItem(DRAFT_KEY);
    $("screen-form").style.display = "none";
    $("screen-success").style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const realId = r.orderId || "CS69-XXXX";
    await drawDigitalTicket(realId, fullName, orderData.backName, orderData.backNumber, orderData.classRoom, orderData.style, orderData.size, state.price);
    state.lastOrderId = realId;
    $("shareRow").style.display = "flex";
  } catch (err) {
    toast(err.message, "error");
    btn.classList.remove("loading"); btn.disabled = false;
  } finally { $("uploadProgress").classList.remove("show"); $("uploadProgressBar").style.width = "0%"; }
});

async function drawDigitalTicket(orderId, name, backName, backNumber, classRoom, style, size, price) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  const canvas = $("ticketCanvas"), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#333"; ctx.lineWidth = 2; ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.font = "bold 150px 'Kanit'"; ctx.textAlign = "center"; ctx.fillText("CS69", canvas.width/2, canvas.height/2 + 50);

  ctx.fillStyle = "#d32f2f"; ctx.font = "bold 44px 'Kanit'"; ctx.fillText("CHIANGSAEN", canvas.width/2, 120);
  ctx.fillStyle = "#ffffff"; ctx.font = "24px 'Sarabun'"; ctx.fillText("OFFICIAL ORDER TICKET", canvas.width/2, 160);
  ctx.fillStyle = "#ffc107"; ctx.font = "bold 32px 'Kanit'"; ctx.fillText(orderId, canvas.width/2, 210);

  ctx.beginPath(); ctx.moveTo(60, 240); ctx.lineTo(canvas.width - 60, 240); ctx.strokeStyle = "#333"; ctx.lineWidth = 2; ctx.stroke();

  ctx.textAlign = "left"; ctx.fillStyle = "#888"; ctx.font = "20px 'Sarabun'";
  ctx.fillText("NAME:", 60, 290); ctx.fillText("CLASS:", 60, 340); ctx.fillText("STYLE:", 60, 390); ctx.fillText("SIZE:", 60, 440); ctx.fillText("BACK NAME:", 60, 490); ctx.fillText("NUMBER:", 60, 540); ctx.fillText("PRICE:", 60, 590);

  ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px 'Kanit'";
  ctx.fillText(name, 220, 290); ctx.fillText(classRoom, 220, 340); ctx.fillText(style, 220, 390); ctx.fillText(size, 220, 440); ctx.fillText(backName, 220, 490);
  ctx.fillStyle = "#d32f2f"; ctx.font = "bold 60px 'Kanit'"; ctx.fillText(backNumber, 220, 560);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 32px 'Kanit'"; ctx.fillText("฿" + price, 220, 610);

  ctx.beginPath(); ctx.arc(canvas.width - 120, 680, 60, 0, Math.PI * 2); ctx.strokeStyle = "#d32f2f"; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = "#d32f2f"; ctx.textAlign = "center"; ctx.font = "bold 16px 'Kanit'"; ctx.fillText("VERIFIED", canvas.width - 120, 675); ctx.fillText("2026", canvas.width - 120, 695);
  $("downloadTicket").href = canvas.toDataURL("image/png");
}

async function shareTicket() {
  const canvas = $("ticketCanvas");
  canvas.toBlob(async blob => {
    const file = new File([blob], "chiangsaen_ticket.png", { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Chiangsaen Ticket", text: "ตั๋ว " + (state.lastOrderId || "") }); } catch (e) {}
    } else {
      const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "chiangsaen_ticket.png"; a.click();
      toast("บันทึกตั๋วแล้ว (เครื่องนี้ไม่รองรับแชร์)", "success");
    }
  });
}
function shareOrderLink(id) {
  const url = window.location.origin + window.location.pathname + "?order=" + encodeURIComponent(id);
  if (navigator.share) navigator.share({ title: "ติดตาม " + id, url }).catch(() => {});
  else copyToClipboard(url, "คัดลอกลิงก์แล้ว");
}
function copyOrderId() { if (state.lastOrderId) copyToClipboard(state.lastOrderId, "คัดลอกรหัสแล้ว"); }
async function copyToClipboard(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg || "คัดลอกแล้ว", "success"); }
  catch (e) { const el = document.createElement("textarea"); el.value = t; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); toast(msg || "คัดลอกแล้ว", "success"); }
}

function resetForm() {
  $("screen-history").style.display = "none";
  ["backName","backNumber","firstName","lastName","phone","classRoom","customerEmail"].forEach(id => $(id).value = "");
  $("numberPreviewBox").style.display = "none"; $("aiScannerBox").style.display = "none";
  state.slipFile = null; state.slipOCR = ""; state.slipRef = "";
  state.slipAmount = null; state.slipAmountMatched = false; state.slipOCRDone = false;
  state.lastOrderId = null;
  state.basePrice = PRICE_RULES.base;
  state.surcharge = 0;
  state.price = PRICE_RULES.base;
  $("slipPreview").style.display = "none"; $("slipPreview").src = "";
  if ($("slipPreview").dataset.objectUrl) { URL.revokeObjectURL($("slipPreview").dataset.objectUrl); delete $("slipPreview").dataset.objectUrl; }
  $("slipText").textContent = "แตะเพื่ออัปโหลดสลิป";
  $("slipDrop").classList.remove("has-file"); $("slipInput").value = "";
  $("submitBtn").classList.remove("loading"); $("submitBtn").textContent = "ยืนยันการสั่งซื้อ"; $("submitBtn").disabled = true;
  $("shareRow").style.display = "none";
  localStorage.removeItem(DRAFT_KEY);
  updateSummary(); checkFormValid(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────── ADMIN ───────────

let adminIdleTimer = null;
function resetAdminIdle() {
  if (adminIdleTimer) clearTimeout(adminIdleTimer);
  adminIdleTimer = setTimeout(() => {
    if ($("adminModal").style.display === "flex" && $("adminOrderBox").style.display === "block") {
      logoutAdmin();
      toast("Session หมดอายุ (ไม่มีการใช้งาน)", "error");
    }
  }, ADMIN_IDLE_MS);
}
["mousemove", "keydown", "click"].forEach(evt => document.addEventListener(evt, () => {
  if ($("adminModal").style.display === "flex" && $("adminOrderBox").style.display === "block") resetAdminIdle();
}));

$("logoSlot").addEventListener("dblclick", async () => {
  $("adminModal").style.display = "flex";
  $("adminPass").value = "";
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) { showAdminLogin(); return; }
  const ok = await verifySession(session);
  if (ok) { showAdminPanel(); } else { localStorage.removeItem(SESSION_KEY); showAdminLogin(); }
});

function showAdminLogin() {
  $("adminLoginBox").style.display = "block";
  $("adminOrderBox").style.display = "none";
  if (adminIdleTimer) { clearTimeout(adminIdleTimer); adminIdleTimer = null; }
}
function showAdminPanel() {
  $("adminLoginBox").style.display = "none";
  $("adminOrderBox").style.display = "block";
  resetAdminIdle();
  switchAdminTab("orders");
  loadAdminOrders();
}
function logoutAdmin() {
  localStorage.removeItem(SESSION_KEY);
  state.adminOrders = [];
  state.adminName = "";
  showAdminLogin();
  toast("ออกจากระบบแล้ว", "success");
}
async function verifySession(session) {
  try {
    const res = await fetchWithTimeout(
      `${GOOGLE_SCRIPT_URL}?action=verify_session&token=${encodeURIComponent(session)}`,
      {}, 10000
    );
    const r = await res.json();
    if (r.status === "success" && r.valid === true) {
      if (r.admin) state.adminName = r.admin;
      return true;
    }
    return false;
  } catch (_) { return false; }
}
function switchAdminTab(tab) {
  const isOrders = tab === "orders";
  $("adminTabOrders").style.display = isOrders ? "block" : "none";
  $("adminTabDashboard").style.display = isOrders ? "none" : "block";
  $("tabBtnOrders").style.background = isOrders ? "var(--brand-red)" : "var(--bg-input)";
  $("tabBtnOrders").style.color = isOrders ? "#fff" : "var(--text-main)";
  $("tabBtnDash").style.background = isOrders ? "var(--bg-input)" : "var(--brand-red)";
  $("tabBtnDash").style.color = isOrders ? "var(--text-main)" : "#fff";
  if (!isOrders) renderDashboard();
  resetAdminIdle();
}

async function loginAdmin() {
  const name = $("adminName").value.trim();
  const pass = $("adminPass").value;
  const btn = $("loginBtn");
  const oldText = btn.textContent;
  btn.textContent = "กำลังตรวจสอบ..."; btn.disabled = true;
  try {
    const response = await fetchWithRetry(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "admin_login", password: pass, adminName: name || "admin" }),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    }, { retries: 1, ms: 15000 });
    const r = await response.json();
    if (r.status === "success" && r.sessionToken) {
      localStorage.setItem(SESSION_KEY, r.sessionToken);
      state.adminName = name || "admin";
      showAdminPanel();
    } else {
      toast(r.message || "รหัสผ่านไม่ถูกต้อง", "error");
    }
  } catch (e) {
    toast("การเชื่อมต่อล้มเหลว: " + e.message, "error");
  } finally {
    btn.textContent = oldText; btn.disabled = false;
  }
}

async function loadAdminOrders() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) { showAdminLogin(); return; }
  $("adminOrderList").innerHTML = "<p style='text-align:center;color:#888;'>กำลังโหลด...</p>";
  try {
    const res = await fetchWithRetry(
      `${GOOGLE_SCRIPT_URL}?action=get_all_orders&token=${encodeURIComponent(session)}`,
      {}, { retries: 2, ms: 20000 }
    );
    const r = await res.json();
    if (r.status === "success") {
      state.adminOrders = r.data || [];
      renderAdminOrders();
      if ($("adminTabDashboard").style.display === "block") renderDashboard();
    } else if (r.code === "UNAUTHORIZED") {
      localStorage.removeItem(SESSION_KEY);
      showAdminLogin();
      toast("Session หมดอายุ กรุณาล็อกอินใหม่", "error");
    } else {
      $("adminOrderList").innerHTML =
        "<p style='text-align:center;color:#dc3545;'>โหลดไม่สำเร็จ: " + (r.message || "ไม่ทราบสาเหตุ") + "</p>";
    }
  } catch (e) {
    $("adminOrderList").innerHTML = "<p style='text-align:center;color:#dc3545;'>เชื่อมต่อไม่ได้: " + e.message + "</p>";
  }
  resetAdminIdle();
}

function renderDashboard() {
  const orders = state.adminOrders.filter(o => o.status !== "ยกเลิก");
  const total = orders.length;
  
  const totalRevenue = orders.reduce((sum, o) => sum + (o.price || PRICE_RULES.base), 0);
  
  const expectedRevenue = totalRevenue; 
  const receivedRevenue = orders.filter(o => o.status === "กำลังผลิต" || o.status === "จัดส่งแล้ว")
                                 .reduce((sum, o) => sum + (o.price || PRICE_RULES.base), 0);
  const pendingRevenue = expectedRevenue - receivedRevenue;

  $("dashTotalOrders").textContent = total;
  $("dashTotalRevenue").textContent = formatTHB(totalRevenue); 
  
  $("dashExpectedRevenue").textContent = formatTHB(expectedRevenue);
  $("dashReceivedRevenue").textContent = formatTHB(receivedRevenue);
  
  if (pendingRevenue > 0) {
    $("dashPendingRevenue").textContent = formatTHB(pendingRevenue) + " (รอตรวจสลิป)";
    $("dashPendingRevenue").style.color = "#dc3545"; 
  } else {
    $("dashPendingRevenue").textContent = "ไม่มีเงินค้าง";
    $("dashPendingRevenue").style.color = "#198754"; 
  }

  const statusCount = { "รอตรวจสอบ": 0, "กำลังผลิต": 0, "จัดส่งแล้ว": 0 };
  orders.forEach(o => { if (statusCount[o.status] !== undefined) statusCount[o.status]++; });
  let sHtml = "";
  ["รอตรวจสอบ", "กำลังผลิต", "จัดส่งแล้ว"].forEach(st => {
    const color = st === "รอตรวจสอบ" ? "#ffc107" : st === "กำลังผลิต" ? "#0d6efd" : "#198754";
    const pct = total > 0 ? (statusCount[st] / total) * 100 : 0;
    sHtml += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
      <span style="color:${color};font-weight:600;">${st}</span><span>${statusCount[st]} รายการ</span></div>
      <div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;margin-bottom:10px;">
      <div style="height:100%;width:${pct}%;background:${color};"></div></div>`;
  });
  $("dashStatusList").innerHTML = sHtml || "<p style='color:#888;font-size:13px;'>ไม่มีข้อมูล</p>";

  const sizeCount = {};
  orders.forEach(o => { const k = o.size || "ไม่ระบุ"; sizeCount[k] = (sizeCount[k] || 0) + 1; });
  const sizeOrder = { "S":1, "M":2, "L":3, "XL":4, "2XL":5 };
  const sizeHtml = Object.keys(sizeCount)
    .sort((a,b) => (sizeOrder[a]||99) - (sizeOrder[b]||99))
    .map(sz => {
      const surcharge = PRICE_RULES.surcharge[sz] ? ` <span style="color:var(--brand-red);font-size:11px;">(+${PRICE_RULES.surcharge[sz]})</span>` : "";
      return `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg-input);border-radius:6px;font-size:13px;margin-bottom:6px;">
        <span>ไซส์ ${sz}${surcharge}</span><span style="font-weight:600;">${sizeCount[sz]} ตัว</span></div>`;
    }).join("");
  $("dashSizeList").innerHTML = sizeHtml || "<p style='color:#888;font-size:13px;'>ไม่มีข้อมูล</p>";

  const classCount = {};
  orders.forEach(o => { const k = o.classRoom || "ไม่ระบุ"; classCount[k] = (classCount[k] || 0) + 1; });
  const classHtml = Object.keys(classCount).sort((a,b) => classCount[b]-classCount[a]).slice(0,5)
    .map(cls => `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg-input);border-radius:6px;font-size:13px;margin-bottom:6px;">
      <span>${cls}</span><span style="font-weight:600;">${classCount[cls]} คน</span></div>`).join("");
  $("dashClassList").innerHTML = classHtml || "<p style='color:#888;font-size:13px;'>ไม่มีข้อมูล</p>";
}

function filterAdminOrders() { renderAdminOrders(); }
function renderAdminOrders() {
  const list = $("adminOrderList");
  const q = ($("adminFilter").value || "").trim().toLowerCase();
  const filtered = state.adminOrders.filter(o => !q ||
    String(o.name || "").toLowerCase().includes(q) ||
    String(o.orderId || "").toLowerCase().includes(q) ||
    String(o.classRoom || "").toLowerCase().includes(q) ||
    String(o.status || "").toLowerCase().includes(q) ||
    String(o.phone || "").toLowerCase().includes(q) ||
    String(o.email || "").toLowerCase().includes(q) ||
    String(o.backName || "").toLowerCase().includes(q) ||
    String(o.backNumber || "").toLowerCase().includes(q));
  if (!filtered.length) { list.innerHTML = "<p style='text-align:center;color:#888;'>ไม่มีรายการ</p>"; return; }
  list.innerHTML = "";
  filtered.forEach(o => {
    let sc = "#888";
    if (o.status === "รอตรวจสอบ") sc = "#ffc107"; if (o.status === "กำลังผลิต") sc = "#0d6efd";
    if (o.status === "จัดส่งแล้ว") sc = "#198754"; if (o.status === "ยกเลิก") sc = "#dc3545";
    const item = document.createElement("div");
    item.style.cssText = "background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:12px;display:flex;gap:12px;";
    
    let imgHTML = "";
    if (o.slipLink === "เงินสด") {
      imgHTML = `<div style="width:60px;height:60px;background:var(--bg-card);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#d97706;border:1px solid var(--border-color);text-align:center;line-height:1.2;">เงินสด</div>`;
    } else if (o.slipLink && o.slipLink.startsWith("http")) {
      imgHTML = `<a href="${o.slipLink}" target="_blank"><img src="${o.slipLink}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);"></a>`;
    } else {
      imgHTML = `<div style="width:60px;height:60px;background:var(--bg-card);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);border:1px solid var(--border-color);">ไม่มีรูป</div>`;
    }

    const safeName = String(o.name || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
    const priceTag = o.price ? ` <span style="color:var(--brand-red);font-weight:700;">฿${o.price}</span>` : "";
    item.innerHTML = `
      ${imgHTML}
      <div style="flex:1;font-size:13px;color:var(--text-main);">
        <div style="font-weight:600;color:var(--brand-red);font-size:14px;margin-bottom:2px;">รหัส: ${o.orderId || 'N/A'}</div>
        <div style="font-weight:600;">${o.name || 'ไม่มีชื่อ'} <span style="color:var(--text-muted);font-weight:400;">(${o.classRoom || '-'})</span>${priceTag}</div>
        <div style="color:var(--text-muted);">โทร: ${o.phone || '-'}</div>
        <div style="color:var(--text-muted);font-size:12px;">อีเมล: ${o.email || 'ไม่มี'}</div>
        <div style="margin-top:4px;">เสื้อ: ${o.style || '-'} / ไซส์ ${o.size || '-'} / สกรีน: ${o.backName || '-'} (${o.backNumber || '-'})</div>
        <div style="margin-top:6px;font-weight:600;color:${sc};">สถานะ: ${o.status}</div>
        <div style="margin-top:6px;padding:8px;border-radius:6px;background:var(--bg-card);font-size:12px;">
          <div style="font-weight:700;margin-bottom:3px;">ผลตรวจสลิป (OCR)</div>
          <div style="color:${String(o.slipReview || "").includes("X ") ? "#dc3545" : "#198754"};">${o.slipReview || "ไม่มีข้อมูลการตรวจสลิป"}</div>
          <div style="color:var(--text-muted);margin-top:3px;">OCR ไม่ใช่หลักฐานยืนยันว่าเงินเข้าบัญชีแล้ว ต้องตรวจสอบธุรกรรมก่อนอนุมัติ</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;justify-content:center;">
        <button style="background:#0d6efd;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;" onclick="updateStatus(${o.rowIndex}, 'กำลังผลิต', '${safeName}')">กำลังผลิต</button>
        <button style="background:#198754;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;" onclick="updateStatus(${o.rowIndex}, 'จัดส่งแล้ว', '${safeName}')">จัดส่งแล้ว</button>
        <button style="background:#dc3545;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;" onclick="updateStatus(${o.rowIndex}, 'ยกเลิก', '${safeName}')">ยกเลิก</button>
      </div>`;
    list.appendChild(item);
  });
}

async function updateStatus(rowIndex, newStatus, customerName) {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) { toast("Session หมดอายุ", "error"); showAdminLogin(); return; }
  const ok = await verifySession(session);
  if (!ok) { localStorage.removeItem(SESSION_KEY); toast("Session หมดอายุ กรุณาล็อกอินใหม่", "error"); showAdminLogin(); return; }

  if (!confirm(`ต้องการเปลี่ยนสถานะเป็น "${newStatus}" ใช่ไหม?`)) return;
  const payload = { action: "update_status", sessionToken: session, rowIndex, newStatus, customerName, adminName: state.adminName || "แอดมิน" };
  try {
    const res = await fetchWithRetry(GOOGLE_SCRIPT_URL, {
      method: "POST", body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    }, { retries: 1, ms: 30000 });
    const r = await res.json();
    if (r.status === "error") {
      if (r.code === "UNAUTHORIZED") {
        localStorage.removeItem(SESSION_KEY);
        toast("Session หมดอายุ กรุณาล็อกอินใหม่", "error");
        showAdminLogin();
      } else { toast(r.message, "error"); }
      return;
    }
    const extra = r.customerNotified ? " (แจ้งเมลลูกค้าแล้ว)" : "";
    toast("อัปเดตสถานะแล้ว" + extra, "success");
    loadAdminOrders();
    resetAdminIdle();
  } catch (e) { toast("การเชื่อมต่อล้มเหลว: " + e.message, "error"); }
}

function exportCSV() {
  if (!state.adminOrders.length) { toast("ไม่มีข้อมูล", "error"); return; }
  const headers = ["Order ID","วันที่","ชื่อ","ห้อง","โทร","อีเมล","รูปแบบ","ไซส์","ชื่อสกรีน","เบอร์","ราคา","สถานะ","สลิป"];
  const rows = state.adminOrders.map(o => [
    o.orderId || "", o.date ? new Date(o.date).toLocaleString("th-TH") : "",
    o.name || "", o.classRoom || "", o.phone || "", o.email || "",
    o.style || "", o.size || "", o.backName || "", o.backNumber || "",
    o.price || "", o.status || "", o.slipLink || ""
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "chiangsaen_orders_" + new Date().toISOString().slice(0,10) + ".csv"; a.click();
  URL.revokeObjectURL(url);
  toast("ดาวน์โหลด CSV แล้ว", "success");
}

async function generateStatsLink() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) { toast("Session หมดอายุ", "error"); return; }
  try {
    const res = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?action=generate_stats_token&token=${encodeURIComponent(session)}`, {}, { retries: 1, ms: 15000 });
    const r = await res.json();
    if (r.status !== "success" || !r.token) { toast("สร้างลิงก์ไม่สำเร็จ: " + (r.message || ""), "error"); return; }
    const url = window.location.origin + window.location.pathname + "?stats=" + encodeURIComponent(r.token);
    await copyToClipboard(url, "คัดลอกลิงก์สถิติแล้ว (แชร์ให้ครูได้)");
  } catch (e) { toast("การเชื่อมต่อล้มเหลว: " + e.message, "error"); }
}

// ─────────── PUBLIC LIST ───────────

async function openPublicList() {
  $("publicListModal").style.display = "flex";
  $("publicListContent").innerHTML = "<p style='text-align:center;color:#888;'>กำลังโหลด...</p>";
  $("publicSearch").value = "";
  try {
    const res = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?action=get_public_list`, {}, { retries: 1, ms: 20000 });
    const r = await res.json();
    if (r.status === "success" && Array.isArray(r.data)) { state.publicOrders = r.data; filterPublicList(); }
    else $("publicListContent").innerHTML = "<p style='text-align:center;color:#dc3545;'>โหลดไม่สำเร็จ</p>";
  } catch (e) { $("publicListContent").innerHTML = "<p style='text-align:center;color:#dc3545;'>โหลดไม่สำเร็จ</p>"; }
}
function filterPublicList() {
  const q = ($("publicSearch").value || "").trim().toLowerCase();
  const list = (state.publicOrders || []).filter(o => !q ||
    String(o.maskedName || "").toLowerCase().includes(q) ||
    String(o.classRoom || "").toLowerCase().includes(q));
  if (!list.length) { $("publicListContent").innerHTML = "<p style='text-align:center;color:#888;'>ไม่พบรายการ</p>"; return; }
  $("publicListContent").innerHTML = list.map(o =>
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);"><span>${o.maskedName} · ${o.classRoom || ""}</span><span style="color:var(--text-muted);font-family:monospace;">${o.orderId || ""}</span></div>`
  ).join("");
}

// ─────────── URL ROUTER ───────────

(async function () {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("order");
  if (id && /^CS69-\d{4}$/i.test(id)) { $("trackPhone").value = id.toUpperCase(); $("trackModal").style.display = "flex"; trackOrder(); }
  const statsToken = p.get("stats");
  if (statsToken) await loadPublicStats(statsToken);
})();

async function loadPublicStats(token) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "publicStatsModal";
  overlay.style.display = "flex";
  overlay.innerHTML = `<div class="modal-content" style="max-width:500px;">
    <h3 style="color:var(--brand-red);">สรุปยอด Chiangsaen system</h3>
    <div id="publicStatsBody"><p style="text-align:center;color:#888;">กำลังโหลด...</p></div>
    <button style="background:transparent;border:none;color:var(--text-muted);width:100%;margin-top:16px;cursor:pointer;text-decoration:underline;" onclick="this.closest('.modal-overlay').remove()">ปิดหน้าต่าง</button>
  </div>`;
  document.body.appendChild(overlay);
  try {
    const res = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?action=get_stats&token=${encodeURIComponent(token)}`, {}, { retries: 1, ms: 15000 });
    const r = await res.json();
    if (r.status !== "success" || !r.data) throw new Error("โหลดไม่สำเร็จ");
    const s = r.data;
    const statusRows = Object.keys(s.byStatus).map(k =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${k}</span><span style="font-weight:600;">${s.byStatus[k]}</span></div>`
    ).join("");
    const sizeRows = Object.keys(s.bySize).map(k =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>ไซส์ ${k}</span><span style="font-weight:600;">${s.bySize[k]} ตัว</span></div>`
    ).join("");
    const classRows = Object.keys(s.byClass).sort((a,b) => s.byClass[b]-s.byClass[a]).slice(0,5).map(k =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${k}</span><span style="font-weight:600;">${s.byClass[k]} คน</span></div>`
    ).join("");
    $("publicStatsBody").innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:12px;color:var(--text-muted);">ออเดอร์</div>
          <div style="font-size:24px;font-weight:700;">${s.total}</div>
        </div>
        <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:12px;color:var(--text-muted);">ยอดเงิน</div>
          <div style="font-size:24px;font-weight:700;color:#28a745;">${formatTHB(s.revenue)}</div>
        </div>
      </div>
      <h4 style="font-size:14px;margin:12px 0 6px;">ตามสถานะ</h4>${statusRows}
      <h4 style="font-size:14px;margin:12px 0 6px;">ตามไซส์</h4>${sizeRows}
      <h4 style="font-size:14px;margin:12px 0 6px;">Top 5 ห้องเรียน</h4>${classRows}`;
  } catch (e) {
    $("publicStatsBody").innerHTML = "<p style='text-align:center;color:#dc3545;'>ลิงก์หมดอายุหรือไม่ถูกต้อง</p>";
  }
}

// ─────────── COUNTDOWN TIMER ───────────
const targetPresale = new Date(2026, 10, 14, 0, 0, 0).getTime(); 
const targetSports  = new Date(2026, 11, 21, 8, 0, 0).getTime(); 

function updateCountdowns() {
  const now = new Date().getTime();

  const distPre = targetPresale - now;
  if (distPre < 0) {
    $("cdPresale").textContent = "เปิดแล้ว";
    $("cdPresale").style.color = "#198754";
  } else {
    const d = Math.floor(distPre / (1000 * 60 * 60 * 24));
    const h = Math.floor((distPre % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((distPre % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((distPre % (1000 * 60)) / 1000);
    $("cdPresale").textContent = `${d} วัน ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const distSports = targetSports - now;
  if (distSports < 0) {
    $("cdSports").textContent = "ถึงวันแล้ว";
    $("cdSports").style.color = "#198754";
  } else {
    const d = Math.floor(distSports / (1000 * 60 * 60 * 24));
    const h = Math.floor((distSports % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((distSports % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((distSports % (1000 * 60)) / 1000);
    $("cdSports").textContent = `${d} วัน ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
setInterval(updateCountdowns, 1000);
updateCountdowns();

updateSummary(); checkFormValid();