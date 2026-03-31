import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getOrder, type Order } from "../api/orders";
import { PrintOrder } from "../components/orders/PrintOrder";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";

const PRINT_TOKEN_KEY = "admin_print_token_v1";

export function PrintOrderPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);
  const [data, setData] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const printTriggered = useRef(false);
  const printTokenRef = useRef("");

  if (!printTokenRef.current) {
    if (token) {
      printTokenRef.current = token;
    } else if (typeof window !== "undefined") {
      try {
        printTokenRef.current = window.localStorage.getItem(PRINT_TOKEN_KEY) || "";
      } catch {
        printTokenRef.current = "";
      }
    }
  }

  useEffect(() => {
    if (!orderNo) {
      setError(t(language, "printOrderPage.error.invalidOrderNo"));
      return;
    }
    const effectiveToken = printTokenRef.current || token;
    if (!effectiveToken) {
      setError(t(language, "printOrderPage.error.missingToken"));
      return;
    }

    getOrder(effectiveToken, orderNo)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : t(language, "printOrderPage.error.loadFailed")));
  }, [orderNo, token, language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(PRINT_TOKEN_KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!data || printTriggered.current) return;
    printTriggered.current = true;
    const timer = setTimeout(() => {
      window.print();
    }, 400);
    return () => clearTimeout(timer);
  }, [data]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-8">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-2">{t(language, "common.error")}</p>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-8">
        <p className="text-zinc-400 text-sm">{t(language, "printOrderPage.loading")}</p>
      </div>
    );
  }

  return (
    <div id="print-root" className="bg-white min-h-screen">
      <PrintOrder data={data} />
    </div>
  );
}

