"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Check, Clock3, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const allTimes = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextBusinessDays() {
  const result: Array<{ short: string; number: string; label: string; date: string }> = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (result.length < 5) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) {
      const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(cursor);
      result.push({ short: weekday.slice(0, 3).toUpperCase(), number: String(cursor.getDate()), label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${cursor.getDate()}`, date: isoDate(cursor) });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

const days = nextBusinessDays();

export default function Home() {
  const [day, setDay] = useState(days[0].date);
  const [time, setTime] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [error, setError] = useState("");
  const [bookingToken, setBookingToken] = useState("");
  const [reprogramToken, setReprogramToken] = useState("");
  const selectedDay = days.find((item) => item.date === day) ?? days[0];

  useEffect(() => {
    setReprogramToken(new URLSearchParams(window.location.search).get("reprogramar") || "");
    const params = new URLSearchParams({ action: "slots", from: days[0].date, to: days[days.length - 1].date });
    fetch(`/api/turnos?${params}`).then((response) => response.json()).then((data) => {
      if (!data.ok) throw new Error(data.error || "No pudimos cargar los horarios");
      setAvailable(new Set(data.slots.map((slot: { date: string; time: string }) => `${slot.date}|${slot.time}`)));
    }).catch((reason) => setError(reason.message)).finally(() => setLoadingSlots(false));
  }, []);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "start_booking",
      title: "Comenzar una reserva",
      description: "Selecciona un día y horario disponible y abre el formulario de reserva para que la persona complete sus datos.",
      inputSchema: { type: "object", properties: { day: { type: "string", enum: days.map((item) => item.date) }, time: { type: "string", enum: allTimes } }, required: ["day", "time"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { day?: string; time?: string };
        if (!value.day || !days.some((item) => item.date === value.day) || !value.time || !allTimes.includes(value.time)) throw new Error("El día u horario no está disponible.");
        setDay(value.day); setTime(value.time); setConfirmed(false); setOpen(true);
        return { status: "form_opened", day: value.day, time: value.time };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = reprogramToken ? { action: "reschedule", token: reprogramToken, date: day, time } : { action: "create", booking: { date: day, time, name: form.get("name"), whatsapp: form.get("whatsapp"), email: form.get("email"), notes: form.get("notes") } };
    const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!data.ok) { setError(data.error || "No pudimos confirmar la consulta"); return; }
    setBookingToken(data.booking.token || reprogramToken);
    setAvailable((current) => { const next = new Set(current); next.delete(`${day}|${time}`); return next; });
    setConfirmed(true);
  }

  return (
    <main className="min-h-screen bg-[#f3f7f5] text-[#13231d]">
      <header className="border-b border-[#d8e4df] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <button className="flex items-center gap-3 text-left" onClick={() => setAdmin(false)}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#173f70] text-lg font-semibold text-white">A</span>
            <span><strong className="block text-[17px] leading-tight">AREA Estudio Contable</strong><small className="text-sm text-[#63736d]">Turnos para consultas</small></span>
          </button>
          <Button asChild variant="outline" className="rounded-xl border-[#cfddd7]"><a href="/mis-turnos">Administrar mi turno</a></Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[.85fr_1.6fr] md:px-8 md:py-14">
          <aside className="self-start rounded-3xl bg-[#102f55] p-7 text-white shadow-[0_20px_60px_rgba(16,47,85,.18)] md:sticky md:top-8 md:p-9">
            <img src="/area-logo.png" alt="AREA Estudio Contable" className="mb-7 w-full max-w-[230px] rounded-xl bg-black object-contain" />
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[.14em] text-[#cbdcf2]">Consultas presenciales</span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-.04em]">Reservá tu consulta con AREA.</h1>
            <p className="mt-4 text-base leading-7 text-[#d6e2f0]">Elegí el día y horario que te resulte más cómodo. La confirmación es inmediata.</p>
            <div className="mt-9 space-y-4 border-t border-white/15 pt-6 text-sm text-[#d8e8e2]">
              <p className="flex items-center gap-3"><Clock3 size={18} className="text-[#9fc0e8]" /> Consultas de 30 minutos</p>
              <p className="flex items-center gap-3"><MapPin size={18} className="text-[#9fc0e8]" /> Av. M. Cabral 3009, Saladillo</p>
              <p className="flex items-center gap-3"><CalendarDays size={18} className="text-[#9fc0e8]" /> Reprogramá o cancelá hasta 1 hora antes</p>
            </div>
          </aside>

          <div className="rounded-3xl border border-[#dbe6e1] bg-white p-5 shadow-[0_16px_50px_rgba(20,58,47,.08)] sm:p-8">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-sm font-semibold text-[#173f70]">RESERVA ONLINE</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Seleccioná día y horario</h2></div>
              <span className="hidden rounded-full bg-[#edf4fb] px-3 py-1.5 text-sm font-medium text-[#173f70] sm:block">Consulta contable</span>
            </div>
            <div className="mt-7 grid grid-cols-5 gap-2" aria-label="Días disponibles">
              {reprogramToken && <p className="col-span-5 mb-2 rounded-xl bg-[#edf4fb] p-3 text-sm font-medium text-[#173f70]">Elegí el nuevo horario para reprogramar tu consulta.</p>}
              {days.map((item) => <button key={item.date} onClick={() => { setDay(item.date); setTime(""); }} aria-pressed={day === item.date} className={`rounded-2xl border px-1 py-3 transition ${day === item.date ? "border-[#173f70] bg-[#173f70] text-white shadow-md" : "border-[#d8e0e9] text-[#52606f] hover:border-[#7b9abe]"}`}><span className="block text-[11px] font-bold tracking-wider">{item.short}</span><span className="mt-1 block text-xl font-semibold">{item.number}</span></button>)}
            </div>
            <div className="mt-8 border-t border-[#e4ebe8] pt-7">
              <h3 className="font-semibold">Horarios disponibles · {selectedDay.label}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allTimes.filter((slot) => available.has(`${day}|${slot}`)).map((slot) => <button key={slot} onClick={() => setTime(slot)} aria-pressed={time === slot} className={`rounded-xl border px-4 py-3 text-base font-semibold transition ${time === slot ? "border-[#173f70] bg-[#e7f0fa] text-[#173f70] ring-2 ring-[#173f70]/15" : "border-[#d9e1ea] hover:border-[#7b9abe] hover:bg-[#f5f8fc]"}`}>{slot}</button>)}
              </div>
              {loadingSlots && <p className="mt-4 text-sm text-[#687381]">Cargando horarios…</p>}
              {!loadingSlots && !allTimes.some((slot) => available.has(`${day}|${slot}`)) && <p className="mt-4 text-sm text-[#687381]">No quedan horarios disponibles para este día.</p>}
              {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            </div>
            <Button disabled={!time} onClick={() => { setConfirmed(false); setOpen(true); }} className="mt-8 h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55] disabled:bg-[#b9c4d1]">Continuar con la reserva</Button>
            <p className="mt-4 text-center text-xs text-[#75847f]">Tus datos se utilizan solamente para gestionar el turno.</p>
          </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-3xl sm:max-w-md">{!confirmed ? <><DialogHeader><DialogTitle className="text-2xl">Completá tus datos</DialogTitle><DialogDescription>Consulta presencial el {selectedDay.label.toLowerCase()} a las {time}. La confirmación es automática.</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold">Nombre y apellido<Input name="name" required className="mt-2 h-11 rounded-xl" placeholder="Ej: Manuela Gómez" /></label><label className="block text-sm font-semibold">WhatsApp<Input name="whatsapp" required className="mt-2 h-11 rounded-xl" placeholder="Ej: 2345 43-8544" /></label><label className="block text-sm font-semibold">Email<Input name="email" required type="email" className="mt-2 h-11 rounded-xl" placeholder="nombre@email.com" /></label><label className="block text-sm font-semibold">Observaciones<Input name="notes" className="mt-2 h-11 rounded-xl" placeholder="Contanos brevemente el motivo de consulta" /></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button className="h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55]">Confirmar consulta</Button></form></> : <div className="py-5 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5effa] text-[#173f70]"><Check size={30} /></span><DialogTitle className="mt-5 text-2xl">¡Consulta confirmada!</DialogTitle><DialogDescription className="mx-auto mt-2 max-w-xs text-base">Te esperamos el {selectedDay.label.toLowerCase()} a las {time} en Av. M. Cabral 3009.</DialogDescription>{bookingToken && <a className="mt-4 block break-all text-sm font-semibold text-[#173f70] underline" href={`/turno/${bookingToken}`}>Administrar mi turno</a>}<Button onClick={() => setOpen(false)} className="mt-6 h-11 w-full rounded-xl bg-[#173f70] hover:bg-[#102f55]">Listo</Button></div>}</DialogContent></Dialog>
    </main>
  );
}
