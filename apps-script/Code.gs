const TIME_ZONE = "America/Argentina/Buenos_Aires";
const TURNOS_SHEET = "Turnos";
const CONFIG_SHEET = "Horarios";
const BLOCKS_SHEET = "Bloqueos";
const BUSINESS_SHEET = "Negocio";
const SERVICES_SHEET = "Servicios";
let BOOK_CACHE_ = null;

function doGet() {
  return json_({ ok: true, service: "Ctrl Turnos - AREA" });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    requireSecret_(payload.secret);
    switch (payload.action) {
      case "slots": return json_({ ok: true, slots: listSlots_(payload.from, payload.to, payload.duration) });
      case "config": return json_({ ok: true, business: getBusiness_(), services: getServices_() });
      case "create": return json_({ ok: true, booking: createBooking_(payload.booking || {}) });
      case "get": return json_({ ok: true, booking: getBooking_(payload.token) });
      case "lookup": return json_({ ok: true, bookings: lookupBookings_(payload.email, payload.whatsapp) });
      case "cancel": return json_({ ok: true, booking: cancelBooking_(payload.token) });
      case "reschedule": return json_({ ok: true, booking: rescheduleBooking_(payload.token, payload.date, payload.time) });
      case "adminOverview": return json_({ ok: true, schedule: getSchedule_(), blockedDates: blockedDates_(), bookings: adminBookings_(), business: getBusiness_(), services: getServices_() });
      case "adminSaveSchedule": saveSchedule_(payload.schedule || []); return json_({ ok: true });
      case "adminBlock": addBlock_(payload.date); return json_({ ok: true, blockedDates: blockedDates_() });
      case "adminUnblock": removeBlock_(payload.date); return json_({ ok: true, blockedDates: blockedDates_() });
      case "adminCancel": return json_({ ok: true, booking: adminCancel_(payload.id) });
      case "adminReschedule": return json_({ ok: true, booking: adminReschedule_(payload.id, payload.date, payload.time) });
      case "adminSaveBusiness": saveBusiness_(payload.business || {}); return json_({ ok: true, business: getBusiness_() });
      case "adminSaveServices": saveServices_(payload.services || []); return json_({ ok: true, services: getServices_() });
      default: throw new Error("Acción inválida");
    }
  } catch (error) {
    return json_({ ok: false, error: error.message || "Error inesperado" });
  }
}

function setupCtrlTurnos() {
  const book = book_();
  const sheet = book.getSheetByName(TURNOS_SHEET);
  if (!sheet) throw new Error("No existe la hoja Turnos");
  if (!book.getSheetByName(CONFIG_SHEET)) {
    const config = book.insertSheet(CONFIG_SHEET);
    config.getRange(1, 1, 6, 6).setValues([
      ["Dia", "Nombre", "Activo", "Desde", "Hasta", "Intervalo"],
      [1, "Lunes", true, "09:00", "13:00", 30], [2, "Martes", true, "09:00", "13:00", 30],
      [3, "Miércoles", true, "09:00", "13:00", 30], [4, "Jueves", true, "09:00", "13:00", 30], [5, "Viernes", true, "09:00", "13:00", 30]
    ]);
  }
  if (!book.getSheetByName(BLOCKS_SHEET)) book.insertSheet(BLOCKS_SHEET).appendRow(["Fecha"]);
  if (!book.getSheetByName(BUSINESS_SHEET)) {
    const business = book.insertSheet(BUSINESS_SHEET); business.appendRow(["Clave", "Valor"]);
    business.getRange(2, 1, 8, 2).setValues([["name", "AREA Estudio Contable"], ["address", "Av. M. Cabral 3009, Saladillo"], ["whatsapp", "2345 43-8544"], ["instagram", "area.estudiocontable"], ["welcome", "Reservá tu consulta"], ["advanceWeeks", "12"], ["minAdvanceHours", "1"], ["cancelHours", "1"]]);
  }
  if (!book.getSheetByName(SERVICES_SHEET)) { const services = book.insertSheet(SERVICES_SHEET); services.appendRow(["ID", "Nombre", "Duracion", "Precio", "Activo"]); services.appendRow(["consulta", "Consulta contable", 30, "", true]); }
  const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!secret) throw new Error("Primero agregá API_SECRET en Propiedades del script");
  return "Ctrl Turnos configurado correctamente";
}

function listSlots_(from, to, requestedDuration) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "slots:" + cacheVersion_() + ":" + from + ":" + to;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const start = parseDate_(from);
  const end = parseDate_(to);
  if (!start || !end) throw new Error("Rango de fechas inválido");
  const booked = bookedKeys_();
  const blocked = blockedDateMap_();
  const schedule = scheduleMap_();
  const duration = Math.max(30, Number(requestedDuration) || 30);
  const occupied = bookedIntervals_();
  const slots = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (schedule[weekday] && schedule[weekday].active) {
      const date = formatDate_(cursor);
      if (!blocked[date]) {
        const rule = schedule[weekday];
        for (let minute = toMinutes_(rule.start); minute < toMinutes_(rule.end); minute += rule.interval) {
          const time = fromMinutes_(minute);
          const startMinute = minute; const endMinute = minute + duration;
          const overlaps = (occupied[date] || []).some(item => startMinute < item.end && endMinute > item.start);
          if (endMinute <= toMinutes_(rule.end) && !overlaps && !booked[date + "|" + time]) slots.push({ date, time });
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  cache.put(cacheKey, JSON.stringify(slots), 60);
  return slots;
}

function createBooking_(booking) {
  validateBooking_(booking);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const key = booking.date + "|" + booking.time;
    if (bookedKeys_()[key]) throw new Error("Ese horario acaba de ser reservado. Elegí otro.");
    const id = Utilities.getUuid();
    const token = Utilities.getUuid().replace(/-/g, "");
    const now = new Date();
    sheet_().appendRow([id, parseDate_(booking.date), booking.time, clean_(booking.name), clean_(booking.whatsapp), clean_(booking.email), clean_(booking.notes || ""), "Confirmado", token, now, now, clean_(booking.service || "Consulta contable"), Number(booking.duration) || 30]);
    bumpCacheVersion_();
    return { id, token, date: booking.date, time: booking.time, status: "Confirmado", service: booking.service || "Consulta contable", duration: Number(booking.duration) || 30 };
  } finally {
    lock.releaseLock();
  }
}

function getBooking_(token) {
  const record = findByToken_(token);
  return serializeRow_(record.values, record.displayTime);
}

function lookupBookings_(email, whatsapp) {
  const normalizedEmail = normalizeEmail_(email);
  const normalizedWhatsapp = normalizePhone_(whatsapp);
  if (!normalizedEmail || !normalizedWhatsapp) throw new Error("Ingresá el email y WhatsApp usados al reservar");

  const sheet = sheet_();
  if (sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn()));
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  return rows
    .map((row, index) => ({ row, displayTime: displayRows[index][2] }))
    .filter(item => item.row[7] === "Confirmado" && normalizeEmail_(item.row[5]) === normalizedEmail && normalizePhone_(item.row[4]) === normalizedWhatsapp)
    .map(item => serializeRow_(item.row, item.displayTime))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function cancelBooking_(token) {
  const record = findByToken_(token);
  ensureCancelable_(record.values, record.displayTime);
  record.sheet.getRange(record.row, 8).setValue("Cancelado");
  record.sheet.getRange(record.row, 11).setValue(new Date());
  record.values[7] = "Cancelado";
  bumpCacheVersion_();
  return serializeRow_(record.values, record.displayTime);
}

function rescheduleBooking_(token, date, time) {
  const record = findByToken_(token);
  ensureCancelable_(record.values, record.displayTime);
  validateSlot_(date, time, Number(record.values[12]) || 30);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const currentKey = formatDate_(new Date(record.values[1])) + "|" + record.displayTime;
    const newKey = date + "|" + time;
    const booked = bookedKeys_();
    if (booked[newKey] && newKey !== currentKey) throw new Error("Ese horario ya no está disponible");
    record.sheet.getRange(record.row, 2).setValue(parseDate_(date));
    record.sheet.getRange(record.row, 3).setValue(time);
    record.sheet.getRange(record.row, 11).setValue(new Date());
    record.values[1] = parseDate_(date);
    record.values[2] = time;
    bumpCacheVersion_();
    return serializeRow_(record.values, time);
  } finally {
    lock.releaseLock();
  }
}

function validateBooking_(booking) {
  if (!booking.name || !booking.whatsapp || !booking.email) throw new Error("Completá nombre, WhatsApp y email");
  if (!/^\S+@\S+\.\S+$/.test(booking.email)) throw new Error("Ingresá un email válido");
  validateSlot_(booking.date, booking.time, booking.duration);
}

function validateSlot_(date, time, duration) {
  const parsed = parseDate_(date);
  const rule = parsed && scheduleMap_()[parsed.getDay()];
  if (!parsed || !rule || !rule.active || blockedDateMap_()[date]) throw new Error("La fecha no está disponible");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Horario inválido");
  const selectedMinutes = toMinutes_(time);
  if (selectedMinutes < toMinutes_(rule.start) || selectedMinutes + (Number(duration) || 30) > toMinutes_(rule.end) || (selectedMinutes - toMinutes_(rule.start)) % rule.interval !== 0) throw new Error("Horario fuera de atención");
  const parts = time.split(":").map(Number);
  const appointment = new Date(parsed);
  appointment.setHours(parts[0], parts[1], 0, 0);
  if (appointment.getTime() < Date.now() + 60 * 60 * 1000) throw new Error("El turno debe reservarse con una hora de anticipación");
}

function ensureCancelable_(values, displayTime) {
  if (values[7] !== "Confirmado") throw new Error("El turno ya no está activo");
  const appointment = new Date(values[1]);
  const parts = String(displayTime).split(":").map(Number);
  appointment.setHours(parts[0], parts[1], 0, 0);
  if (appointment.getTime() < Date.now() + 60 * 60 * 1000) throw new Error("El turno solo puede modificarse hasta una hora antes");
}

function bookedKeys_() {
  const sheet = sheet_();
  const keys = {};
  if (sheet.getLastRow() < 2) return keys;
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn()));
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  rows.forEach((row, index) => { if (row[7] === "Confirmado") keys[formatDate_(new Date(row[1])) + "|" + displayRows[index][2]] = true; });
  return keys;
}
function bookedIntervals_() { const sheet = sheet_(); const result = {}; if (sheet.getLastRow() < 2) return result; const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())); const values = range.getValues(); const display = range.getDisplayValues(); values.forEach((row, index) => { if (row[7] !== "Confirmado") return; const date = formatDate_(new Date(row[1])); const start = toMinutes_(display[index][2]); (result[date] ||= []).push({ start, end: start + (Number(row[12]) || 30) }); }); return result; }

function findByToken_(token) {
  if (!token) throw new Error("Enlace de turno inválido");
  const sheet = sheet_();
  if (sheet.getLastRow() < 2) throw new Error("Turno no encontrado");
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn()));
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  const index = rows.findIndex(row => String(row[8]) === String(token));
  if (index < 0) throw new Error("Turno no encontrado");
  return { sheet, row: index + 2, values: rows[index], displayTime: displayRows[index][2] };
}

function serializeRow_(row, displayTime) {
  return { id: row[0], date: formatDate_(new Date(row[1])), time: displayTime, name: row[3], whatsapp: row[4], email: row[5], notes: row[6], status: row[7], token: row[8], service: row[11] || "Consulta contable", duration: Number(row[12]) || 30 };
}

function requireSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || secret !== expected) throw new Error("No autorizado");
}

function getSchedule_() {
  const sheet = book_().getSheetByName(CONFIG_SHEET);
  const defaults = [1,2,3,4,5].map((day, index) => ({ weekday: day, label: ["Lunes","Martes","Miércoles","Jueves","Viernes"][index], active: true, start: "09:00", end: "13:00", interval: 30 }));
  if (!sheet || sheet.getLastRow() < 6) return defaults;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues()
    .map(row => ({ weekday: Number(row[0]), label: row[1], active: String(row[2]).toLowerCase() === "true", start: row[3], end: row[4], interval: Number(row[5]) || 30 }))
    .filter(rule => rule.weekday >= 1 && rule.weekday <= 5 && /^\d{2}:\d{2}$/.test(rule.start) && /^\d{2}:\d{2}$/.test(rule.end));
  return rows.length === 5 ? rows.sort((a, b) => a.weekday - b.weekday) : defaults;
}
function scheduleMap_() { const map = {}; getSchedule_().forEach(rule => map[rule.weekday] = rule); return map; }
function saveSchedule_(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 5) throw new Error("Configuración inválida");
  schedule.forEach(rule => { if (!/^\d{2}:\d{2}$/.test(rule.start) || !/^\d{2}:\d{2}$/.test(rule.end) || toMinutes_(rule.start) >= toMinutes_(rule.end)) throw new Error("Revisá los horarios ingresados"); });
  const sheet = ensureSheet_(CONFIG_SHEET, ["Dia", "Nombre", "Activo", "Desde", "Hasta", "Intervalo"]);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).clearContent();
  sheet.getRange(2, 1, 5, 6).setValues(schedule.map(rule => [rule.weekday, rule.label, Boolean(rule.active), rule.start, rule.end, Number(rule.interval) || 30]));
  bumpCacheVersion_();
}
function blockedDates_() { const sheet = ensureSheet_(BLOCKS_SHEET, ["Fecha"]); if (sheet.getLastRow() < 2) return []; return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(row => row[0] instanceof Date ? formatDate_(row[0]) : String(row[0])).filter(Boolean).sort(); }
function blockedDateMap_() { const map = {}; blockedDates_().forEach(date => map[date] = true); return map; }
function addBlock_(date) { if (!parseDate_(date)) throw new Error("Fecha inválida"); if (!blockedDateMap_()[date]) { ensureSheet_(BLOCKS_SHEET, ["Fecha"]).appendRow([parseDate_(date)]); bumpCacheVersion_(); } }
function removeBlock_(date) { const sheet = ensureSheet_(BLOCKS_SHEET, ["Fecha"]); let changed = false; for (let row = sheet.getLastRow(); row >= 2; row--) { const value = sheet.getRange(row, 1).getValue(); const formatted = value instanceof Date ? formatDate_(value) : String(value); if (formatted === date) { sheet.deleteRow(row); changed = true; } } if (changed) bumpCacheVersion_(); }
function adminBookings_() { const sheet = sheet_(); if (sheet.getLastRow() < 2) return []; const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())); const values = range.getValues(); const display = range.getDisplayValues(); const today = formatDate_(new Date()); return values.map((row, i) => serializeRow_(row, display[i][2])).filter(item => item.status === "Confirmado" && item.date >= today).sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time)).slice(0, 50); }
function findById_(id) { const sheet = sheet_(); if (!id || sheet.getLastRow() < 2) throw new Error("Turno no encontrado"); const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())); const rows = range.getValues(); const display = range.getDisplayValues(); const index = rows.findIndex(row => String(row[0]) === String(id)); if (index < 0) throw new Error("Turno no encontrado"); return { sheet, row: index + 2, values: rows[index], displayTime: display[index][2] }; }
function adminCancel_(id) { const record = findById_(id); record.sheet.getRange(record.row, 8).setValue("Cancelado"); record.sheet.getRange(record.row, 11).setValue(new Date()); record.values[7] = "Cancelado"; bumpCacheVersion_(); return serializeRow_(record.values, record.displayTime); }
function adminReschedule_(id, date, time) { const record = findById_(id); validateSlot_(date, time, Number(record.values[12]) || 30); const newKey = date + "|" + time; const currentKey = formatDate_(new Date(record.values[1])) + "|" + record.displayTime; if (bookedKeys_()[newKey] && newKey !== currentKey) throw new Error("Ese horario ya está ocupado"); record.sheet.getRange(record.row, 2).setValue(parseDate_(date)); record.sheet.getRange(record.row, 3).setValue(time); record.sheet.getRange(record.row, 8).setValue("Confirmado"); record.sheet.getRange(record.row, 11).setValue(new Date()); record.values[1] = parseDate_(date); record.values[7] = "Confirmado"; bumpCacheVersion_(); return serializeRow_(record.values, time); }
function getBusiness_() { const sheet = ensureSheet_(BUSINESS_SHEET, ["Clave", "Valor"]); const result = {}; if (sheet.getLastRow() >= 2) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues().forEach(row => result[row[0]] = row[1]); return Object.assign({ name: "AREA Estudio Contable", address: "Av. M. Cabral 3009, Saladillo", whatsapp: "2345 43-8544", instagram: "area.estudiocontable", welcome: "Reservá tu consulta", advanceWeeks: "12", minAdvanceHours: "1", cancelHours: "1" }, result); }
function saveBusiness_(business) { const allowed = ["name", "address", "whatsapp", "instagram", "welcome", "advanceWeeks", "minAdvanceHours", "cancelHours"]; const sheet = ensureSheet_(BUSINESS_SHEET, ["Clave", "Valor"]); if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent(); const rows = allowed.map(key => [key, clean_(business[key] == null ? "" : business[key])]); sheet.getRange(2, 1, rows.length, 2).setValues(rows); bumpCacheVersion_(); }
function getServices_() { const sheet = ensureSheet_(SERVICES_SHEET, ["ID", "Nombre", "Duracion", "Precio", "Activo"]); if (sheet.getLastRow() < 2) return [{ id: "consulta", name: "Consulta contable", duration: 30, price: "", active: true }]; return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues().map(row => ({ id: row[0], name: row[1], duration: Number(row[2]) || 30, price: row[3], active: String(row[4]).toLowerCase() === "true" })).filter(item => item.id && item.name); }
function saveServices_(services) { if (!Array.isArray(services) || !services.length) throw new Error("Agregá al menos un servicio"); const sheet = ensureSheet_(SERVICES_SHEET, ["ID", "Nombre", "Duracion", "Precio", "Activo"]); if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent(); const rows = services.map((item, index) => [clean_(item.id || "servicio-" + (index + 1)), clean_(item.name), Math.max(30, Number(item.duration) || 30), clean_(item.price || ""), item.active !== false]); sheet.getRange(2, 1, rows.length, 5).setValues(rows); bumpCacheVersion_(); }
function ensureSheet_(name, headers) { const book = book_(); let sheet = book.getSheetByName(name); if (!sheet) { sheet = book.insertSheet(name); sheet.appendRow(headers); } return sheet; }
function book_() { const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"); if (!spreadsheetId) throw new Error("Falta configurar SPREADSHEET_ID en las propiedades del script"); if (!BOOK_CACHE_) BOOK_CACHE_ = SpreadsheetApp.openById(spreadsheetId); return BOOK_CACHE_; }
function cacheVersion_() { return PropertiesService.getScriptProperties().getProperty("CACHE_VERSION") || "1"; }
function bumpCacheVersion_() { const properties = PropertiesService.getScriptProperties(); properties.setProperty("CACHE_VERSION", String(Number(properties.getProperty("CACHE_VERSION") || "1") + 1)); }
function toMinutes_(time) { const parts = String(time).split(":").map(Number); return parts[0] * 60 + parts[1]; }
function fromMinutes_(minutes) { return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"); }

function sheet_() { return book_().getSheetByName(TURNOS_SHEET); }
function clean_(value) { return String(value).trim().slice(0, 500); }
function normalizeEmail_(value) { return String(value || "").trim().toLowerCase(); }
function normalizePhone_(value) { return String(value || "").replace(/\D/g, ""); }
function parseDate_(value) { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null; }
function formatDate_(date) { return Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd"); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
