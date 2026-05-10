// Inserts add_order_items tool + handler into writes.ts.
// Idempotent. Run as: node scripts/patch-add-order-items.js
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "..", "app", "src", "lib", "assistant", "tools", "writes.ts");
let s = fs.readFileSync(p, "utf-8");

if (s.includes("add_order_items")) {
  console.log("already patched");
  process.exit(0);
}

// File uses CRLF line endings — make sure all our string templates do too.
const NL = s.includes("\r\n") ? "\r\n" : "\n";
const lf2crlf = (str) => (NL === "\r\n" ? str.replace(/\r?\n/g, "\r\n") : str);

const schemaTail = `,
  {
    name: "add_order_items",
    description:
      "Fuegt Positionen zu einem bestehenden Auftrag hinzu (z. B. Schluesselabholung, Grundriss nachgereicht). Tool resolved Codes aus booking.products / pricing_rules wie create_order, haengt sie an services.addons an und rechnet pricing.subtotal/vat/total neu. Erlaubt nur in offenen Statuus (pending, provisional, disposition_offen, paused). Storno + Neuanlage ist NICHT noetig.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        order_no: { type: "number", description: "Auftragsnummer" },
        service_items: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: { code: { type: "string" }, qty: { type: "number" } },
                required: ["code"],
              },
            ],
          },
        },
        custom_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              price: { type: "number" },
              qty: { type: "number" },
            },
            required: ["label", "price"],
          },
        },
        area_sqm: { type: "number" },
        floors: { type: "number" },
      },
      required: ["order_no"],
    },
  },
];`;

const schemaNeedle = lf2crlf(`\n      required: ["customer_id", "address"],\n    },\n  },\n];`);
if (!s.includes(schemaNeedle)) {
  console.error("schema needle not found");
  process.exit(2);
}
s = s.replace(
  schemaNeedle,
  lf2crlf(`\n      required: ["customer_id", "address"],\n    },\n  }${schemaTail}`),
);

const handlerInsertion = `,

    add_order_items: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const orderNo = optionalPositiveInt(input.order_no);
      if (!orderNo) return { error: "order_no ist erforderlich" };
      const newServiceItems = parseServiceItems(input.service_items);
      const newCustomItems = Array.isArray(input.custom_items) ? input.custom_items : [];
      if (newServiceItems.length === 0 && newCustomItems.length === 0) {
        return { error: "Mindestens ein service_items- oder custom_items-Eintrag erforderlich." };
      }
      const order = await runQueryOne<{
        order_no: number;
        status: string;
        services: Record<string, unknown> | null;
        pricing: Record<string, unknown> | null;
        object: Record<string, unknown> | null;
      }>(
        \`SELECT order_no, status, services, pricing, object FROM booking.orders WHERE order_no = $1\`,
        [orderNo],
      );
      if (!order) return { error: \`Auftrag \${orderNo} nicht gefunden\` };
      const OPEN = new Set(["pending", "provisional", "disposition_offen", "paused"]);
      const ns = normalizeStatusKey(order.status) ?? order.status;
      if (!OPEN.has(ns)) {
        return { error: \`Auftrag \${orderNo} im Status "\${ns}" — Aenderungen nur bei pending/provisional/disposition_offen/paused.\` };
      }
      const obj = (order.object || {}) as Record<string, unknown>;
      const objectArea = (() => {
        const pIn = input.area_sqm;
        if (typeof pIn === "number" && Number.isFinite(pIn) && pIn > 0) return String(Math.trunc(pIn));
        return obj.area ? String(obj.area) : null;
      })();
      const fr = Number(input.floors);
      const objectFloors = Number.isFinite(fr) && fr > 0 ? Math.max(1, Math.trunc(fr)) : (Number(obj.floors) || 1);
      const objectRooms = obj.rooms ? String(obj.rooms) : null;
      type AddonEntry = { id: string; label: string; price: number; qty?: number; group?: string };
      const existingServices = (order.services && typeof order.services === "object") ? order.services as Record<string, unknown> : {};
      const existingAddons = Array.isArray(existingServices.addons) ? existingServices.addons as AddonEntry[] : [];
      const newAddons: AddonEntry[] = [];
      const summary: string[] = [];
      let added = 0;
      const unpriced: string[] = [];
      if (newServiceItems.length > 0) {
        const codes = Array.from(new Set(newServiceItems.map((s) => s.code)));
        const products = await runQuery<ProductRow>(
          \`SELECT p.id, p.code, p.name, p.kind, p.group_key, pr.rule_type, pr.config_json FROM booking.products p LEFT JOIN LATERAL (SELECT rule_type, config_json FROM booking.pricing_rules WHERE product_id = p.id AND active = TRUE AND (valid_from IS NULL OR valid_from <= CURRENT_DATE) AND (valid_to IS NULL OR valid_to >= CURRENT_DATE) ORDER BY priority ASC, id ASC LIMIT 1) pr ON TRUE WHERE p.code = ANY($1::text[]) AND p.active = TRUE\`,
          [codes],
        );
        const byCode = new Map(products.map((p) => [p.code, p]));
        const missing = codes.filter((c) => !byCode.has(c));
        if (missing.length > 0) return { error: \`Unbekannter Produktcode: \${missing.join(", ")}\` };
        for (const item of newServiceItems) {
          const product = byCode.get(item.code)!;
          const qty = item.qty;
          const unitPrice = priceFromRule(product.rule_type, product.config_json, { area: objectArea, floors: objectFloors, rooms: objectRooms, qty });
          const lineTotal = roundCHF(unitPrice * qty, 0.05);
          if (unitPrice <= 0) unpriced.push(product.code);
          newAddons.push({ id: product.code, label: product.name, price: lineTotal, ...(qty > 1 ? { qty } : {}), ...(product.group_key ? { group: product.group_key } : {}) });
          added += lineTotal;
          summary.push(\`\${product.name}\${qty > 1 ? \` x\${qty}\` : ""} - \${lineTotal} CHF\`);
        }
      }
      for (const raw of newCustomItems) {
        if (!raw || typeof raw !== "object") continue;
        const ci = raw as Record<string, unknown>;
        const label = optionalString(ci.label);
        const priceNum = Number(ci.price);
        if (!label || !Number.isFinite(priceNum) || priceNum < 0) continue;
        const qtyNum = Number(ci.qty);
        const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.max(1, Math.trunc(qtyNum)) : 1;
        const lineTotal = roundCHF(priceNum * qty, 0.05);
        const slug = label.toLowerCase().normalize("NFKD").replace(/[^\\w\\s-]/g, "").trim().replace(/\\s+/g, "-").slice(0, 30) || "item";
        newAddons.push({ id: \`custom:\${slug}\`, label, price: lineTotal, ...(qty > 1 ? { qty } : {}) });
        added += lineTotal;
        summary.push(\`\${label}\${qty > 1 ? \` x\${qty}\` : ""} - \${lineTotal} CHF (manuell)\`);
      }
      if (newAddons.length === 0) return { error: "Keine gueltigen Positionen erkannt." };
      const hasKey = newServiceItems.some((s) => s.code.toLowerCase().includes("keypickup"));
      const existingOptions = (existingServices.options && typeof existingServices.options === "object") ? existingServices.options as Record<string, unknown> : {};
      const optionsBlock: Record<string, unknown> = { ...existingOptions };
      if (hasKey && !optionsBlock.keyPickup) optionsBlock.keyPickup = { enabled: true, address: "", notes: "" };
      const mergedAddons = [...existingAddons, ...newAddons];
      const mergedServices = { ...existingServices, addons: mergedAddons, ...(Object.keys(optionsBlock).length > 0 ? { options: optionsBlock } : {}) };
      const VAT = 0.081;
      const pkgPrice = (() => {
        const pkg = existingServices.package;
        if (pkg && typeof pkg === "object") { const p = Number((pkg as Record<string, unknown>).price); return Number.isFinite(p) ? p : 0; }
        return 0;
      })();
      const addonsTotal = mergedAddons.reduce((s, a) => s + (Number(a.price) || 0), 0);
      const newSubtotal = roundCHF(pkgPrice + addonsTotal, 0.05);
      const newVat = roundCHF(newSubtotal * VAT, 0.05);
      const newTotal = roundCHF(newSubtotal + newVat, 0.05);
      const existingPricing = (order.pricing && typeof order.pricing === "object") ? order.pricing as Record<string, unknown> : {};
      const mergedPricing: Record<string, unknown> = { ...existingPricing, subtotal: newSubtotal, vat: newVat, total: newTotal };
      if (unpriced.length > 0) mergedPricing._note = \`Hinzugefuegte Codes ohne Preis: \${unpriced.join(", ")}\`;
      await runQuery(
        \`UPDATE booking.orders SET services = $1::jsonb, pricing = $2::jsonb WHERE order_no = $3\`,
        [JSON.stringify(mergedServices), JSON.stringify(mergedPricing), orderNo],
      );
      return {
        ok: true,
        orderNo,
        addedItems: summary,
        addedSubtotal: roundCHF(added, 0.05),
        newTotal,
        unpriced: unpriced.length > 0 ? unpriced : undefined,
        message: \`Auftrag #\${orderNo}: \${summary.length} Position(en) hinzugefuegt. Neuer Total CHF \${newTotal.toFixed(2)}.\${hasKey ? " Schluessel-Adresse im Detail ergaenzen." : ""}\`,
      };
    }`;

const handlerNeedle = lf2crlf(`\n        message: \`Auftrag \${orderNo}: Status von "\${order.status}" auf "\${normalizedNew}" geändert.\`,\n      };\n    },\n  };\n}`);
if (!s.includes(handlerNeedle)) {
  console.error("handler needle not found");
  process.exit(3);
}
s = s.replace(
  handlerNeedle,
  lf2crlf(`\n        message: \`Auftrag \${orderNo}: Status von "\${order.status}" auf "\${normalizedNew}" geändert.\`,\n      };\n    }${handlerInsertion},\n  };\n}`),
);

fs.writeFileSync(p, s, "utf-8");
console.log("patched");
