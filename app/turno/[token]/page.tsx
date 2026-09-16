"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Booking = { date: string; time: string; name: string; status: string };

export default function ManageBooking({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/turnos?action=get&token=${encodeURIComponent(token)}`).then((r) => r.json()).then((data) => {
      if (!data.ok) throw new Error(data.error || "Turno no encontrado");
      setBooking(data.booking);
    }).catch((reason) => setError(reason.message));
  }, [token]);

  async function cancel() {
    if (!confirm("¿Querés cancelar esta consulta?")) return;
    const response = await fetch("/api/turnos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", token }) });
    const data = await response.json();
    if (!data.ok) { setError(data.error); return; }
    setBooking(data.booking); setMessage("La consulta fue cancelada.");
  }

  return <main className="min-h-screen bg-[#f3f6fa] px-5 py-12 text-[#142438]">
    <section className="mx-auto max-w-xl rounded-3xl border border-[#d8e1ea] bg-white p-7 shadow-sm sm:p-10">
      <p className="text-sm font-semibold text-[#173f70]">AREA ESTUDIO CONTABLE</p>
      <h1 className="mt-2 text-3xl font-semibold">Administrar consulta</h1>
      {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {message && <p className="mt-6 rounded-xl bg-blue-50 p-4 text-[#173f70]">{message}</p>}
      {!booking && !error && <p className="mt-6 text-[#687381]">Cargando turno…</p>}
      {booking && <div className="mt-7 space-y-5">
        <div className="rounded-2xl bg-[#edf4fb] p-5"><p className="text-sm text-[#687381]">Titular</p><p className="font-semibold">{booking.name}</p><p className="mt-4 text-sm text-[#687381]">Fecha y hora</p><p className="font-semibold">{booking.date} · {booking.time}</p><p className="mt-4 text-sm text-[#687381]">Estado</p><p className="font-semibold">{booking.status}</p></div>
        {booking.status === "Confirmado" && <div className="grid gap-3 sm:grid-cols-2"><Button asChild variant="outline" className="h-11 rounded-xl"><a href={`/?reprogramar=${token}`}>Reprogramar</a></Button><Button variant="destructive" className="h-11 rounded-xl" onClick={cancel}>Cancelar consulta</Button></div>}
        <p className="text-sm text-[#687381]">Los cambios están disponibles hasta una hora antes del turno.</p>
      </div>}
    </section>
  </main>;
}
