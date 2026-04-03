import type { Metadata } from "next";
import "./globals.css";
import { ThemeRoot } from "@/components/ThemeRoot";

export const metadata: Metadata = {
  title: "Propus Admin",
  description: "Propus Admin & Customer Portal",
  icons: {
    icon: [
      { url: "/assets/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/assets/brand/favicon.png", type: "image/png" },
    ],
    apple: "/assets/brand/favicon.png",
  },
};

const themeScript = `(function(){try{var t=localStorage.getItem("admin_theme_v1")||"system";var dark=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",dark);document.documentElement.style.colorScheme=dark?"dark":"light"}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeRoot>{children}</ThemeRoot>
      </body>
    </html>
  );
}
