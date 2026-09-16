const SPREADSHEET_ID = "1BJOrpXt5wvWZ7e66OWcG8KZ2SrJYn97D5N7YqPNMdBk";
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const TURNOS_SHEET = "Turnos";

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
      default: throw new Error("Acción inválida");
    }
  } catch (error) {
    return json_({ ok: false, error: error.message || "Error inesperado" });
  }
}

function setupCtrlTurnos() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TURNOS_SHEET);
  if (!sheet) throw new Error("No existe la hoja Turnos");
  const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!secret) throw new Error("Primero agregá API_SECRET en Propiedades del script");
  return "Ctrl Turnos configurado correctamente";
}

function listSlots_(from, to) {
  const start = parseDate_(from);
  const end = parseDate_(to);
  if (!start || !end) throw new Error("Rango de fechas inválido");
  const booked = bookedKeys_();
  const slots = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (weekday >= 1 && weekday <= 5) {
      const date = formatDate_(cursor);
      for (let hour = 9; hour < 13; hour++) {
        for (const minute of [0, 30]) {
          const time = String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
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
  return serializeRow_(record.values);
}

function lookupBookings_(email, whatsapp) {
  const normalizedEmail = normalizeEmail_(email);
  const normalizedWhatsapp = normalizePhone_(whatsapp);
  if (!normalizedEmail || !normalizedWhatsapp) throw new Error("Ingresá el email y WhatsApp usados al reservar");

  const sheet = sheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  return rows
    .filter(row => row[7] === "Confirmado" && normalizeEmail_(row[5]) === normalizedEmail && normalizePhone_(row[4]) === normalizedWhatsapp)
    .map(serializeRow_)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function cancelBooking_(token) {
  const record = findByToken_(token);
  ensureCancelable_(record.values);
  record.sheet.getRange(record.row, 8).setValue("Cancelado");
  record.sheet.getRange(record.row, 11).setValue(new Date());
  record.values[7] = "Cancelado";
  return serializeRow_(record.values);
}

function rescheduleBooking_(token, date, time) {
  const record = findByToken_(token);
  ensureCancelable_(record.values);
  validateSlot_(date, time);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const currentKey = formatDate_(new Date(record.values[1])) + "|" + record.values[2];
    const newKey = date + "|" + time;
    const booked = bookedKeys_();
    if (booked[newKey] && newKey !== currentKey) throw new Error("Ese horario ya no está disponible");
    record.sheet.getRange(record.row, 2).setValue(parseDate_(date));
    record.sheet.getRange(record.row, 3).setValue(time);
    record.sheet.getRange(record.row, 11).setValue(new Date());
    record.values[1] = parseDate_(date);
    record.values[2] = time;
    return serializeRow_(record.values);
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
  if (!parsed || parsed.getDay() < 1 || parsed.getDay() > 5) throw new Error("La fecha no está disponible");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Horario inválido");
  const parts = time.split(":").map(Number);
  if (parts[0] < 9 || parts[0] >= 13 || ![0, 30].includes(parts[1])) throw new Error("Horario fuera de atención");
  const appointment = new Date(parsed);
  appointment.setHours(parts[0], parts[1], 0, 0);
  if (appointment.getTime() < Date.now() + 60 * 60 * 1000) throw new Error("El turno debe reservarse con una hora de anticipación");
}

function ensureCancelable_(values) {
  if (values[7] !== "Confirmado") throw new Error("El turno ya no está activo");
  const appointment = new Date(values[1]);
  const parts = String(values[2]).split(":").map(Number);
  appointment.setHours(parts[0], parts[1], 0, 0);
  if (appointment.getTime() < Date.now() + 60 * 60 * 1000) throw new Error("El turno solo puede modificarse hasta una hora antes");
}

function bookedKeys_() {
  const sheet = sheet_();
  const keys = {};
  if (sheet.getLastRow() < 2) return keys;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  rows.forEach(row => { if (row[7] === "Confirmado") keys[formatDate_(new Date(row[1])) + "|" + row[2]] = true; });
  return keys;
}

function findByToken_(token) {
  if (!token) throw new Error("Enlace de turno inválido");
  const sheet = sheet_();
  if (sheet.getLastRow() < 2) throw new Error("Turno no encontrado");
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  const index = rows.findIndex(row => String(row[8]) === String(token));
  if (index < 0) throw new Error("Turno no encontrado");
  return { sheet, row: index + 2, values: rows[index] };
}

function serializeRow_(row) {
  return { id: row[0], date: formatDate_(new Date(row[1])), time: row[2], name: row[3], whatsapp: row[4], email: row[5], notes: row[6], status: row[7], token: row[8] };
}

function requireSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || secret !== expected) throw new Error("No autorizado");
}

function sheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TURNOS_SHEET); }
function clean_(value) { return String(value).trim().slice(0, 500); }
function normalizeEmail_(value) { return String(value || "").trim().toLowerCase(); }
function normalizePhone_(value) { return String(value || "").replace(/\D/g, ""); }
function parseDate_(value) { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null; }
function formatDate_(date) { return Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd"); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
