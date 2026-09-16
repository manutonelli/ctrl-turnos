"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Clock3, LockKeyhole, MapPin, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const days = [
  { short: "LUN", number: "21", label: "Lunes 21" },
  { short: "MAR", number: "22", label: "Martes 22" },
  { short: "MIÉ", number: "23", label: "Miércoles 23" },
  { short: "JUE", number: "24", label: "Jueves 24" },
  { short: "VIE", number: "25", label: "Viernes 25" },
];

const times: Record<string, string[]> = {
  "Lunes 21": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"],
  "Martes 22": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"],
  "Miércoles 23": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"],
  "Jueves 24": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"],
  "Viernes 25": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"],
};

const bookings = [
  ["09:00", "Lucía Fernández", "11 3481-2290"],
  ["10:30", "Camila Ríos", "11 6028-1143"],
  ["12:00", "Martina Suárez", "11 4560-7812"],
];

export default function Home() {
  const [admin, setAdmin] = useState(false);
  const [day, setDay] = useState(days[0].label);
  const [time, setTime] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

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
        if (!value.day || !days.some((item) => item.label === value.day) || !value.time || !times[value.day]?.includes(value.time)) throw new Error("El día u horario no está disponible.");
        setAdmin(false); setDay(value.day); setTime(value.time); setConfirmed(false); setOpen(true);
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
        const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "find", email: value.email, whatsapp: value.whatsapp }) });
        const data = await response.json() as { ok?: boolean; error?: string; booking?: unknown };
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
        const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", token: value.token }) });
        const data = await response.json() as { ok?: boolean; error?: string; booking?: unknown };
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
        const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reschedule", token: value.token, date: value.date, time: value.time }) });
        const data = await response.json() as { ok?: boolean; error?: string; booking?: unknown };
        if (!data.ok) throw new Error(data.error || "No pudimos reprogramar el turno.");
        return { status: "rescheduled", booking: data.booking };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
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
          <Button variant="outline" className="rounded-xl border-[#cfddd7]" onClick={() => setAdmin(!admin)}>
            {admin ? <ChevronLeft /> : <LockKeyhole />}{admin ? "Volver" : "Administrar"}
          </Button>
        </div>
      </header>

      {!admin ? (
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
              {days.map((item) => <button key={item.label} onClick={() => { setDay(item.label); setTime(""); }} aria-pressed={day === item.label} className={`rounded-2xl border px-1 py-3 transition ${day === item.label ? "border-[#173f70] bg-[#173f70] text-white shadow-md" : "border-[#d8e0e9] text-[#52606f] hover:border-[#7b9abe]"}`}><span className="block text-[11px] font-bold tracking-wider">{item.short}</span><span className="mt-1 block text-xl font-semibold">{item.number}</span></button>)}
            </div>
            <div className="mt-8 border-t border-[#e4ebe8] pt-7">
              <h3 className="font-semibold">Horarios disponibles · {day}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {times[day].map((slot) => <button key={slot} onClick={() => setTime(slot)} aria-pressed={time === slot} className={`rounded-xl border px-4 py-3 text-base font-semibold transition ${time === slot ? "border-[#173f70] bg-[#e7f0fa] text-[#173f70] ring-2 ring-[#173f70]/15" : "border-[#d9e1ea] hover:border-[#7b9abe] hover:bg-[#f5f8fc]"}`}>{slot}</button>)}
              </div>
            </div>
            <Button disabled={!time} onClick={() => { setConfirmed(false); setOpen(true); }} className="mt-8 h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55] disabled:bg-[#b9c4d1]">Continuar con la reserva</Button>
            <p className="mt-4 text-center text-xs text-[#75847f]">Tus datos se utilizan solamente para gestionar el turno.</p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[#173f70]">PANEL ADMINISTRATIVO</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Agenda de AREA</h1></div><Button className="rounded-xl bg-[#173f70] hover:bg-[#102f55]"><Plus /> Bloquear horario</Button></div>
          <Tabs defaultValue="agenda">
            <TabsList className="mb-5 rounded-xl bg-[#e2ebe7] p-1"><TabsTrigger value="agenda">Agenda</TabsTrigger><TabsTrigger value="horarios">Días y horarios</TabsTrigger><TabsTrigger value="config"><Settings2 /> Configuración</TabsTrigger></TabsList>
            <TabsContent value="agenda"><div className="overflow-hidden rounded-3xl border border-[#d8e1ea] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-[#e3e9ef] p-5 sm:p-6"><div><h2 className="text-xl font-semibold">Lunes 21 de septiembre</h2><p className="mt-1 text-sm text-[#6e7781]">3 consultas · 5 horarios libres</p></div><span className="rounded-full bg-[#e7f0fa] px-3 py-1 text-sm font-semibold text-[#173f70]">Abierto</span></div><div className="divide-y divide-[#e8edf2]">{bookings.map(([hour, name, phone]) => <div key={hour} className="grid gap-3 p-5 sm:grid-cols-[90px_1fr_auto] sm:items-center sm:px-6"><strong className="text-lg">{hour}</strong><div><p className="font-semibold">{name}</p><p className="text-sm text-[#6d7680]">{phone}</p></div><Button variant="outline" className="w-fit rounded-xl">Ver consulta</Button></div>)}</div></div></TabsContent>
            <TabsContent value="horarios"><div className="rounded-3xl border border-[#d8e4df] bg-white p-8"><h2 className="text-xl font-semibold">Disponibilidad semanal</h2><p className="mt-2 text-[#687871]">Habilitá fechas y agregá o bloqueá horarios puntuales.</p></div></TabsContent>
            <TabsContent value="config"><div className="rounded-3xl border border-[#d8e4df] bg-white p-8"><h2 className="text-xl font-semibold">Datos del negocio</h2><p className="mt-2 text-[#687871]">Configurá el nombre, contacto, duración de los turnos y políticas de cancelación.</p></div></TabsContent>
          </Tabs>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-3xl sm:max-w-md">{!confirmed ? <><DialogHeader><DialogTitle className="text-2xl">Completá tus datos</DialogTitle><DialogDescription>Consulta presencial el {day.toLowerCase()} a las {time}. La confirmación es automática.</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold">Nombre y apellido<Input required className="mt-2 h-11 rounded-xl" placeholder="Ej: Manuela Gómez" /></label><label className="block text-sm font-semibold">WhatsApp<Input required className="mt-2 h-11 rounded-xl" placeholder="Ej: 2345 43-8544" /></label><label className="block text-sm font-semibold">Email<Input required type="email" className="mt-2 h-11 rounded-xl" placeholder="nombre@email.com" /></label><label className="block text-sm font-semibold">Observaciones<Input className="mt-2 h-11 rounded-xl" placeholder="Contanos brevemente el motivo de consulta" /></label><Button className="h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55]">Confirmar consulta</Button></form></> : <div className="py-5 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5effa] text-[#173f70]"><Check size={30} /></span><DialogTitle className="mt-5 text-2xl">¡Consulta confirmada!</DialogTitle><DialogDescription className="mx-auto mt-2 max-w-xs text-base">Te esperamos el {day.toLowerCase()} a las {time} en Av. M. Cabral 3009. Guardá el enlace para reprogramar o cancelar hasta una hora antes.</DialogDescription><Button onClick={() => setOpen(false)} className="mt-6 h-11 w-full rounded-xl bg-[#173f70] hover:bg-[#102f55]">Listo</Button></div>}</DialogContent></Dialog>
    </main>
  );
}