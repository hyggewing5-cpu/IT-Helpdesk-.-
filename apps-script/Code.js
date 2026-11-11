/********************************************************************
 * ระบบแจ้งซ่อมงานสารสนเทศ รพ.กองบิน บน.5 (รองรับแนบรูปภาพ + สรุปประจำวัน)
 * Google Apps Script Web App + Google Sheets + Telegram
 * ผู้พัฒนา : พ.อ.อ.วีรพจน์ ยิ้มเยาะ  สมนส.ฝูง.501 บน.5  โทร.6-0449
 ********************************************************************/

const CONFIG = {
  ORG_NAME: 'สารสนเทศ รพ.กองบิน บน.5',
  SYSTEM_NAME: 'ระบบแจ้งซ่อมงานสารสนเทศ (IT Helpdesk)',
  LOGO_FILE_ID: '1cDgXeobqDuwGD2WtMKu9hNm1qFAmxgK_',
  DEV_NAME: 'พ.อ.อ.วีรพจน์ ยิ้มเยาะ',
  DEV_POSITION: 'สมนส.ฝูง.501 บน.5',
  DEV_PHONE: '6-0449',
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  LOGIN_MAX_FAILS: 5,
  LOGIN_LOCK_SECONDS: 900,
  TZ: 'Asia/Bangkok',
  SESSION_SECONDS: 21600,
  CATEGORIES: ['คอมพิวเตอร์/โน้ตบุ๊ก', 'เครื่องพิมพ์/สแกนเนอร์', 'ระบบเครือข่าย/อินเทอร์เน็ต',
    'ระบบ HIS/โปรแกรมโรงพยาบาล', 'อีเมล/บัญชีผู้ใช้', 'โทรศัพท์/อุปกรณ์สื่อสาร', 'กล้องวงจรปิด', 'อื่นๆ'],
  PRIORITIES: ['วิกฤต', 'สูง', 'ปกติ', 'ต่ำ'],
  SLA_HOURS: { 'วิกฤต': 4, 'สูง': 8, 'ปกติ': 24, 'ต่ำ': 72 },
  STATUSES: ['งานใหม่', 'รับงานแล้ว', 'กำลังดำเนินการ', 'รอข้อมูล/รออะไหล่', 'ส่งซ่อมภายนอก', 'ดำเนินการเรียบร้อย', 'ยกเลิก'],
  METHODS: ['ดำเนินการเอง', 'ส่งซ่อมภายนอก', 'ประสานบริษัท/ผู้ขาย', 'อื่นๆ'],
  NEW: 'งานใหม่', DONE: 'ดำเนินการเรียบร้อย', CANCEL: 'ยกเลิก'
};

const SHEETS = {
  TICKETS: { name: 'Tickets', headers: ['ticketId', 'createdAt', 'reporterName', 'department', 'room', 'phone', 'category', 'assetCode', 'detail', 'priority', 'status', 'assignee', 'method', 'acceptedAt', 'closedAt', 'resolution', 'updatedAt', 'updatedBy', 'imageUrl'] },
  LOGS: { name: 'WorkLogs', headers: ['logId', 'ticketId', 'createdAt', 'actor', 'action', 'detail', 'fixList', 'method', 'statusAfter'] },
  USERS: { name: 'Users', headers: ['username', 'salt', 'passwordHash', 'displayName', 'role', 'active', 'createdAt', 'lastLogin'] }
};
const DATE_COLS = ['createdAt', 'acceptedAt', 'closedAt', 'updatedAt', 'lastLogin'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/* ======================= WEB APP ======================= */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page === 'admin') ? 'Admin' : 'Index';
  const t = HtmlService.createTemplateFromFile(page);
  t.cfg = publicConfig_();
  return t.evaluate()
    .setTitle(CONFIG.SYSTEM_NAME + ' | ' + CONFIG.ORG_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function publicConfig_() {
  return {
    ORG_NAME: CONFIG.ORG_NAME, SYSTEM_NAME: CONFIG.SYSTEM_NAME,
    LOGO_URL: 'https://drive.google.com/thumbnail?id=' + CONFIG.LOGO_FILE_ID + '&sz=w400',
    DEV_NAME: CONFIG.DEV_NAME, DEV_POSITION: CONFIG.DEV_POSITION, DEV_PHONE: CONFIG.DEV_PHONE,
    CATEGORIES: CONFIG.CATEGORIES, PRIORITIES: CONFIG.PRIORITIES, STATUSES: CONFIG.STATUSES,
    METHODS: CONFIG.METHODS, NEW: CONFIG.NEW, DONE: CONFIG.DONE, CANCEL: CONFIG.CANCEL,
    APP_URL: ScriptApp.getService().getUrl()
  };
}

/* ======================= SETUP ======================= */
function setup() {
  ownerOnly_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID')) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active) throw new Error('กรุณาสร้างสคริปต์จาก Google Sheet');
    props.setProperty('SPREADSHEET_ID', active.getId());
  }
  Object.keys(SHEETS).forEach(k => sheet_(SHEETS[k]));
  if (!readAll_(SHEETS.USERS).length) {
    const pw = randomPassword_();
    createUser_('admin', pw, 'ผู้ดูแลระบบ', 'admin', true);
    Logger.log('สร้างบัญชี admin แล้ว | รหัสผ่านชั่วคราว: ' + pw + ' | กรุณาเข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านทันที');
  }
  const tp = props.getProperties();
  if (!tp.TELEGRAM_BOT_TOKEN || !tp.TELEGRAM_CHAT_ID) Logger.log('หมายเหตุ: ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID ใน Script Properties (ข้ามได้ถ้าไม่ใช้ Telegram)');
  Logger.log('ติดตั้งระบบเรียบร้อย');
}

function testTelegram() {
  ownerOnly_();
  Logger.log(tg_('✅ <b>ทดสอบการแจ้งเตือน</b>\n' + esc_(CONFIG.SYSTEM_NAME)));
}

function ownerOnly_() {
  const a = Session.getActiveUser().getEmail();
  if (!a || a !== Session.getEffectiveUser().getEmail()) throw new Error('รันได้จาก Editor โดยเจ้าของสคริปต์เท่านั้น');
}

function randomPassword_() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#%+=';
  const u = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let out = '';
  for (let i = 0; i < 14; i++) out += chars.charAt(parseInt(u.substr(i * 2, 2), 16) % chars.length);
  return out;
}

/* ======================= สรุปประจำวัน (Trigger) ======================= */
function installDailySummaryTrigger() {
  ownerOnly_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDailySummary').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(16).nearMinute(30).inTimezone(CONFIG.TZ).create();
  Logger.log('ตั้งเวลาส่งสรุปประจำวัน 16:30 น. เรียบร้อย');
}

function sendDailySummary() {
  const cache = CacheService.getScriptCache();
  if (cache.get('sum_sent')) return;
  cache.put('sum_sent', '1', 1800);
  const today = dk_(new Date());
  const all = readAll_(SHEETS.TICKETS);
  const open = all.filter(isOpen_);
  tg_('📊 <b>สรุปงานประจำวัน ' + thKey_(today) + '</b>\n' +
    '• แจ้งใหม่วันนี้: ' + all.filter(t => dk_(t.createdAt) === today).length + ' งาน\n' +
    '• ปิดงานวันนี้: ' + all.filter(t => t.status === CONFIG.DONE && dk_(t.closedAt) === today).length + ' งาน\n' +
    '• งานค้างทั้งหมด: ' + open.length + ' งาน\n' +
    '• เกินกำหนด SLA: ' + open.filter(isOverdue_).length + ' งาน' + adminLink_());
}

function thKey_(k) {
  const p = k.split('-');
  return p[2] + '/' + p[1] + '/' + (Number(p[0]) + 543);
}

/* ======================= DRIVE UPLOAD ======================= */
function getUploadFolder_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('UPLOAD_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const folders = DriveApp.getFoldersByName('IT_Helpdesk_Images');
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('IT_Helpdesk_Images');
  props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  return folder;
}

const IMAGE_EXT_ = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_ERR_ = 'รูปภาพต้องเป็นไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB';

function sniffImage_(b) {
  if (!b || b.length < 12) return '';
  const x = i => (b[i] & 255);
  if (x(0) === 0xFF && x(1) === 0xD8 && x(2) === 0xFF) return 'image/jpeg';
  if (x(0) === 0x89 && x(1) === 0x50 && x(2) === 0x4E && x(3) === 0x47) return 'image/png';
  if (x(0) === 0x52 && x(1) === 0x49 && x(2) === 0x46 && x(3) === 0x46 && x(8) === 0x57 && x(9) === 0x45 && x(10) === 0x42 && x(11) === 0x50) return 'image/webp';
  return '';
}

function checkImage_(base64Data) {
  const str = String(base64Data);
  if (str.length > CONFIG.MAX_IMAGE_BYTES * 1.4) throw new Error(IMAGE_ERR_);
  let bytes;
  try { bytes = Utilities.base64Decode(str); } catch (e) { throw new Error(IMAGE_ERR_); }
  if (!bytes.length || bytes.length > CONFIG.MAX_IMAGE_BYTES) throw new Error(IMAGE_ERR_);
  const type = sniffImage_(bytes);
  if (!type) throw new Error(IMAGE_ERR_);
  return { bytes: bytes, type: type };
}

function saveImage_(base64Data) {
  if (!base64Data) return '';
  const img = checkImage_(base64Data);   // ไม่ผ่าน = แจ้งข้อผิดพลาดให้ผู้ใช้ทราบ
  try {
    const name = 'issue_' + fmt_(new Date(), 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 6) + '.' + IMAGE_EXT_[img.type];
    const file = getUploadFolder_().createFile(Utilities.newBlob(img.bytes, img.type, name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  } catch (e) {
    console.error('Upload image error: ' + e);
    return '';
  }
}

/* ======================= SHEET HELPERS ======================= */
let _ss = null;
function ss_() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}

function sheet_(def) {
  const ss = ss_();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(def) {
  const v = sheet_(def).getDataRange().getValues();
  const h = v.shift() || [];
  return v.map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((k, j) => o[k] = r[j]);
    return o;
  }).filter(o => o[h[0]] !== '');
}

function safe_(v) {
  if (v === null || v === undefined) return '';
  return (typeof v === 'string' && v !== '') ? "'" + v : v;
}
function rowFrom_(def, obj) { return def.headers.map(h => safe_(obj[h])); }
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }

function clean_(v, max) { return String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max || 500); }
function digits_(s) { return String(s || '').replace(/\D/g, ''); }
function esc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt_(d, p) { return Utilities.formatDate(d, CONFIG.TZ, p); }
function dk_(d) { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : fmt_(x, 'yyyy-MM-dd'); }
function th_(d) { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : fmt_(x, 'dd/MM/') + (Number(fmt_(x, 'yyyy')) + 543) + fmt_(x, ' HH:mm'); }
function parseDate_(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; }
function hex_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function hash_(pw, salt) { let h = String(pw); for (let i = 0; i < 300; i++) h = hex_(salt + '|' + h); return h; }

function isOpen_(t) { return t.status !== CONFIG.DONE && t.status !== CONFIG.CANCEL; }
function isOverdue_(t) { return isOpen_(t) && t.createdAt ? (Date.now() - new Date(t.createdAt).getTime()) / 36e5 > (CONFIG.SLA_HOURS[t.priority] || 24) : false; }
function pub_(t) {
  return {
    ticketId: String(t.ticketId), createdAt: th_(t.createdAt), reporterName: t.reporterName, department: t.department,
    room: t.room, phone: String(t.phone), category: t.category, assetCode: t.assetCode, detail: t.detail,
    priority: t.priority, status: t.status, assignee: t.assignee, method: t.method,
    acceptedAt: th_(t.acceptedAt), closedAt: th_(t.closedAt), resolution: t.resolution,
    updatedAt: th_(t.updatedAt), updatedBy: t.updatedBy, imageUrl: t.imageUrl || '', overdue: isOverdue_(t)
  };
}
function findTicket_(id) { return readAll_(SHEETS.TICKETS).find(t => String(t.ticketId) === String(id)); }
function setFields_(row, obj) {
  const sh = sheet_(SHEETS.TICKETS), H = SHEETS.TICKETS.headers;
  const cur = sh.getRange(row, 1, 1, H.length).getValues()[0];
  Object.keys(obj).forEach(k => { const i = H.indexOf(k); if (i >= 0) cur[i] = obj[k]; });
  sh.getRange(row, 1, 1, H.length).setValues([cur.map(safe_)]);
}
function addLog_(ticketId, actor, action, detail, fixList, method, statusAfter) {
  sheet_(SHEETS.LOGS).appendRow(rowFrom_(SHEETS.LOGS, {
    logId: Utilities.getUuid().slice(0, 8), ticketId: ticketId, createdAt: new Date(), actor: actor,
    action: action, detail: detail || '', fixList: fixList || '', method: method || '', statusAfter: statusAfter || ''
  }));
}
function newTicketId_(sh) {
  const n = new Date();
  const prefix = 'IT' + String((Number(fmt_(n, 'yyyy')) + 543) % 100).padStart(2, '0') + fmt_(n, 'MMdd') + '-';
  const last = sh.getLastRow(); let max = 0;
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(r => {
      const s = String(r[0]); if (s.indexOf(prefix) === 0) max = Math.max(max, Number(s.slice(prefix.length)) || 0);
    });
  }
  return prefix + String(max + 1).padStart(3, '0');
}

/* ======================= PUBLIC API ======================= */
function submitTicket(f) {
  f = f || {};
  if (f.website) throw new Error('ข้อมูลไม่ถูกต้อง');
  const d = {
    reporterName: clean_(f.reporterName, 100), department: clean_(f.department, 100), room: clean_(f.room, 100),
    phone: clean_(f.phone, 30), category: clean_(f.category, 100), assetCode: clean_(f.assetCode, 50),
    detail: clean_(f.detail, 2000), priority: clean_(f.priority, 20)
  };
  if (!d.reporterName || !d.room || !d.phone || !d.detail) throw new Error('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ');
  if (CONFIG.PRIORITIES.indexOf(d.priority) < 0) d.priority = 'ปกติ';
  if (CONFIG.CATEGORIES.indexOf(d.category) < 0) d.category = 'อื่นๆ';

  let imageUrl = '';
  if (f.imageFile) imageUrl = saveImage_(f.imageFile);

  const id = withLock_(() => {
    const sh = sheet_(SHEETS.TICKETS);
    const newId = newTicketId_(sh), n = new Date();
    sh.appendRow(rowFrom_(SHEETS.TICKETS, Object.assign({}, d, {
      ticketId: newId, createdAt: n, status: CONFIG.NEW, updatedAt: n, updatedBy: 'ผู้แจ้ง', imageUrl: imageUrl
    })));
    addLog_(newId, d.reporterName + ' (ผู้แจ้ง)', 'แจ้งซ่อม', '', '', '', CONFIG.NEW);
    return newId;
  });

  const icon = { 'วิกฤต': '🔴', 'สูง': '🟠', 'ปกติ': '🔵', 'ต่ำ': '🟢' }[d.priority] || '🔵';
  tg_('🛠️ <b>แจ้งซ่อมใหม่ ' + esc_(id) + '</b>\n' +
    icon + ' ความเร่งด่วน: <b>' + esc_(d.priority) + '</b>\n' +
    '👤 ผู้แจ้ง: ' + esc_(d.reporterName) + (d.department ? ' (' + esc_(d.department) + ')' : '') + '\n' +
    '📍 สถานที่: ' + esc_(d.room) + '\n' +
    '📞 ติดต่อ: ' + esc_(d.phone) + '\n' +
    '🧩 ประเภท: ' + esc_(d.category) + (d.assetCode ? ' / ' + esc_(d.assetCode) : '') + '\n' +
    '📝 ' + esc_(d.detail.slice(0, 300)) + (imageUrl ? '\n🖼️ มีรูปถ่ายแนบ' : '') + '\n' +
    '🕒 ' + th_(new Date()) + adminLink_());
  return { ticketId: id };
}

function trackTicket(ticketId, phone) {
  ticketId = clean_(ticketId, 30).toUpperCase(); const p = digits_(phone);
  if (!ticketId || p.length < 4) throw new Error('กรุณากรอกเลขที่ใบแจ้งและหมายเลขติดต่อ');
  const cache = CacheService.getScriptCache(), key = 'trk_' + hex_(ticketId).slice(0, 32);
  const fails = Number(cache.get(key) || 0);
  if (fails >= 10) throw new Error('ค้นหาผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่');
  const t = findTicket_(ticketId);
  if (!t || digits_(t.phone) !== p) { cache.put(key, String(fails + 1), 600); throw new Error('ไม่พบข้อมูล กรุณาตรวจสอบเลขที่และเบอร์ติดต่อ'); }
  const logs = readAll_(SHEETS.LOGS).filter(l => String(l.ticketId) === String(t.ticketId)).map(l => ({
    createdAt: th_(l.createdAt), action: l.action, statusAfter: l.statusAfter,
    actor: l.action === 'แจ้งซ่อม' ? 'ผู้แจ้ง' : 'เจ้าหน้าที่ IT'
  }));
  return Object.assign({}, pub_(t), { logs: logs });
}

/* ======================= AUTH ======================= */
function isActive_(u) { return u.active === true || String(u.active).toUpperCase() === 'TRUE'; }
function createUser_(username, pw, displayName, role, active) {
  const salt = Utilities.getUuid();
  sheet_(SHEETS.USERS).appendRow(rowFrom_(SHEETS.USERS, {
    username: username, salt: salt, passwordHash: hash_(pw, salt), displayName: displayName,
    role: role, active: active !== false, createdAt: new Date(), lastLogin: ''
  }));
}
function login(username, password) {
  username = clean_(username, 30).toLowerCase();
  const cache = CacheService.getScriptCache(), failKey = 'fail_' + hex_(username).slice(0, 32);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CONFIG.LOGIN_MAX_FAILS) throw new Error('ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ ' + Math.round(CONFIG.LOGIN_LOCK_SECONDS / 60) + ' นาทีแล้วลองใหม่');
  const u = readAll_(SHEETS.USERS).find(x => String(x.username).toLowerCase() === username && isActive_(x));
  if (!u || hash_(String(password || ''), u.salt) !== u.passwordHash) {
    cache.put(failKey, String(fails + 1), CONFIG.LOGIN_LOCK_SECONDS);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  cache.remove(failKey);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const session = { username: String(u.username), displayName: String(u.displayName), role: String(u.role) };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), CONFIG.SESSION_SECONDS);
  sheet_(SHEETS.USERS).getRange(u._row, SHEETS.USERS.headers.indexOf('lastLogin') + 1).setValue(new Date());
  return { token: token, user: session };
}
function auth_(token, needAdmin) {
  const s = token ? CacheService.getScriptCache().get('sess_' + token) : null;
  if (!s) throw new Error('SESSION_EXPIRED');
  const u = JSON.parse(s);
  if (needAdmin && u.role !== 'admin') throw new Error('คุณไม่มีสิทธิ์ใช้งานส่วนนี้');
  return u;
}
function logout(token) { CacheService.getScriptCache().remove('sess_' + token); return true; }
function technicians_() { return readAll_(SHEETS.USERS).filter(isActive_).map(u => String(u.displayName)); }
function getBootstrap(token) { return { user: auth_(token), technicians: technicians_() }; }

/* ======================= ADMIN ======================= */
function getDashboard(token) {
  auth_(token); const all = readAll_(SHEETS.TICKETS);
  const todayKey = dk_(new Date()), monthKey = todayKey.slice(0, 7);
  const byStatus = {}, byPriority = {};
  CONFIG.STATUSES.forEach(s => byStatus[s] = 0); CONFIG.PRIORITIES.forEach(p => byPriority[p] = 0);
  let today = 0, month = 0, open = 0, overdue = 0;
  all.forEach(t => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const k = dk_(t.createdAt);
    if (k === todayKey) today++; if (k.slice(0, 7) === monthKey) month++;
    if (isOpen_(t)) { open++; byPriority[t.priority] = (byPriority[t.priority] || 0) + 1; if (isOverdue_(t)) overdue++; }
  });
  return { total: all.length, today: today, month: month, open: open, overdue: overdue, byStatus: byStatus, byPriority: byPriority, todayKey: todayKey, monthStart: monthKey + '-01', urgent: all.filter(isOpen_).sort((a,b)=>(CONFIG.PRIORITIES.indexOf(a.priority)-CONFIG.PRIORITIES.indexOf(b.priority))||(new Date(a.createdAt)-new Date(b.createdAt))).slice(0,15).map(pub_) };
}

function listTickets(token, f) {
  auth_(token); f = f || {}; let rows = readAll_(SHEETS.TICKETS);
  if (f.status === 'OPEN') rows = rows.filter(isOpen_);
  else if (f.status === 'OVERDUE') rows = rows.filter(isOverdue_);
  else if (f.status) rows = rows.filter(t => t.status === f.status);
  if (f.priority) rows = rows.filter(t => t.priority === f.priority);
  if (f.assignee) rows = rows.filter(t => t.assignee === f.assignee);
  if (f.from) rows = rows.filter(t => dk_(t.createdAt) >= f.from);
  if (f.to) rows = rows.filter(t => dk_(t.createdAt) <= f.to);
  if (f.q) { const q = String(f.q).toLowerCase(); rows = rows.filter(t => [t.ticketId, t.reporterName, t.department, t.room, t.phone, t.category, t.assetCode, t.detail].join(' ').toLowerCase().indexOf(q) >= 0); }
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { total: rows.length, rows: rows.slice(0, 300).map(pub_) };
}

function getTicket(token, id) {
  auth_(token); const t = findTicket_(id); if (!t) throw new Error('ไม่พบใบงาน ' + id);
  const logs = readAll_(SHEETS.LOGS).filter(l => String(l.ticketId) === String(t.ticketId)).map(l => ({
    createdAt: th_(l.createdAt), actor: l.actor, action: l.action, detail: l.detail,
    fixList: l.fixList, method: l.method, statusAfter: l.statusAfter
  }));
  return { ticket: pub_(t), logs: logs };
}

function acceptTicket(token, id) {
  const u = auth_(token);
  withLock_(() => {
    const t = findTicket_(id); if (!t || !isOpen_(t)) throw new Error('ไม่พบใบงานหรือปิดแล้ว');
    const n = new Date();
    setFields_(t._row, { assignee: u.displayName, status: 'รับงานแล้ว', acceptedAt: t.acceptedAt || n, updatedAt: n, updatedBy: u.displayName });
    addLog_(t.ticketId, u.displayName, 'รับงาน', '', '', '', 'รับงานแล้ว');
    tg_('📥 <b>รับงาน ' + esc_(t.ticketId) + '</b>\nผู้รับงาน: ' + esc_(u.displayName) + '\nสถานที่: ' + esc_(t.room));
  });
  return getTicket(token, id);
}

function updateTicket(token, p) {
  const u = auth_(token); p = p || {};
  withLock_(() => {
    const t = findTicket_(p.ticketId); if (!t) throw new Error('ไม่พบใบงาน');
    const n = new Date(), upd = {}, changes = [];
    const status = CONFIG.STATUSES.indexOf(p.status) >= 0 ? p.status : t.status;
    const priority = CONFIG.PRIORITIES.indexOf(p.priority) >= 0 ? p.priority : t.priority;
    const assignee = clean_(p.assignee, 100), method = clean_(p.method, 50), actor = clean_(p.actor, 100) || u.displayName;
    const detail = clean_(p.detail, 2000), fix = clean_(p.fixList, 2000), resolution = clean_(p.resolution, 2000);

    if (status !== t.status) { upd.status = status; changes.push('สถานะ: ' + t.status + ' → ' + status); }
    if (priority !== t.priority) { upd.priority = priority; changes.push('ความเร่งด่วน: ' + t.priority + ' → ' + priority); }
    if (assignee !== String(t.assignee || '')) { upd.assignee = assignee; changes.push('ผู้รับผิดชอบ: ' + (assignee || '-')); }
    if (method && method !== String(t.method || '')) { upd.method = method; changes.push('รูปแบบ: ' + method); }
    if (resolution && resolution !== String(t.resolution || '')) upd.resolution = resolution;

    const closing = status === CONFIG.DONE || status === CONFIG.CANCEL;
    if (status === CONFIG.DONE && !resolution && !t.resolution) throw new Error('กรุณาระบุสรุปผลการแก้ไขก่อนปิดงาน');
    if (closing && !t.closedAt) upd.closedAt = n;
    if (!closing && t.closedAt) upd.closedAt = '';
    if (!t.acceptedAt && status !== CONFIG.NEW) upd.acceptedAt = n;

    if (!Object.keys(upd).length && !detail && !fix) throw new Error('ไม่มีข้อมูลที่เปลี่ยนแปลง');
    upd.updatedAt = n; upd.updatedBy = u.displayName;
    setFields_(t._row, upd);
    addLog_(t.ticketId, actor, changes.length ? changes.join(' | ') : 'บันทึกการดำเนินงาน', detail, fix, method || t.method, status);

    if (upd.status) {
      const icon = status === CONFIG.DONE ? '✅' : status === CONFIG.CANCEL ? '⛔' : '🔄';
      tg_(icon + ' <b>อัปเดตงาน ' + esc_(t.ticketId) + '</b>\nสถานะ: <b>' + esc_(status) + '</b>\nผู้ดำเนินการ: ' + esc_(actor) + (resolution ? '\nผล: ' + esc_(resolution.slice(0,200)) : '') + adminLink_());
    }
  });
  return getTicket(token, p.ticketId);
}

function getReport(token, opt) {
  auth_(token); opt = opt || {}; const all = readAll_(SHEETS.TICKETS);
  const type = opt.type === 'monthly' ? 'monthly' : 'daily';
  const keys = []; let keyOf, labelOf, title;
  if (type === 'monthly') {
    const y = Number(opt.year) || new Date().getFullYear();
    for (let m = 1; m <= 12; m++) keys.push(y + '-' + ('0' + m).slice(-2));
    keyOf = t => dk_(t.createdAt).slice(0, 7);
    labelOf = k => TH_MONTHS[Number(k.slice(5, 7)) - 1] + ' ' + (Number(k.slice(0, 4)) + 543);
    title = 'รายงานสรุปผลการปฏิบัติงานรายเดือน ประจำปี พ.ศ. ' + (y + 543);
  } else {
    const from = parseDate_(opt.from) || parseDate_(dk_(new Date()));
    const to = parseDate_(opt.to) || parseDate_(dk_(new Date()));
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) keys.push(dk_(d));
    keyOf = t => dk_(t.createdAt);
    labelOf = k => k.split('-')[2] + '/' + k.split('-')[1] + '/' + (Number(k.split('-')[0]) + 543);
    title = 'รายงานสรุปผลการปฏิบัติงานรายวัน';
  }
  const inRange = {}; keys.forEach(k => inRange[k] = true);
  const rows = all.filter(t => inRange[keyOf(t)]);
  const table = keys.map(k => {
    const r = rows.filter(t => keyOf(t) === k);
    return { key: k, label: labelOf(k), total: r.length, done: r.filter(t => t.status === CONFIG.DONE).length, cancel: r.filter(t => t.status === CONFIG.CANCEL).length, open: r.filter(isOpen_).length };
  });
  const group = f => { const m = {}; rows.forEach(t => { const k = t[f] || 'ไม่ระบุ'; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map(k => ({ name: k, count: m[k] })).sort((a,b)=>b.count-a.count); };
  const done = rows.filter(t => t.status === CONFIG.DONE);
  return {
    type: type, title: title, table: table,
    summary: { total: rows.length, done: done.length, cancel: rows.filter(t => t.status === CONFIG.CANCEL).length, open: rows.filter(isOpen_).length, overdue: rows.filter(isOverdue_).length, rate: rows.length ? Math.round(done.length * 100 / rows.length) : 0 },
    byCategory: group('category'), byPriority: group('priority'), byStatus: group('status'), byAssignee: group('assignee'), byMethod: group('method'), byDepartment: group('department'),
    details: rows.slice(0, 500).map(pub_)
  };
}

function listUsers(token) { auth_(token, true); return readAll_(SHEETS.USERS).map(u => ({ username: String(u.username), displayName: String(u.displayName), role: String(u.role), active: isActive_(u), lastLogin: th_(u.lastLogin) })); }
function saveUser(token, p) {
  const me = auth_(token, true); p = p || {};
  const username = clean_(p.username, 30).toLowerCase();
  if (!/^[a-z0-9]{3,30}$/.test(username)) throw new Error('ชื่อผู้ใช้ต้องเป็น a-z หรือ 0-9 ความยาว 3-30 ตัว');
  const displayName = clean_(p.displayName, 100) || username;
  const role = p.role === 'admin' ? 'admin' : 'staff';
  const active = p.active === true || p.active === 'true' || p.active === 'on';
  const pw = String(p.password || '');
  if (pw && pw.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
  if (username === me.username && (role !== 'admin' || !active)) throw new Error('ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้');
  withLock_(() => {
    const H = SHEETS.USERS.headers, u = readAll_(SHEETS.USERS).find(x => String(x.username).toLowerCase() === username);
    if (!u) {
      if (!pw) throw new Error('กรุณากำหนดรหัสผ่านอย่างน้อย 8 ตัวสำหรับผู้ใช้ใหม่');
      createUser_(username, pw, displayName, role, active); return;
    }
    const row = [u.username, u.salt, u.passwordHash, displayName, role, active, u.createdAt, u.lastLogin];
    if (pw) { row[1] = Utilities.getUuid(); row[2] = hash_(pw, row[1]); }
    sheet_(SHEETS.USERS).getRange(u._row, 1, 1, H.length).setValues([row.map(safe_)]);
  });
  return listUsers(token);
}
function changePassword(token, oldPw, newPw) {
  const me = auth_(token);
  if (String(newPw || '').length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
  withLock_(() => {
    const u = readAll_(SHEETS.USERS).find(x => String(x.username) === me.username);
    if (!u || hash_(String(oldPw || ''), u.salt) !== u.passwordHash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    const salt = Utilities.getUuid();
    sheet_(SHEETS.USERS).getRange(u._row, 2, 1, 2).setValues([[safe_(salt), safe_(hash_(newPw, salt))]]);
  });
  return true;
}

function adminLink_() { const url = ScriptApp.getService().getUrl(); return url ? '\n🔗 <a href="' + url + '?page=admin">เปิดระบบหลังบ้าน</a>' : ''; }
function tg_(text) {
  const p = PropertiesService.getScriptProperties(), token = p.getProperty('TELEGRAM_BOT_TOKEN'), chat = p.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
  } catch (e) {}
}