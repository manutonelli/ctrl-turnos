const SPREADSHEET_ID = "1BJOrpXt5wvWZ7e66OWcG8KZ2SrJYn97D5N7YqPNMdBk";
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const TURNOS_SHEET = "Turnos";
const CONFIG_SHEET = "Configuracion";
const BLOCKS_SHEET = "Bloqueos";

function doGet() {
  return json_({ ok: true, service: "Ctrl Turnos - AREA" });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    requireSecret_(payload.secret);
    switch (payload.action) {
      case "slots": return json_({ ok: true, slots: listSlots_(payload.from, payload.to) });
      case "create": return json_({ ok: true, booking: createBooking_(payload.booking || {}) });
      case "get": return json_({ ok: true, booking: getBooking_(payload.token) });
      case "lookup": return json_({ ok: true, bookings: lookupBookings_(payload.email, payload.whatsapp) });
      case "cancel": return json_({ ok: true, booking: cancelBooking_(payload.token) });
      case "reschedule": return json_({ ok: true, booking: rescheduleBooking_(payload.token, payload.date, payload.time) });
      case "adminOverview": return json_({ ok: true, schedule: getSchedule_(), blockedDates: blockedDates_(), bookings: adminBookings_() });
      case "adminSaveSchedule": saveSchedule_(payload.schedule || []); return json_({ ok: true });
      case "adminBlock": addBlock_(payload.date); return json_({ ok: true, blockedDates: blockedDates_() });
      case "adminUnblock": removeBlock_(payload.date); return json_({ ok: true, blockedDates: blockedDates_() });
      default: throw new Error("Acción inválida");
    }
  } catch (error) {
    return json_({ ok: false, error: error.message || "Error inesperado" });
  }
}

function setupCtrlTurnos() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!secret) throw new Error("Primero agregá API_SECRET en Propiedades del script");
  return "Ctrl Turnos configurado correctamente";
}

function listSlots_(from, to) {
  const start = parseDate_(from);
  const end = parseDate_(to);
  if (!start || !end) throw new Error("Rango de fechas inválido");
  const booked = bookedKeys_();
  const blocked = blockedDateMap_();
  const schedule = scheduleMap_();
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
          if (!booked[date + "|" + time]) slots.push({ date, time });
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
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
    sheet_().appendRow([id, parseDate_(booking.date), booking.time, clean_(booking.name), clean_(booking.whatsapp), clean_(booking.email), clean_(booking.notes || ""), "Confirmado", token, now, now]);
    return { id, token, date: booking.date, time: booking.time, status: "Confirmado" };
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
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11);
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
  return serializeRow_(record.values, record.displayTime);
}

function rescheduleBooking_(token, date, time) {
  const record = findByToken_(token);
  ensureCancelable_(record.values, record.displayTime);
  validateSlot_(date, time);
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
    return serializeRow_(record.values, time);
  } finally {
    lock.releaseLock();
  }
}

function validateBooking_(booking) {
  if (!booking.name || !booking.whatsapp || !booking.email) throw new Error("Completá nombre, WhatsApp y email");
  if (!/^\S+@\S+\.\S+$/.test(booking.email)) throw new Error("Ingresá un email válido");
  validateSlot_(booking.date, booking.time);
}

function validateSlot_(date, time) {
  const parsed = parseDate_(date);
  const rule = parsed && scheduleMap_()[parsed.getDay()];
  if (!parsed || !rule || !rule.active || blockedDateMap_()[date]) throw new Error("La fecha no está disponible");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Horario inválido");
  const selectedMinutes = toMinutes_(time);
  if (selectedMinutes < toMinutes_(rule.start) || selectedMinutes >= toMinutes_(rule.end) || (selectedMinutes - toMinutes_(rule.start)) % rule.interval !== 0) throw new Error("Horario fuera de atención");
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
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11);
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  rows.forEach((row, index) => { if (row[7] === "Confirmado") keys[formatDate_(new Date(row[1])) + "|" + displayRows[index][2]] = true; });
  return keys;
}

function findByToken_(token) {
  if (!token) throw new Error("Enlace de turno inválido");
  const sheet = sheet_();
  if (sheet.getLastRow() < 2) throw new Error("Turno no encontrado");
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11);
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  const index = rows.findIndex(row => String(row[8]) === String(token));
  if (index < 0) throw new Error("Turno no encontrado");
  return { sheet, row: index + 2, values: rows[index], displayTime: displayRows[index][2] };
}

function serializeRow_(row, displayTime) {
  return { id: row[0], date: formatDate_(new Date(row[1])), time: displayTime, name: row[3], whatsapp: row[4], email: row[5], notes: row[6], status: row[7], token: row[8] };
}

function requireSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || secret !== expected) throw new Error("No autorizado");
}

function getSchedule_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  if (!sheet) return [1,2,3,4,5].map((day, index) => ({ weekday: day, label: ["Lunes","Martes","Miércoles","Jueves","Viernes"][index], active: true, start: "09:00", end: "13:00", interval: 30 }));
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues().map(row => ({ weekday: Number(row[0]), label: row[1], active: String(row[2]).toLowerCase() === "true", start: row[3], end: row[4], interval: Number(row[5]) || 30 }));
}
function scheduleMap_() { const map = {}; getSchedule_().forEach(rule => map[rule.weekday] = rule); return map; }
function saveSchedule_(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 5) throw new Error("Configuración inválida");
  schedule.forEach(rule => { if (!/^\d{2}:\d{2}$/.test(rule.start) || !/^\d{2}:\d{2}$/.test(rule.end) || toMinutes_(rule.start) >= toMinutes_(rule.end)) throw new Error("Revisá los horarios ingresados"); });
  const sheet = ensureSheet_(CONFIG_SHEET, ["Dia", "Nombre", "Activo", "Desde", "Hasta", "Intervalo"]);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).clearContent();
  sheet.getRange(2, 1, 5, 6).setValues(schedule.map(rule => [rule.weekday, rule.label, Boolean(rule.active), rule.start, rule.end, Number(rule.interval) || 30]));
}
function blockedDates_() { const sheet = ensureSheet_(BLOCKS_SHEET, ["Fecha"]); if (sheet.getLastRow() < 2) return []; return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(row => row[0] instanceof Date ? formatDate_(row[0]) : String(row[0])).filter(Boolean).sort(); }
function blockedDateMap_() { const map = {}; blockedDates_().forEach(date => map[date] = true); return map; }
function addBlock_(date) { if (!parseDate_(date)) throw new Error("Fecha inválida"); if (!blockedDateMap_()[date]) ensureSheet_(BLOCKS_SHEET, ["Fecha"]).appendRow([parseDate_(date)]); }
function removeBlock_(date) { const sheet = ensureSheet_(BLOCKS_SHEET, ["Fecha"]); for (let row = sheet.getLastRow(); row >= 2; row--) { const value = sheet.getRange(row, 1).getValue(); const formatted = value instanceof Date ? formatDate_(value) : String(value); if (formatted === date) sheet.deleteRow(row); } }
function adminBookings_() { const sheet = sheet_(); if (sheet.getLastRow() < 2) return []; const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11); const values = range.getValues(); const display = range.getDisplayValues(); const today = formatDate_(new Date()); return values.map((row, i) => serializeRow_(row, display[i][2])).filter(item => item.status === "Confirmado" && item.date >= today).sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time)).slice(0, 50); }
function ensureSheet_(name, headers) { const book = SpreadsheetApp.openById(SPREADSHEET_ID); let sheet = book.getSheetByName(name); if (!sheet) { sheet = book.insertSheet(name); sheet.appendRow(headers); } return sheet; }
function toMinutes_(time) { const parts = String(time).split(":").map(Number); return parts[0] * 60 + parts[1]; }
function fromMinutes_(minutes) { return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"); }

function sheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TURNOS_SHEET); }
function clean_(value) { return String(value).trim().slice(0, 500); }
function normalizeEmail_(value) { return String(value || "").trim().toLowerCase(); }
function normalizePhone_(value) { return String(value || "").replace(/\D/g, ""); }
function parseDate_(value) { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null; }
function formatDate_(date) { return Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd"); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
