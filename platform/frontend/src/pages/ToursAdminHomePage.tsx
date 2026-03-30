import { useEffect } from "react";

/**
 * Leitet direkt zum Tour-Manager (EJS) weiter, gemountet unter /tour-manager auf derselben Origin.
 */
export function ToursAdminHomePage() {
  useEffect(() => {
    window.location.href = `${window.location.origin}/tour-manager/admin`;
  }, []);

  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C5A059]/25 border-t-[#C5A059]" />
    </div>
  );
}
