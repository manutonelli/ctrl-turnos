"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MyBookingsPanel } from "./my-bookings-panel";
import { AdminPanel } from "./admin-panel";
import { CtrlTurnosBrand } from "./ctrl-turnos-brand";

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function businessDays(weekOffset = 0) {
  const result: Array<{
    short: string;
    number: string;
    label: string;
    date: string;
  }> = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() + weekOffset * 7);
  while (result.length < 5) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) {
      const weekday = new Intl.DateTimeFormat("es-AR", {
        weekday: "long",
      }).format(cursor);
      result.push({
        short: weekday.slice(0, 3).toUpperCase(),
        number: String(cursor.getDate()),
        label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${cursor.getDate()}`,
        date: isoDate(cursor),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
const initialDays = businessDays();
type Service = {
  id: string;
  name: string;
  duration: number;
  price?: string;
  active: boolean;
};
type Business = {
  name: string;
  address: string;
  welcome: string;
  advanceWeeks: string;
};

function BrandHeader({
  onHome,
  onManage,
  businessName = "AREA Estudio Contable",
}: {
  onHome: () => void;
  onManage: () => void;
  businessName?: string;
}) {
  return (
    <header className="flex items-center justify-between">
      <button className="flex items-center gap-3 text-left" onClick={onHome}>
        <span
          role="img"
          aria-label={businessName}
          className="block h-14 w-28 bg-[var(--brand)] sm:h-20 sm:w-44"
          style={{
            WebkitMaskImage: "url(/area-logo.png)",
            WebkitMaskPosition: "center",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            maskImage: "url(/area-logo.png)",
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskSize: "contain",
          }}
        />
      </button>
      <button
        onClick={onManage}
        className="text-sm font-medium text-[var(--brand)] underline-offset-4 hover:underline"
      >
        Mi turno
      </button>
    </header>
  );
}

export default function Home() {
  const [manage, setManage] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => businessDays(weekOffset), [weekOffset]);
  const [day, setDay] = useState(initialDays[0].date);
  const [time, setTime] = useState("");
  const [step, setStep] = useState<"slots" | "data" | "confirmed">("slots");
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingToken, setBookingToken] = useState("");
  const [reprogramToken, setReprogramToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationStatus, setConfirmationStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [business, setBusiness] = useState<Business>({
    name: "AREA Estudio Contable",
    address: "Av. M. Cabral 3009, Saladillo",
    welcome: "Reservá tu consulta",
    advanceWeeks: "12",
  });
  const [services, setServices] = useState<Service[]>([
    { id: "consulta", name: "Consulta contable", duration: 30, active: true },
  ]);
  const [serviceId, setServiceId] = useState("consulta");
  const selectedService =
    services.find((item) => item.id === serviceId) || services[0];
  const maxWeekOffset = Math.max(
    0,
    Number.parseInt(business.advanceWeeks || "12", 10) - 1,
  );
  const selectedDay = days.find((item) => item.date === day) ?? days[0];
  const times = useMemo(
    () =>
      Array.from(available)
        .filter((key) => key.startsWith(`${day}|`))
        .map((key) => key.split("|")[1])
        .sort(),
    [available, day],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setManage(query.get("administrar") === "1");
    setAdmin(query.get("admin") === "1");
    setReprogramToken(query.get("reprogramar") || "");
    fetch("/api/turnos?action=config")
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) return;
        setBusiness(data.business);
        const active = (data.services || []).filter(
          (item: Service) => item.active,
        );
        if (active.length) {
          setServices(active);
          setServiceId(active[0].id);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    setTime("");
    fetch(
      `/api/turnos?${new URLSearchParams({ action: "slots", from: days[0].date, to: days[days.length - 1].date, duration: String(selectedService?.duration || 30) })}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        const slots = (data.slots || []) as Array<{
          date: string;
          time: string;
        }>;
        setAvailable(new Set(slots.map((slot) => `${slot.date}|${slot.time}`)));
        const firstAvailableDay = days.find((item) =>
          slots.some((slot) => slot.date === item.date),
        );
        setDay(firstAvailableDay?.date || days[0].date);
      })
      .catch((reason) =>
        setError(reason.message || "No pudimos cargar la agenda"),
      )
      .finally(() => setLoading(false));
  }, [days, selectedService?.duration]);

  function goHome() {
    setManage(false);
    setAdmin(false);
    setStep("slots");
    window.history.replaceState({}, "", "/");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    setConfirmationStatus("pending");
    setStep("confirmed");
    const form = new FormData(event.currentTarget);
    try {
      const payload = reprogramToken
        ? { action: "reschedule", token: reprogramToken, date: day, time }
        : {
            action: "create",
            booking: {
              date: day,
              time,
              name: form.get("name"),
              whatsapp: form.get("whatsapp"),
              email: form.get("email"),
              notes: form.get("notes"),
              service: selectedService.name,
              duration: selectedService.duration,
            },
          };
      const response = await fetch("/api/turnos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "No pudimos confirmar la consulta");
        setConfirmationStatus("error");
        return;
      }
      setBookingToken(data.booking.token || reprogramToken);
      setAvailable((current) => {
        const next = new Set(current);
        next.delete(`${day}|${time}`);
        return next;
      });
      setConfirmationStatus("success");
    } catch {
      setError(
        "No pudimos confirmar la consulta. Revisá tu conexión e intentá nuevamente.",
      );
      setConfirmationStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  if (admin)
    return (
      <main className="min-h-screen bg-[var(--page-bg)] text-[var(--text)]">
        <div className="mx-auto max-w-[1180px] px-5 py-6">
          <BrandHeader
            onHome={goHome}
            onManage={() => {
              setAdmin(false);
              setManage(true);
            }}
          />
        </div>
        <AdminPanel />
      </main>
    );
  if (manage)
    return (
      <main className="min-h-screen bg-[var(--page-bg)] text-[var(--text)]">
        <div className="mx-auto max-w-[900px] px-5 py-6">
          <BrandHeader onHome={goHome} onManage={goHome} />
        </div>
        <MyBookingsPanel />
      </main>
    );

  return (
    <main className="min-h-screen bg-[var(--page-bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[900px] px-4 pb-12 pt-4 sm:px-6 sm:pb-20 sm:pt-8">
        <BrandHeader
          businessName={business.name}
          onHome={goHome}
          onManage={() => {
            setManage(true);
            window.history.replaceState({}, "", "/?administrar=1");
          }}
        />
        {step === "slots" && (
          <section className="pt-8 sm:pt-16">
            <h1 className="text-[30px] font-medium leading-[1.14] tracking-[-.025em] sm:text-[40px]">
              {business.welcome}
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-7 text-[var(--text-muted)] sm:text-[17px]">
              Elegí el servicio, día y horario. Atención en {business.address}.
              La confirmación es inmediata.
            </p>
            <div className="mt-7 rounded-[22px] bg-white p-4 shadow-[0_12px_35px_rgba(16,47,85,.06)] sm:mt-11 sm:rounded-[28px] sm:p-8 sm:shadow-[0_18px_50px_rgba(16,47,85,.07)]">
              <p className="text-[11px] font-medium tracking-[.14em] text-[var(--text-faint)]">
                SERVICIO
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => {
                      setServiceId(service.id);
                      setTime("");
                    }}
                    className={
                      service.id === serviceId
                        ? "rounded-full border border-[var(--brand)] bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white"
                        : "rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-2)]"
                    }
                  >
                    {service.name} · {service.duration} min
                    {service.price ? " · " + service.price : ""}
                  </button>
                ))}
              </div>
              <div className="mt-7 border-t border-[var(--divider)] pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium tracking-[.14em] text-[var(--text-faint)]">
                      DÍA
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {weekOffset === 0
                        ? "Próximos días"
                        : `Semana ${weekOffset + 1}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={weekOffset === 0 || loading}
                      onClick={() =>
                        setWeekOffset((value) => Math.max(0, value - 1))
                      }
                      className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-white disabled:opacity-30"
                      aria-label="Ver días anteriores"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      disabled={weekOffset >= maxWeekOffset || loading}
                      onClick={() =>
                        setWeekOffset((value) =>
                          Math.min(maxWeekOffset, value + 1),
                        )
                      }
                      className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-white disabled:opacity-30"
                      aria-label="Ver días siguientes"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
                  {days.map((item) => {
                    const hasSlots = Array.from(available).some((key) =>
                      key.startsWith(`${item.date}|`),
                    );
                    return (
                      <button
                        key={item.date}
                        disabled={!loading && !hasSlots}
                        onClick={() => {
                          setDay(item.date);
                          setTime("");
                        }}
                        className={`min-w-[68px] flex-none snap-start rounded-2xl border px-2 py-3 transition disabled:cursor-not-allowed sm:min-w-0 sm:flex-1 sm:px-1 ${day === item.date && hasSlots ? "border-[var(--brand)] bg-[var(--brand)] text-white" : hasSlots || loading ? "border-[var(--border)] bg-white text-[var(--text-2)]" : "border-[var(--border)] bg-[#f7f8fa] text-[#b6c1d0]"}`}
                      >
                        <span className="block text-[11px] font-medium opacity-70 sm:text-xs">
                          {item.short}
                        </span>
                        <span className="mt-1 block text-[19px] font-medium sm:text-[22px]">
                          {item.number}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-7 border-t border-[var(--divider)] pt-6">
                  <p className="text-[11px] font-medium tracking-[.14em] text-[var(--text-faint)]">
                    HORARIO
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {times.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setTime(slot)}
                        className={`rounded-full border px-3 py-3 text-[14px] font-medium transition sm:px-5 sm:text-[15px] ${time === slot ? "border-[var(--brand-accent)] bg-[var(--selected-bg)] text-[var(--brand)]" : "border-[var(--border)] bg-white text-[var(--text-2)]"}`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                  {loading && (
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      Cargando horarios…
                    </p>
                  )}
                  {!loading && !times.length && (
                    <p className="mt-4 text-[15px] text-[var(--text-muted)]">
                      No quedan horarios disponibles en los días mostrados.
                      Podés avanzar a la siguiente semana.
                    </p>
                  )}
                  {error && (
                    <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </p>
                  )}
                </div>
                <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--divider)] pt-6">
                  <p className="text-sm text-[var(--text-muted)]">
                    {time
                      ? `${selectedDay.label} a las ${time}`
                      : "Elegí un día y un horario"}
                  </p>
                  <Button
                    disabled={!time}
                    onClick={() => setStep("data")}
                    className="h-12 w-full rounded-full bg-[var(--brand)] px-8 text-base hover:bg-[var(--brand-hover)] sm:w-auto"
                  >
                    Continuar
                    {time
                      ? ` · ${selectedDay.short} ${selectedDay.number} ${time}`
                      : ""}
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-5 text-center text-xs text-[var(--text-faint)]">
              Después de reservar vas a poder administrar tu turno online
            </p>
          </section>
        )}
        {step === "data" && (
          <section className="pt-8 sm:pt-16">
            <button
              disabled={submitting}
              onClick={() => setStep("slots")}
              className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-white disabled:opacity-50"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="mt-8 text-[30px] font-medium tracking-[-.025em] sm:text-[36px]">
              Completá tus datos
            </h1>
            <p className="mt-3 text-[var(--text-muted)]">
              {selectedService.name} el {selectedDay.label.toLowerCase()} a las{" "}
              {time}.
            </p>
            <form
              onSubmit={submit}
              className={`relative mt-6 space-y-5 rounded-[22px] bg-white p-5 shadow-[0_18px_50px_rgba(16,47,85,.07)] transition sm:mt-8 sm:rounded-[28px] sm:p-9 ${submitting ? "pointer-events-none opacity-75" : ""}`}
            >
              {[
                ["name", "Nombre y apellido", "Ej: Manuela Gómez", "text"],
                ["whatsapp", "WhatsApp", "Ej: 2345 43-8544", "tel"],
                ["email", "Email", "nombre@email.com", "email"],
                [
                  "notes",
                  "Observaciones",
                  "Contanos brevemente el motivo",
                  "text",
                ],
              ].map(([name, label, placeholder, type]) => (
                <label
                  key={name}
                  className="block text-sm font-medium text-[var(--text-muted)]"
                >
                  {label}
                  <Input
                    name={name}
                    required={name !== "notes"}
                    type={type}
                    placeholder={placeholder}
                    className="mt-2 h-13 rounded-2xl border-[var(--border)] px-4 text-base"
                  />
                </label>
              ))}
              {error && (
                <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button
                disabled={submitting}
                className="h-13 w-full rounded-full bg-[var(--brand)] text-base hover:bg-[var(--brand-hover)] disabled:opacity-100"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Confirmando y guardando…
                  </>
                ) : (
                  "Confirmar consulta"
                )}
              </Button>
              {submitting && (
                <p className="text-center text-sm text-[var(--text-muted)]">
                  Esto puede tardar unos segundos.
                </p>
              )}
            </form>
          </section>
        )}
        {step === "confirmed" && (
          <section className="pt-8 sm:pt-16">
            {confirmationStatus === "pending" && (
              <div className="rounded-[22px] bg-[var(--brand)] px-5 py-9 text-white sm:rounded-[28px] sm:px-9 sm:py-11">
                <LoaderCircle size={34} className="animate-spin opacity-80" />
                <h1 className="mt-6 text-[27px] font-medium tracking-[-.025em] sm:text-[34px]">
                  Estamos agendando tu consulta
                </h1>
                <p className="mt-3 max-w-xl text-[17px] leading-7 text-white/85">
                  Ya recibimos tus datos. Esperá un momento mientras confirmamos
                  el horario.
                </p>
              </div>
            )}
            {confirmationStatus === "success" && (
              <div className="rounded-[22px] bg-[var(--brand)] px-5 py-9 text-white sm:rounded-[28px] sm:px-9 sm:py-11">
                <Check size={32} className="opacity-70" />
                <h1 className="mt-6 text-[27px] font-medium tracking-[-.025em] sm:text-[34px]">
                  Consulta confirmada
                </h1>
                <p className="mt-3 max-w-xl text-[17px] leading-7 text-white/85">
                  Te esperamos el {selectedDay.label.toLowerCase()} a las {time}{" "}
                  en {business.address}.
                </p>
                {bookingToken && (
                  <a
                    href={`/turno/${bookingToken}`}
                    className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-5 text-center font-medium text-[var(--brand)] sm:w-auto sm:px-7"
                  >
                    Administrar mi turno
                  </a>
                )}
              </div>
            )}
            {confirmationStatus === "error" && (
              <div className="rounded-[28px] border border-red-200 bg-white px-7 py-11 sm:px-9">
                <h1 className="text-[30px] font-medium tracking-[-.025em] text-red-800">
                  No pudimos confirmar el turno
                </h1>
                <p className="mt-3 max-w-xl text-[16px] leading-7 text-red-700">
                  {error}
                </p>
                <Button
                  onClick={() => {
                    setConfirmationStatus("idle");
                    setError("");
                    setStep("data");
                  }}
                  className="mt-7 h-12 rounded-full bg-[var(--brand)] px-7"
                >
                  Volver e intentar nuevamente
                </Button>
              </div>
            )}
          </section>
        )}
        <CtrlTurnosBrand />
      </div>
    </main>
  );
}
