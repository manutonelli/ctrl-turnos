"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Clock3, LockKeyhole, Plus, Scissors, Settings2 } from "lucide-react";
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
  "Lunes 21": ["09:00", "10:30", "12:00", "15:30", "17:00"],
  "Martes 22": ["08:30", "11:00", "14:00", "16:30", "18:00"],
  "Miércoles 23": ["09:30", "12:30", "15:00", "17:30"],
  "Jueves 24": ["08:00", "10:00", "13:30", "16:00", "18:30"],
  "Viernes 25": ["09:00", "11:30", "14:30", "17:00"],
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
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b6b50] text-white"><Scissors size={19} /></span>
            <span><strong className="block text-[17px] leading-tight">Estudio Oliva</strong><small className="text-sm text-[#63736d]">Impulsado por Ctrl Turnos</small></span>
          </button>
          <Button variant="outline" className="rounded-xl border-[#cfddd7]" onClick={() => setAdmin(!admin)}>
            {admin ? <ChevronLeft /> : <LockKeyhole />}{admin ? "Volver" : "Administrar"}
          </Button>
        </div>
      </header>

      {!admin ? (
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[.85fr_1.6fr] md:px-8 md:py-14">
          <aside className="self-start rounded-3xl bg-[#123e32] p-7 text-white shadow-[0_20px_60px_rgba(20,58,47,.16)] md:sticky md:top-8 md:p-9">
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[.14em] text-[#bce8da]">Agenda septiembre</span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-.04em]">Elegí un horario. Nosotros te esperamos.</h1>
            <p className="mt-4 text-base leading-7 text-[#c9ddd6]">Reservá en menos de un minuto, sin registrarte ni esperar una respuesta.</p>
            <div className="mt-9 space-y-4 border-t border-white/15 pt-6 text-sm text-[#d8e8e2]">
              <p className="flex items-center gap-3"><Clock3 size={18} className="text-[#75d6b8]" /> Duración aproximada: 60 minutos</p>
              <p className="flex items-center gap-3"><CalendarDays size={18} className="text-[#75d6b8]" /> Reprogramá o cancelá desde tu enlace</p>
            </div>
          </aside>

          <div className="rounded-3xl border border-[#dbe6e1] bg-white p-5 shadow-[0_16px_50px_rgba(20,58,47,.08)] sm:p-8">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-sm font-semibold text-[#0b6b50]">RESERVA ONLINE</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Seleccioná día y horario</h2></div>
              <span className="hidden rounded-full bg-[#eef7f3] px-3 py-1.5 text-sm font-medium text-[#0b6b50] sm:block">19 horarios libres</span>
            </div>
            <div className="mt-7 grid grid-cols-5 gap-2" aria-label="Días disponibles">
              {days.map((item) => <button key={item.label} onClick={() => { setDay(item.label); setTime(""); }} aria-pressed={day === item.label} className={`rounded-2xl border px-1 py-3 transition ${day === item.label ? "border-[#0b6b50] bg-[#0b6b50] text-white shadow-md" : "border-[#dce7e2] text-[#52645d] hover:border-[#82ae9f]"}`}><span className="block text-[11px] font-bold tracking-wider">{item.short}</span><span className="mt-1 block text-xl font-semibold">{item.number}</span></button>)}
            </div>
            <div className="mt-8 border-t border-[#e4ebe8] pt-7">
              <h3 className="font-semibold">Horarios disponibles · {day}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {times[day].map((slot) => <button key={slot} onClick={() => setTime(slot)} aria-pressed={time === slot} className={`rounded-xl border px-4 py-3 text-base font-semibold transition ${time === slot ? "border-[#0b6b50] bg-[#e2f3ed] text-[#075a43] ring-2 ring-[#0b6b50]/15" : "border-[#d9e4df] hover:border-[#68a38f] hover:bg-[#f5faf8]"}`}>{slot}</button>)}
              </div>
            </div>
            <Button disabled={!time} onClick={() => { setConfirmed(false); setOpen(true); }} className="mt-8 h-12 w-full rounded-xl bg-[#0b6b50] text-base hover:bg-[#075a43] disabled:bg-[#b8c7c1]">Continuar con la reserva</Button>
            <p className="mt-4 text-center text-xs text-[#75847f]">Tus datos se utilizan solamente para gestionar el turno.</p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[#0b6b50]">PANEL ADMINISTRATIVO</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Agenda del negocio</h1></div><Button className="rounded-xl bg-[#0b6b50] hover:bg-[#075a43]"><Plus /> Cargar disponibilidad</Button></div>
          <Tabs defaultValue="agenda">
            <TabsList className="mb-5 rounded-xl bg-[#e2ebe7] p-1"><TabsTrigger value="agenda">Agenda</TabsTrigger><TabsTrigger value="horarios">Días y horarios</TabsTrigger><TabsTrigger value="config"><Settings2 /> Configuración</TabsTrigger></TabsList>
            <TabsContent value="agenda"><div className="overflow-hidden rounded-3xl border border-[#d8e4df] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-[#e3ebe7] p-5 sm:p-6"><div><h2 className="text-xl font-semibold">Lunes 21 de septiembre</h2><p className="mt-1 text-sm text-[#6e7c77]">3 reservas · 2 horarios libres</p></div><span className="rounded-full bg-[#e3f4ed] px-3 py-1 text-sm font-semibold text-[#0b6b50]">Abierto</span></div><div className="divide-y divide-[#e8eeeb]">{bookings.map(([hour, name, phone]) => <div key={hour} className="grid gap-3 p-5 sm:grid-cols-[90px_1fr_auto] sm:items-center sm:px-6"><strong className="text-lg">{hour}</strong><div><p className="font-semibold">{name}</p><p className="text-sm text-[#6d7c76]">{phone}</p></div><Button variant="outline" className="w-fit rounded-xl">Ver turno</Button></div>)}</div></div></TabsContent>
            <TabsContent value="horarios"><div className="rounded-3xl border border-[#d8e4df] bg-white p-8"><h2 className="text-xl font-semibold">Disponibilidad semanal</h2><p className="mt-2 text-[#687871]">Habilitá fechas y agregá o bloqueá horarios puntuales.</p></div></TabsContent>
            <TabsContent value="config"><div className="rounded-3xl border border-[#d8e4df] bg-white p-8"><h2 className="text-xl font-semibold">Datos del negocio</h2><p className="mt-2 text-[#687871]">Configurá el nombre, contacto, duración de los turnos y políticas de cancelación.</p></div></TabsContent>
          </Tabs>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-3xl sm:max-w-md">{!confirmed ? <><DialogHeader><DialogTitle className="text-2xl">Completá tus datos</DialogTitle><DialogDescription>{day} a las {time}. Vas a recibir un enlace para administrar tu turno.</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold">Nombre y apellido<Input required className="mt-2 h-11 rounded-xl" placeholder="Ej: Manuela Gómez" /></label><label className="block text-sm font-semibold">WhatsApp<Input required className="mt-2 h-11 rounded-xl" placeholder="Ej: 11 2345 6789" /></label><label className="block text-sm font-semibold">Email <span className="font-normal text-[#718079]">(opcional)</span><Input type="email" className="mt-2 h-11 rounded-xl" placeholder="nombre@email.com" /></label><Button className="h-12 w-full rounded-xl bg-[#0b6b50] text-base hover:bg-[#075a43]">Confirmar turno</Button></form></> : <div className="py-5 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#dff3eb] text-[#0b6b50]"><Check size={30} /></span><DialogTitle className="mt-5 text-2xl">¡Turno confirmado!</DialogTitle><DialogDescription className="mx-auto mt-2 max-w-xs text-base">Tu reserva es el {day.toLowerCase()} a las {time}. Guardá el enlace que te enviamos para reprogramar o cancelar.</DialogDescription><Button onClick={() => setOpen(false)} className="mt-6 h-11 w-full rounded-xl bg-[#0b6b50] hover:bg-[#075a43]">Listo</Button></div>}</DialogContent></Dialog>
    </main>
  );
}
