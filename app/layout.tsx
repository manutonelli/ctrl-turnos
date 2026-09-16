import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turnos | AREA Estudio Contable",
  description: "Reservá una consulta presencial con AREA Estudio Contable.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}