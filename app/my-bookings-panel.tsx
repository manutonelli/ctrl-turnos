"use client";

import { FormEvent, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Booking = {
  token: string;
  date: string;
  time: string;
  name: string;
  status: string;
};

function friendlyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
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
    const response = await fetch("/api/turnos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", token }),
    });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "No pudimos cancelar el turno");
      return;
    }
    setBookings((current) =>
      current.filter((booking) => booking.token !== token),
    );
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
        body: JSON.stringify({
          action: "lookup",
          email: form.get("email"),
          whatsapp: form.get("whatsapp"),
        }),
      });
      const data = await response.json();
      if (!data.ok)
        throw new Error(data.error || "No pudimos buscar tus turnos");
      setBookings(data.bookings || []);
      setSearched(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No pudimos buscar tus turnos",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-[760px] px-4 py-7 sm:px-5 sm:py-16">
      <div className="rounded-[22px] bg-white p-5 shadow-[0_18px_50px_rgba(16,47,85,.07)] sm:rounded-[28px] sm:p-10">
        <h1 className="text-[30px] font-medium tracking-[-.025em] sm:text-[36px]">
          Administrar mi turno
        </h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Ingresá los mismos datos que usaste al reservar.
        </p>
        <form className="mt-7 space-y-4" onSubmit={lookup}>
          <label className="block text-sm font-semibold">
            Email
            <Input
              name="email"
              required
              type="email"
              autoComplete="email"
              className="mt-2 h-11 rounded-xl"
              placeholder="nombre@email.com"
            />
          </label>
          <label className="block text-sm font-semibold">
            WhatsApp
            <Input
              name="whatsapp"
              required
              inputMode="tel"
              autoComplete="tel"
              className="mt-2 h-11 rounded-xl"
              placeholder="Ej: 2345 43-8544"
            />
          </label>
          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button
            disabled={loading}
            className="h-12 w-full rounded-full bg-[var(--brand)] text-base hover:bg-[var(--brand-hover)]"
          >
            <Search />
            {loading ? "Buscando…" : "Buscar mis turnos"}
          </Button>
        </form>
        {searched && (
          <div className="mt-8 border-t border-[#e3e9ef] pt-7">
            <h2 className="font-semibold">Tus próximos turnos</h2>
            {bookings.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]">
                No encontramos turnos activos con esos datos.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {bookings.map((booking) => (
                  <div
                    key={booking.token}
                    className="rounded-[24px] border border-[var(--border)] p-5"
                  >
                    <p className="text-[15px] text-[var(--text-muted)]">
                      {friendlyDate(booking.date)}
                    </p>
                    <strong className="mt-1 block text-[30px] font-medium">
                      {booking.time}
                    </strong>
                    <p className="mt-1 text-[var(--text-muted)]">
                      {booking.name} · Consulta contable
                    </p>
                    <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
                      <Button
                        asChild
                        variant="outline"
                        className="w-full rounded-full border-[var(--border)] px-6 sm:w-auto"
                      >
                        <a href={`/?reprogramar=${booking.token}`}>
                          Reprogramar
                        </a>
                      </Button>
                      <button
                        type="button"
                        className="min-h-10 w-full px-3 font-medium text-[#9a4046] sm:w-auto"
                        onClick={() => cancel(booking.token)}
                      >
                        Cancelar turno
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
