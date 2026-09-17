"use client";

import { FormEvent, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Booking = { token: string; date: string; time: string; name: string; status: string };

function friendlyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function MyBookingsPanel() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function cancel(token: string) {
    if (!confirm("¿Querés cancelar esta consulta?")) return;
    setError("");
    const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", token }) });
    const data = await response.json();
    if (!data.ok) { setError(data.error || "No pudimos cancelar el turno"); return; }
    setBookings((current) => current.filter((booking) => booking.token !== token));
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/turnos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lookup", email: form.get("email"), whatsapp: form.get("whatsapp") }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "No pudimos buscar tus turnos");
      setBookings(data.bookings || []);
      setSearched(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos buscar tus turnos");
    } finally {
      setLoading(false);
    }
  }

  return <section className="mx-auto max-w-xl px-5 py-10">
    <div className="rounded-3xl border border-[#d8e1ea] bg-white p-7 shadow-sm sm:p-10">
      <p className="text-sm font-semibold text-[#173f70]">AREA ESTUDIO CONTABLE</p>
      <h1 className="mt-2 text-3xl font-semibold">Administrar mi turno</h1>
      <p className="mt-3 text-[#687381]">Ingresá los mismos datos que usaste al reservar.</p>
      <form className="mt-7 space-y-4" onSubmit={lookup}>
        <label className="block text-sm font-semibold">Email<Input name="email" required type="email" autoComplete="email" className="mt-2 h-11 rounded-xl" placeholder="nombre@email.com" /></label>
        <label className="block text-sm font-semibold">WhatsApp<Input name="whatsapp" required inputMode="tel" autoComplete="tel" className="mt-2 h-11 rounded-xl" placeholder="Ej: 2345 43-8544" /></label>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button disabled={loading} className="h-12 w-full rounded-xl bg-[#173f70] text-base hover:bg-[#102f55]"><Search />{loading ? "Buscando…" : "Buscar mis turnos"}</Button>
      </form>
      {searched && <div className="mt-8 border-t border-[#e3e9ef] pt-7">
        <h2 className="font-semibold">Tus próximos turnos</h2>
        {bookings.length === 0 ? <p className="mt-3 rounded-2xl bg-[#f3f6fa] p-4 text-sm text-[#687381]">No encontramos turnos activos con esos datos.</p> : <div className="mt-4 space-y-3">{bookings.map((booking) => <div key={booking.token} className="rounded-2xl border border-[#d8e1ea] p-4"><div className="flex items-center gap-3"><CalendarDays className="text-[#173f70]" /><span><strong className="block">{friendlyDate(booking.date)} · {booking.time}</strong><small className="mt-1 block text-[#687381]">{booking.name}</small></span></div><div className="mt-4 grid grid-cols-2 gap-2"><Button asChild variant="outline" className="rounded-xl"><a href={`/?reprogramar=${booking.token}`}>Reprogramar</a></Button><Button type="button" variant="destructive" className="rounded-xl" onClick={() => cancel(booking.token)}>Cancelar</Button></div></div>)}</div>}
      </div>}
    </div>
  </section>;
}
