import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { getServerSession } from "next-auth";
import { Providers } from "@/components/providers";
import { authOptions } from "@/lib/auth";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QuoteFlow — RFQ to Quote",
  description: "Product catalog, quote builder, and PDF export",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" className={`${manrope.variable} h-full overflow-hidden antialiased`}>
      <body className="h-full overflow-hidden font-sans text-dark-primary">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
