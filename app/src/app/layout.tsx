import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeRoot } from "@/components/ThemeRoot";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Propus Admin",
  description: "Propus Admin & Customer Portal",
  manifest: "/manifest.webmanifest",
  applicationName: "Propus",
  appleWebApp: {
    capable: true,
    title: "Propus",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/assets/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/assets/brand/favicon.png", type: "image/png" },
    ],
    apple: "/assets/brand/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F2EA" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1012" },
  ],
};

const themeScript = `(function(){function s(){try{var t=localStorage.getItem("admin_theme_v1")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";if(document.body)document.body.classList.toggle("theme-dark",d)}catch(e){}}if(document.body)s();else document.addEventListener("DOMContentLoaded",s)})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeRoot>{children}</ThemeRoot>
        <Toaster
          position="top-center"
          closeButton
          theme="dark"
          toastOptions={{ className: "border border-white/10" }}
        />
      </body>
    </html>
  );
}
