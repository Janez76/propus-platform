import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t, type Lang } from "../../i18n";
import { formatSwissDate } from "../../lib/format";
import type { Order } from "../../api/orders";
import type { DashboardMetrics } from "./useDashboardMetrics";

interface PipelineBoardV2Props {
  metrics: DashboardMetrics;
  lang: Lang;
}

interface PipelineCardProps {
  order: Order;
  statusLabel: string;
  statusClass: string;
}

function PipelineCard({ order, statusLabel, statusClass }: PipelineCardProps) {
  const navigate = useNavigate();
  return (
    <div className="dv2-pcard" onClick={() => navigate(`/orders/${order.orderNo}`)}>
      <div className="dv2-pcard-id">#{order.orderNo}</div>
      <div className="dv2-pcard-addr">{order.address ?? "—"}</div>
      <div className="dv2-pcard-footer">
        <span className="dv2-pcard-client">{order.customerName ?? "—"}</span>
        <span className={`dv2-pcard-status dv2-pcard-status--${statusClass}`}>{statusLabel}</span>
      </div>
    </div>
  );
}

interface ColProps {
  title: string;
  count: number;
  orders: Order[];
  statusFn: (o: Order) => { label: string; cls: string };
  emptyLabel: string;
}

function PipelineCol({ title, count, orders, statusFn, emptyLabel }: ColProps) {
  return (
    <div className="dv2-pcol">
      <div className="dv2-pcol-head">
        <span>{title}</span>
        <span className="dv2-pcol-count">{count}</span>
      </div>
      {orders.length === 0 ? (
        <div className="dv2-pcol-empty">{emptyLabel}</div>
      ) : (
        orders.map((o) => {
          const { label, cls } = statusFn(o);
          return <PipelineCard key={o.orderNo} order={o} statusLabel={label} statusClass={cls} />;
        })
      )}
    </div>
  );
}

export function PipelineBoardV2({ metrics, lang }: PipelineBoardV2Props) {
  const navigate = useNavigate();
  const MS_DAY = 86_400_000;

  const overdueLabel = (o: Order) => {
    const days = Math.max(0, Math.floor((Date.now() - new Date(o.appointmentDate ?? 0).getTime()) / MS_DAY));
    return { label: `${days}T überfällig`, cls: "danger" };
  };
  const geplantLabel = (o: Order) => ({
    label: o.appointmentDate ? formatSwissDate(o.appointmentDate) : "—",
    cls: "gold",
  });
  const emptyFn = () => ({ label: "—", cls: "muted" });

  return (
    <div className="dv2-card">
      <div className="dv2-card-head">
        <div>
          <div className="dv2-card-title">{t(lang, "dashboardV2.pipeline.title")}</div>
        </div>
        <button className="dv2-btn-ghost" onClick={() => navigate("/orders")}>
          {t(lang, "dashboardV2.pipeline.openBoard")} <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="dv2-pipeline">
        <PipelineCol
          title={t(lang, "dashboardV2.pipeline.requested")}
          count={metrics.pipelineCounts.angefragt}
          orders={metrics.pipelineAngefragt}
          statusFn={emptyFn}
          emptyLabel={t(lang, "dashboardV2.pipeline.empty")}
        />
        <PipelineCol
          title={t(lang, "dashboardV2.pipeline.planned")}
          count={metrics.pipelineCounts.geplant}
          orders={metrics.pipelineGeplant}
          statusFn={geplantLabel}
          emptyLabel={t(lang, "dashboardV2.pipeline.empty")}
        />
        <PipelineCol
          title={t(lang, "dashboardV2.pipeline.inProgress")}
          count={metrics.pipelineCounts.inProgress}
          orders={metrics.pipelineInProgress}
          statusFn={overdueLabel}
          emptyLabel={t(lang, "dashboardV2.pipeline.empty")}
        />
        <PipelineCol
          title={t(lang, "dashboardV2.pipeline.delivered")}
          count={metrics.pipelineCounts.geliefert}
          orders={metrics.pipelineGeliefert}
          statusFn={emptyFn}
          emptyLabel={t(lang, "dashboardV2.pipeline.empty")}
        />
      </div>
    </div>
  );
}
