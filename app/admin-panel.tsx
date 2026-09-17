"use client";

import { FormEvent, useState } from "react";
import { CalendarDays, CalendarX, LockKeyhole, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Schedule = { weekday: number; label: string; active: boolean; start: string; end: string; interval: number };
type Booking = { id: string; date: string; time: string; name: string; whatsapp: string; status: string };
const defaultSchedule: Schedule[] = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"].map((label, index) => ({ weekday: index + 1, label, active: true, start: "09:00", end: "13:00", interval: 30 }));

function validSchedule(value: unknown): Schedule[] {
  if (!Array.isArray(value)) return defaultSchedule;
  const rows = value.filter((row): row is Schedule => Boolean(row && typeof row === "object" && Number((row as Schedule).weekday) >= 1 && Number((row as Schedule).weekday) <= 5 && /^\d{2}:\d{2}$/.test(String((row as Schedule).start)) && /^\d{2}:\d{2}$/.test(String((row as Schedule).end))));
  return rows.length === 5 ? rows.sort((a, b) => a.weekday - b.weekday).map((row, index) => ({ ...row, label: defaultSchedule[index].label })) : defaultSchedule;
}

function friendlyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const text = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AdminPanel() {
  const [password, setPassword] = useState("");
  const [schedule, setSchedule] = useState<Schedule[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, adminPassword: password, ...extra }) });
    const text = await response.text();
    if (!text.trim()) throw new Error("El servidor respondió vacío. Esperá unos segundos y volvé a intentar.");
    let data: { ok?: boolean; error?: string; [key: string]: unknown };
    try { data = JSON.parse(text); }
    catch { throw new Error("El servidor devolvió una respuesta inválida. Revisá el despliegue de Cloudflare."); }
    if (!data.ok) throw new Error(data.error || "No pudimos completar la acción");
    return data;
  }

  async function login(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { const data = await call("adminOverview"); setSchedule(validSchedule(data.schedule)); setBookings(data.bookings || []); setBlocked(data.blockedDates || []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos ingresar"); }
    finally { setLoading(false); }
  }

  async function saveSchedule() {
    setError(""); setMessage("");
    try { await call("adminSaveSchedule", { schedule }); setMessage("Horarios guardados."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos guardar"); }
  }

  async function blockDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const date = String(new FormData(event.currentTarget).get("date") || "");
    try { const data = await call("adminBlock", { date }); setBlocked(data.blockedDates); setMessage("Fecha bloqueada."); event.currentTarget.reset(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos bloquearla"); }
  }

  async function cancelBooking(booking: Booking) {
    if (!confirm(`¿Cancelar el turno de ${booking.name} del ${booking.date} a las ${booking.time}?`)) return;
    setError("");
    try { await call("adminCancel", { id: booking.id }); setBookings(current => current.filter(item => item.id !== booking.id)); setMessage("Turno cancelado."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos cancelar el turno"); }
  }

  async function rescheduleBooking(event: FormEvent<HTMLFormElement>, booking: Booking) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await call("adminReschedule", { id: booking.id, date: form.get("date"), time: form.get("time") });
      setBookings(current => current.map(item => item.id === booking.id ? data.booking : item).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
      setMessage("Turno reprogramado.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos reprogramar el turno"); }
  }

  if (!schedule.length) return <section className="mx-auto max-w-md px-5 py-12"><div className="rounded-3xl border bg-white p-7 shadow-sm sm:p-9"><LockKeyhole className="text-[#173f70]" /><p className="mt-5 text-sm font-semibold text-[#173f70]">CTRL TURNOS</p><h1 className="mt-1 text-3xl font-semibold">Administración</h1><p className="mt-3 text-sm text-[#687381]">Acceso exclusivo del negocio.</p><form className="mt-7 space-y-4" onSubmit={login}><label className="block text-sm font-semibold">Clave<Input type="password" required className="mt-2 h-12 rounded-xl" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button disabled={loading} className="h-12 w-full rounded-xl bg-[#173f70]">{loading ? "Ingresando…" : "Ingresar"}</Button></form></div></section>;

  const grouped = bookings.reduce<Record<string, Booking[]>>((result, item) => { (result[item.date] ||= []).push(item); return result; }, {});
  return <section className="mx-auto max-w-6xl px-5 py-8 md:py-12"><div className="mb-7"><p className="text-sm font-semibold text-[#173f70]">AREA ESTUDIO CONTABLE</p><h1 className="text-3xl font-semibold">Panel administrativo</h1></div>{(error || message) && <p className={`mb-5 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{error || message}</p>}<div className="grid items-start gap-6 lg:grid-cols-[.9fr_1.35fr]"><div className="space-y-6"><div className="rounded-3xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-semibold">Horarios semanales</h2><p className="mt-1 text-sm text-[#687381]">Marcá los días de atención e indicá apertura y cierre.</p><div className="mt-5 space-y-3">{schedule.map((item, index) => <div key={item.weekday} className="grid grid-cols-[1fr_78px_78px] items-center gap-2 rounded-xl bg-[#f5f7fa] p-3 sm:grid-cols-[1fr_105px_105px]"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={item.active} onChange={(e) => setSchedule(current => current.map((row, i) => i === index ? { ...row, active: e.target.checked } : row))} />{item.label}</label><Input aria-label={`Apertura ${item.label}`} type="time" value={item.start} disabled={!item.active} onChange={(e) => setSchedule(current => current.map((row, i) => i === index ? { ...row, start: e.target.value } : row))} /><Input aria-label={`Cierre ${item.label}`} type="time" value={item.end} disabled={!item.active} onChange={(e) => setSchedule(current => current.map((row, i) => i === index ? { ...row, end: e.target.value } : row))} /></div>)}</div><Button onClick={saveSchedule} className="mt-5 w-full rounded-xl bg-[#173f70]"><Save />Guardar horarios</Button></div><div className="rounded-3xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-semibold">Bloquear una fecha</h2><form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={blockDate}><Input name="date" type="date" required className="h-11 rounded-xl" /><Button className="h-11 rounded-xl bg-[#173f70]"><CalendarX />Bloquear</Button></form><div className="mt-4 flex flex-wrap gap-2">{blocked.map(date => <button key={date} onClick={async () => { const data = await call("adminUnblock", { date }); setBlocked(data.blockedDates); }} className="rounded-full bg-[#edf2f7] px-3 py-1 text-sm">{date} ×</button>)}</div></div></div><div className="rounded-3xl border bg-white p-5 sm:p-7"><div className="flex items-center gap-3"><CalendarDays className="text-[#173f70]" /><div><h2 className="text-xl font-semibold">Agenda de turnos</h2><p className="text-sm text-[#687381]">Próximas consultas confirmadas</p></div></div><div className="mt-6 space-y-6">{Object.keys(grouped).length ? Object.entries(grouped).map(([date, items]) => <div key={date}><h3 className="mb-3 border-b pb-2 font-semibold text-[#173f70]">{friendlyDate(date)}</h3><div className="space-y-3">{items.map(item => <article key={item.id} className="rounded-2xl border border-[#d8e1ea] p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-lg">{item.time} · {item.name}</strong><p className="text-sm text-[#687381]">WhatsApp: {item.whatsapp}</p></div><Button aria-label="Cancelar turno" variant="destructive" size="icon" className="shrink-0 rounded-xl" onClick={() => cancelBooking(item)}><Trash2 size={17} /></Button></div><form className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_100px_auto]" onSubmit={(event) => rescheduleBooking(event, item)}><Input name="date" type="date" required defaultValue={item.date} className="rounded-xl" /><Input name="time" type="time" required step="1800" defaultValue={item.time} className="rounded-xl" /><Button variant="outline" className="col-span-2 rounded-xl sm:col-span-1">Reprogramar</Button></form></article>)}</div></div>) : <p className="rounded-2xl bg-[#f3f6fa] p-4 text-sm text-[#687381]">No hay turnos próximos.</p>}</div></div></div></section>;
}
