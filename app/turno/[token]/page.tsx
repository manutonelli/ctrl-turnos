"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Booking = { date: string; time: string; name: string; status: string };

export default function ManageBooking({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/turnos?action=get&token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Turno no encontrado");
        setBooking(data.booking);
      })
      .catch((reason) => setError(reason.message));
  }, [token]);

  async function cancel() {
    if (!confirm("¿Querés cancelar esta consulta?")) return;
    const response = await fetch("/api/turnos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", token }),
    });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setBooking(data.booking);
    setMessage("La consulta fue cancelada.");
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-7 text-[var(--text)] sm:px-5 sm:py-12">
      <section className="mx-auto max-w-[680px] rounded-[22px] bg-white p-5 shadow-[0_18px_50px_rgba(16,47,85,.07)] sm:rounded-[28px] sm:p-10">
        <p className="text-xs font-medium tracking-[.12em] text-[var(--text-faint)]">
          AREA ESTUDIO CONTABLE
        </p>
        <h1 className="mt-3 text-[30px] font-medium tracking-[-.025em] sm:text-[36px]">
          Administrar mi turno
        </h1>
        {error && (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
        )}
        {message && (
          <p className="mt-6 rounded-xl bg-blue-50 p-4 text-[#173f70]">
            {message}
          </p>
        )}
        {!booking && !error && (
          <p className="mt-6 text-[#687381]">Cargando turno…</p>
        )}
        {booking && (
          <div className="mt-8 space-y-6">
            <div className="rounded-[24px] border border-[var(--border)] p-6">
              <p className="text-[15px] text-[var(--text-muted)]">
                {booking.date}
              </p>
              <p className="mt-1 text-[30px] font-medium">{booking.time}</p>
              <p className="mt-2 text-[var(--text-muted)]">
                {booking.name} · Consulta contable
              </p>
              <p className="mt-4 inline-flex rounded-full bg-[var(--selected-bg)] px-3 py-1 text-sm text-[var(--brand)]">
                {booking.status}
              </p>
            </div>
            {booking.status === "Confirmado" && (
              <div className="grid gap-3 sm:flex sm:flex-wrap">
                <Button
                  asChild
                  variant="outline"
                  className="h-11 w-full rounded-full border-[var(--border)] px-6 sm:w-auto"
                >
                  <a href={`/?reprogramar=${token}`}>Reprogramar</a>
                </Button>
                <button
                  className="min-h-10 w-full px-3 font-medium text-[#9a4046] sm:w-auto"
                  onClick={cancel}
                >
                  Cancelar turno
                </button>
              </div>
            )}
            <p className="text-sm text-[var(--text-muted)]">
              Podés reprogramar o cancelar hasta una hora antes.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
