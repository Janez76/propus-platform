import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Propus Platform",
  description: "Propus Admin & Customer Portal",
};

const themeScript = `(function(){try{var s=localStorage.getItem("admin_theme_v1");if(s){var d=JSON.parse(s);var t=d.state&&d.state.theme;if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}else if(matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}})()`;

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
