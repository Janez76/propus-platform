'use client';

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../../api/orders';
import { formatCHF } from '../../lib/format';
import { statusMatches } from '../../lib/status';
import { t, type Lang } from '../../i18n';

interface TopCustomersTableProps {
  orders: Order[];
  lang: Lang;
  /** Window in days. Default 90. */
  days?: number;
}

interface CustomerBucket {
  /** Stable Sortier-Key — Customer-Name in lowercase oder Email. */
  key: string;
  name: string;
  totalAmount: number;
  orderCount: number;
  lastOrderDate: number | null;
}

/** Initialen aus Kunden-Name oder Firma. */
function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable hash → 0..5 für Avatar-Farbverlauf. */
function avatarBucket(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % 6;
}

/** 6 Avatar-Gradienten in Brand-Palette. */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #B68E20 0%, #d4b860 100%)',
  'linear-gradient(135deg, #4a7aa8 0%, #7aa6c8 100%)',
  'linear-gradient(135deg, #8a5fb8 0%, #b18bd8 100%)',
  'linear-gradient(135deg, #d05a87 0%, #f08aaa 100%)',
  'linear-gradient(135deg, #4a8a52 0%, #82b888 100%)',
  'linear-gradient(135deg, #d6a447 0%, #f0c878 100%)',
];

function aggregateTopCustomers(orders: Order[], days: number): CustomerBucket[] {
  const cutoff = Date.now() - days * 86_400_000;
  const buckets = new Map<string, CustomerBucket>();
  for (const o of orders) {
    if (statusMatches(o.status, 'cancelled') || statusMatches(o.status, 'archived')) continue;
    const dateMs = o.appointmentDate ? new Date(o.appointmentDate).getTime() : 0;
    if (dateMs < cutoff) continue;
    const name = (o.customerName ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const amount = typeof o.total === 'number' ? o.total : 0;
    const existing = buckets.get(key);
    if (existing) {
      existing.totalAmount += amount;
      existing.orderCount += 1;
      if (dateMs > (existing.lastOrderDate ?? 0)) existing.lastOrderDate = dateMs;
    } else {
      buckets.set(key, {
        key,
        name,
        totalAmount: amount,
        orderCount: 1,
        lastOrderDate: dateMs > 0 ? dateMs : null,
      });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

export function TopCustomersTable({ orders, lang, days = 90 }: TopCustomersTableProps) {
  const navigate = useNavigate();
  const top = useMemo(() => aggregateTopCustomers(orders, days).slice(0, 6), [orders, days]);
  const max = top[0]?.totalAmount ?? 0;

  if (top.length === 0) {
    return (
      <section className="dv2-card dv2-tc-card">
        <header className="dv2-card-head">
          <div className="dv2-card-title">
            {t(lang, 'dashboardV2.topCustomers.title').replace('{{days}}', String(days))}
          </div>
        </header>
        <div className="dv2-tc-empty">
          {t(lang, 'dashboardV2.topCustomers.empty').replace('{{days}}', String(days))}
        </div>
      </section>
    );
  }

  return (
    <section className="dv2-card dv2-tc-card">
      <header className="dv2-card-head">
        <div className="dv2-card-title">
          {t(lang, 'dashboardV2.topCustomers.title').replace('{{days}}', String(days))}
        </div>
        <button
          type="button"
          className="dv2-tc-action"
          onClick={() => navigate('/customers')}
        >
          {t(lang, 'dashboardV2.topCustomers.viewAll')} →
        </button>
      </header>
      <div className="dv2-tc-table-wrap">
        <table className="dv2-tc-table" role="table">
          <thead>
            <tr>
              <th scope="col" className="dv2-tc-th-customer">
                {t(lang, 'dashboardV2.topCustomers.col.customer')}
              </th>
              <th scope="col" className="dv2-tc-th-amount">
                {t(lang, 'dashboardV2.topCustomers.col.amount')}
              </th>
              <th scope="col" className="dv2-tc-th-orders">
                {t(lang, 'dashboardV2.topCustomers.col.orders')}
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((c) => {
              const pct = max > 0 ? (c.totalAmount / max) * 100 : 0;
              const bucket = avatarBucket(c.key);
              const inactiveDays =
                c.lastOrderDate != null
                  ? Math.floor((Date.now() - c.lastOrderDate) / 86_400_000)
                  : null;
              const subLine =
                inactiveDays != null
                  ? t(lang, 'dashboardV2.topCustomers.subLine')
                      .replace('{{count}}', String(c.orderCount))
                      .replace('{{days}}', String(inactiveDays))
                  : t(lang, 'dashboardV2.topCustomers.subLineNoDate').replace(
                      '{{count}}',
                      String(c.orderCount),
                    );
              return (
                <tr
                  key={c.key}
                  className="dv2-tc-row"
                  onClick={() => navigate(`/customers?q=${encodeURIComponent(c.name)}`)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/customers?q=${encodeURIComponent(c.name)}`);
                    }
                  }}
                >
                  <td className="dv2-tc-customer">
                    <span
                      className="dv2-tc-avatar"
                      style={{ background: AVATAR_GRADIENTS[bucket] }}
                      aria-hidden
                    >
                      {initials(c.name)}
                    </span>
                    <span className="dv2-tc-customer-text">
                      <span className="dv2-tc-customer-name">{c.name}</span>
                      <span className="dv2-tc-customer-sub">{subLine}</span>
                    </span>
                  </td>
                  <td className="dv2-tc-amount">
                    <span className="dv2-tc-bar" aria-hidden>
                      <span
                        className="dv2-tc-bar-fill"
                        style={{ width: `${Math.max(2, pct).toFixed(1)}%` }}
                      />
                    </span>
                    <span className="dv2-tc-amount-val">{formatCHF(c.totalAmount)}</span>
                  </td>
                  <td className="dv2-tc-orders">{c.orderCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
