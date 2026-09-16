"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Clock3, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const WEEKDAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const WEEKDAY_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const TIME_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];

type DayOption = { iso: string; short: string; number: string; label: string };

function buildDays(count: number): DayOption[] {
  const result: DayOption[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  while (result.length < count) {
    const weekday = cursor.getDay();
    if (weekday >= 1 && weekday <= 5) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      result.push({ iso, short: WEEKDAY_SHORT[weekday], number: String(cursor.getDate()), label: `${WEEKDAY_LONG[weekday]} ${cursor.getDate()}` });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

type BookingRecord = { id: string; date: string; time: string; name: string; whatsapp: string; email: string; notes: string; status: string; token: string };

async function callApi(payload: Record<string, unknown>) {
  const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return response.json() as Promise<{ ok?: boolean; error?: string; booking?: BookingRecord }>;
}

export default function Home() {
  const days = useMemo(() => buildDays(5), []);
  const [view, setView] = useState<"booking" | "manage">("booking");
  const [day, setDay] = useState(days[0].iso);
  const [time, setTime] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [manageEmail, setManageEmail] = useState("");
  const [manageWhatsapp, setManageWhatsapp] = useState("");
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageNotice, setManageNotice] = useState<string | null>(null);
  const [manageBooking, setManageBooking] = useState<BookingRecord | null>(null);
  const [rescheduleDay, setRescheduleDay] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const dayLabel = days.find((item) => item.iso === day)?.label ?? day;

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "start_booking",
      title: "Comenzar una reserva",
      description: "Selecciona un día y horario disponible y abre el formulario de reserva para que la persona complete sus datos.",
      inputSchema: { type: "object", properties: { day: { type: "string", enum: days.map((item) => item.label) }, time: { type: "string" } }, required: ["day", "time"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { day?: string; time?: string };
        const match = days.find((item) => item.label === value.day);
        if (!match || !value.time || !TIME_SLOTS.includes(value.time)) throw new Error("El día u horario no está disponible.");
        setView("booking"); setDay(match.iso); setTime(value.time); setConfirmed(false); setCreateError(null); setOpen(true);
        return { status: "form_opened", day: value.day, time: value.time };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    void Promise.resolve(context.registerTool({
      name: "find_booking",
      title: "Buscar mi turno",
      description: "Busca el turno confirmado de una persona a partir de su email y su WhatsApp, para poder verlo, reprogramarlo o cancelarlo.",
      inputSchema: { type: "object", properties: { email: { type: "string" }, whatsapp: { type: "string" } }, required: ["email", "whatsapp"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { email?: string; whatsapp?: string };
        if (!value.email || !value.whatsapp) throw new Error("Necesito tu email y tu WhatsApp para buscar el turno.");
        const data = await callApi({ action: "find", email: value.email, whatsapp: value.whatsapp });
        if (!data.ok) throw new Error(data.error || "No pudimos encontrar el turno.");
        return { status: "found", booking: data.booking };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    void Promise.resolve(context.registerTool({
      name: "cancel_booking",
      title: "Cancelar mi turno",
      description: "Cancela un turno confirmado usando el token obtenido con find_booking.",
      inputSchema: { type: "object", properties: { token: { type: "string" } }, required: ["token"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { token?: string };
        if (!value.token) throw new Error("Necesito el token del turno para cancelarlo.");
        const data = await callApi({ action: "cancel", token: value.token });
        if (!data.ok) throw new Error(data.error || "No pudimos cancelar el turno.");
        return { status: "cancelled", booking: data.booking };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    void Promise.resolve(context.registerTool({
      name: "reschedule_booking",
      title: "Reprogramar mi turno",
      description: "Reprograma un turno confirmado a un nuevo día y horario, usando el token obtenido con find_booking.",
      inputSchema: { type: "object", properties: { token: { type: "string" }, date: { type: "string" }, time: { type: "string" } }, required: ["token", "date", "time"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { token?: string; date?: string; time?: string };
        if (!value.token || !value.date || !value.time) throw new Error("Necesito el token del turno y el nuevo día y horario.");
        const data = await callApi({ action: "reschedule", token: value.token, date: value.date, time: value.time });
        if (!data.ok) throw new Error(data.error || "No pudimos reprogramar el turno.");
        return { status: "rescheduled", booking: data.booking };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [days]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setCreating(true);
    setCreateError(null);
    try {
      const data = await callApi({
        action: "create",
        booking: {
          name: String(formData.get("name") || ""),
          whatsapp: String(formData.get("whatsapp") || ""),
          email: String(formData.get("email") || ""),
          notes: String(formData.get("notes") || ""),
          date: day,
          time,
        },
      });
      if (!data.ok) throw new Error(data.error || "No pudimos confirmar el turno.");
      setConfirmed(true);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "No pudimos confirmar el turno.");
    } finally {
      setCreating(false);
    }
  }

  async function findMyBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManageLoading(true);
    setManageError(null);
    setManageNotice(null);
    setManageBooking(null);
    setRescheduleDay("");
    setRescheduleTime("");
    try {
      const data = await callApi({ action: "find", email: manageEmail, whatsapp: manageWhatsapp });
      if (!data.ok || !data.booking) throw new Error(data.error || "No encontramos tu turno.");
      setManageBooking(data.booking);
    } catch (error) {
      setManageError(error instanceof Error ? error.message : "No encontramos tu turno.");
    } finally {
      setManageLoading(false);
    }
  }

  async function cancelMyBooking() {
    if (!manageBooking) return;
    setCancelling(true);
    setManageError(null);
    setManageNotice(null);
    try {
      const data = await callApi({ action: "cancel", token: manageBooking.token });
      if (!data.ok || !data.booking) throw new Error(data.error || "No pudimos cancelar el turno.");
      setManageBooking(data.booking);
      setManageNotice("Tu turno fue cancelado.");
    } catch (error) {
      setManageError(error instanceof Error ? error.message : "No pudimos cancelar el turno.");
    } finally {
      setCancelling(false);
    }
  }

  async function rescheduleMyBooking() {
    if (!manageBooking || !rescheduleDay || !rescheduleTime) return;
    setRescheduling(true);
    setManageError(null);
    setManageNotice(null);
    try {
      const data = await callApi({ action: "reschedule", token: manageBooking.token, date: rescheduleDay, time: rescheduleTime });
      if (!data.ok || !data.booking) throw new Error(data.error || "No pudimos reprogramar el turno.");
      setManageBooking(data.booking);
      setManageNotice("Tu turno fue reprogramado.");
      setRescheduleDay("");
      setRescheduleTime("");
    } catch (error) {
      setManageError(error instanceof Error ? error.message : "No pudimos reprogramar el turno.");
    } finally {
      setRescheduling(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f7f5] text-[#13231d]">
      <header className="border-b border-[#d8e4df] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <button className="flex items-center gap-3 text-left" onClick={() => setView("booking")}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#173f70] text-lg font-semibold text-white">A</span>
            <span><strong className="block text-[17px] leading-tight">AREA Estudio Contable</strong><small className="text-sm text-[#63736d]">Turnos para consultas</small></span>
          </button>
          <Button variant="outline" className="rounded-xl border-[#cfddd7]" onClick={() => setView(view === "manage" ? "booking" : "manage")}>
            {view === "manage" ? <ChevronLeft /> : <Search />}{view === "manage" ? "Volver" : "Administrar mi turno"}
          </Button>
        </div>
      </header>

      {view === "booking" ? (
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[.85fr_1.6fr] md:px-8 md:py-14">
          <aside className="self-start rounded-3xl bg-[#102f55] p-7 text-white shadow-[0_20px_60px_rgba(16,47,85,.18)] md:sticky md:top-8 md:p-9">
            <img src="/area-logo.png" alt="AREA Estudio Contable" className="mb-7 w-full max-w-[230px] object-contain" />
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
              {days.map((item) => <button type="button" key={item.iso} onClick={() => { setDay(item.iso); setTime(""); }} aria-pressed={day === item.iso} className={`rounded-2xl border px-1 py-3 transition ${day === item.iso ? "border-[#173f70] bg-[#173f70] text-white shadow-md" : "border-[#d8e0e9] text-[#52606f] hover:border-[#7b9abe]"}`}><span className="block text-[11px] font-bold tracking-wider">{item.short}</span><span className="mt-1 block text-xl font-semibold">{item.number}</span></button>)}
            </div>
            <div className="mt-8 border-t border-[#e4ebe8] pt-7">
              <h3 className="font-semibold">Horarios disponibles · {dayLabel}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {TIME_SLOTS.map((slot) => <button type="button" key={slot} onClick={() => setTime(slot)} aria-pressed={time === slot} className={`rounded-xl border px-4 py-3 text-base font-semibold transition ${time === slot ? "border-[#173f70] bg-[#e7f0fa] text-[#173f70] ring-2 ring-[#173f70]/15" : "border-[#d9e1ea] hover:border-[#7b9abe] hover:bg-[#f5f8fc]"}`}>{slot}</button>)}
              </div>
            </div>
            <Button disabled={!time} onClick={() => { setConfirmed(false); setCreateError(null); setOpen(true); }} className="mt-8 h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55] disabled:bg-[#b9c4d1]">Continuar con la reserva</Button>
            <p className="mt-4 text-center text-xs text-[#75847f]">Tus datos se utilizan solamente para gestionar el turno.</p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-14">
          <div className="mb-7">
            <p className="text-sm font-semibold text-[#173f70]">ADMINISTRAR MI TURNO</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Buscá tu consulta</h1>
            <p className="mt-2 text-[#687871]">Ingresá el email y el WhatsApp con los que reservaste para ver, reprogramar o cancelar tu turno.</p>
          </div>

          <form onSubmit={findMyBooking} className="grid gap-4 rounded-3xl border border-[#dbe6e1] bg-white p-6 shadow-[0_16px_50px_rgba(20,58,47,.08)] sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-8">
            <label className="block text-sm font-semibold">Email
              <Input required type="email" value={manageEmail} onChange={(event) => setManageEmail(event.target.value)} className="mt-2 h-11 rounded-xl" placeholder="nombre@email.com" />
            </label>
            <label className="block text-sm font-semibold">WhatsApp
              <Input required value={manageWhatsapp} onChange={(event) => setManageWhatsapp(event.target.value)} className="mt-2 h-11 rounded-xl" placeholder="Ej: 2345 43-8544" />
            </label>
            <Button disabled={manageLoading} className="h-11 rounded-xl bg-[#173f70] hover:bg-[#102f55]">{manageLoading ? "Buscando…" : "Buscar mi turno"}</Button>
          </form>

          {manageError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{manageError}</p>}
          {manageNotice && <p className="mt-4 rounded-xl bg-[#e7f0fa] px-4 py-3 text-sm text-[#173f70]">{manageNotice}</p>}

          {manageBooking && (
            <div className="mt-6 rounded-3xl border border-[#d8e1ea] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{manageBooking.date} · {manageBooking.time}</p>
                  <p className="text-sm text-[#6d7680]">{manageBooking.name} · {manageBooking.email}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${manageBooking.status === "Confirmado" ? "bg-[#e7f0fa] text-[#173f70]" : "bg-[#f3f0e8] text-[#7a6a3d]"}`}>{manageBooking.status}</span>
              </div>

              {manageBooking.status === "Confirmado" && (
                <div className="mt-6 space-y-6 border-t border-[#e4ebe8] pt-6">
                  <Button type="button" variant="outline" disabled={cancelling} onClick={cancelMyBooking} className="rounded-xl">{cancelling ? "Cancelando…" : "Cancelar turno"}</Button>

                  <div>
                    <h3 className="font-semibold">Reprogramar</h3>
                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {days.map((item) => <button type="button" key={item.iso} onClick={() => { setRescheduleDay(item.iso); setRescheduleTime(""); }} aria-pressed={rescheduleDay === item.iso} className={`rounded-xl border px-1 py-2 text-xs font-semibold transition ${rescheduleDay === item.iso ? "border-[#173f70] bg-[#173f70] text-white" : "border-[#d8e0e9] text-[#52606f] hover:border-[#7b9abe]"}`}>{item.short} {item.number}</button>)}
                    </div>
                    {rescheduleDay && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {TIME_SLOTS.map((slot) => <button type="button" key={slot} onClick={() => setRescheduleTime(slot)} aria-pressed={rescheduleTime === slot} className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${rescheduleTime === slot ? "border-[#173f70] bg-[#e7f0fa] text-[#173f70]" : "border-[#d9e1ea] hover:border-[#7b9abe]"}`}>{slot}</button>)}
                      </div>
                    )}
                    <Button type="button" disabled={!rescheduleDay || !rescheduleTime || rescheduling} onClick={rescheduleMyBooking} className="mt-4 h-11 rounded-xl bg-[#173f70] hover:bg-[#102f55]">{rescheduling ? "Reprogramando…" : "Confirmar nuevo horario"}</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-3xl sm:max-w-md">{!confirmed ? <><DialogHeader><DialogTitle className="text-2xl">Completá tus datos</DialogTitle><DialogDescription>Consulta presencial el {dayLabel.toLowerCase()} a las {time}. La confirmación es automática.</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={submitBooking}><label className="block text-sm font-semibold">Nombre y apellido<Input name="name" required className="mt-2 h-11 rounded-xl" placeholder="Ej: Manuela Gómez" /></label><label className="block text-sm font-semibold">WhatsApp<Input name="whatsapp" required className="mt-2 h-11 rounded-xl" placeholder="Ej: 2345 43-8544" /></label><label className="block text-sm font-semibold">Email<Input name="email" required type="email" className="mt-2 h-11 rounded-xl" placeholder="nombre@email.com" /></label><label className="block text-sm font-semibold">Observaciones<Input name="notes" className="mt-2 h-11 rounded-xl" placeholder="Contanos brevemente el motivo de consulta" /></label>{createError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</p>}<Button disabled={creating} className="h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55]">{creating ? "Confirmando…" : "Confirmar consulta"}</Button></form></> : <div className="py-5 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5effa] text-[#173f70]"><Check size={30} /></span><DialogTitle className="mt-5 text-2xl">¡Consulta confirmada!</DialogTitle><DialogDescription className="mx-auto mt-2 max-w-xs text-base">Te esperamos el {dayLabel.toLowerCase()} a las {time} en Av. M. Cabral 3009. Guardá el enlace para reprogramar o cancelar hasta una hora antes.</DialogDescription><Button onClick={() => setOpen(false)} className="mt-6 h-11 w-full rounded-xl bg-[#173f70] hover:bg-[#102f55]">Listo</Button></div>}</DialogContent></Dialog>
    </main>
  );
}
