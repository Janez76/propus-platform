import { OrderChat } from "../../OrderChat";
import { OrderEmailLog } from "../../OrderEmailLog";
import type { Order, ResendEmailType } from "../../../../api/orders";
import { t, type Lang } from "../../../../i18n";

type Props = {
  token: string;
  orderNo: string;
  data: Order;
  role: string;
  canManageOrder: boolean;
  busy: string;
  lang: Lang;
  onResendEmail: (type: ResendEmailType) => void;
};

/**
 * Kommunikations-Tab der OrderDetail-Ansicht.
 *
 * Rendert Chat, E-Mail-Log (falls kein Fotograf) und einen
 * Resend-E-Mail-Selektor. Kein eigener State – alles an Props.
 *
 * Wird vom Orchestrator (`OrderDetail/index.tsx`) innerhalb eines
 * `<TabsContent value="communication">`-Wrappers gerendert.
 */
export function CommunicationTab({
  token,
  orderNo,
  data,
  role,
  canManageOrder,
  busy,
  lang,
  onResendEmail,
}: Props) {
  return (
    <div className="space-y-4">
      <OrderChat
        token={token}
        orderNo={orderNo}
        order={data}
        actorRole={role === "photographer" ? "photographer" : "admin"}
      />

      {role !== "photographer" && <OrderEmailLog token={token} orderNo={orderNo} />}

      {canManageOrder && (
        <div className="surface-card p-3">
          <h4 className="mb-2 font-semibold">{t(lang, "orderDetail.button.resendEmail")}</h4>
          <select
            className="ui-input"
            disabled={busy === "mail"}
            value=""
            onChange={(e) => {
              const v = e.target.value as ResendEmailType;
              if (v) {
                onResendEmail(v);
                e.target.value = "";
              }
            }}
          >
            <option value="">{t(lang, "orderDetail.button.resendEmail")}</option>
            {["pending", "provisional"].includes((data.status || "").toLowerCase()) && (
              <option value="confirmation_request">
                {t(lang, "orderDetail.resendEmail.confirmationRequest")}
              </option>
            )}
            {data.schedule?.date &&
              data.schedule?.time &&
              data.lastRescheduleOldDate &&
              data.lastRescheduleOldTime && (
                <option value="reschedule">
                  {t(lang, "orderDetail.resendEmail.reschedule")}
                </option>
              )}
            <option value="booking_confirmed">
              {t(lang, "orderDetail.resendEmail.bookingConfirmed")}
            </option>
          </select>
        </div>
      )}
    </div>
  );
}
