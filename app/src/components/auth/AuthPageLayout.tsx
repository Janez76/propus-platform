import type { ReactNode } from "react";
import { AuthThemeToggle } from "./AuthThemeToggle";

interface AuthPageLayoutProps {
  children: ReactNode;
}

export function AuthPageLayout({ children }: AuthPageLayoutProps) {
  return (
    <div className="auth-page">
      <div className="auth-dots" aria-hidden="true" />
      <AuthThemeToggle />
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

interface AuthLogoHeaderProps {
  title: string;
  subtitle?: string;
}

export function AuthLogoHeader({ title, subtitle }: AuthLogoHeaderProps) {
  return (
    <div className="text-center mb-10">
      <div className="auth-logo-box mb-6">
        <img
          src="/assets/brand/logopropus.png"
          alt="PROPUS"
          className="w-32 h-auto object-contain"
        />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "var(--text-main)" }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ color: "var(--text-muted)" }} className="text-sm">
          {subtitle}
        </p>
      )}
    </div>
  );
}

interface AuthCardProps {
  children: ReactNode;
}

export function AuthCard({ children }: AuthCardProps) {
  return <div className="auth-card p-8 md:p-10">{children}</div>;
}

