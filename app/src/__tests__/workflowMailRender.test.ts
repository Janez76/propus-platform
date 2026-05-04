import { describe, it, expect } from "vitest";
import { renderWorkflowMails } from "@/lib/mail/workflowMail";

const targetsAll = { customer: true, office: true, photographer: true, cc: true };

describe("renderWorkflowMails", () => {
  it("renders confirmed-customer mail when target enabled", () => {
    const out = renderWorkflowMails(
      ["email.confirmed_customer"],
      {
        orderNo: 17,
        customerEmail: "kunde@example.com",
        scheduleDate: "2026-06-15",
        scheduleTime: "10:00",
      },
      targetsAll,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      effect: "email.confirmed_customer",
      role: "customer",
      to: "kunde@example.com",
      subject: expect.stringContaining("#17"),
    });
    expect(out[0].html).toContain("17");
    expect(out[0].text).not.toContain("<p>");
  });

  it("expands cancel_special to all roles with valid recipients", () => {
    const out = renderWorkflowMails(
      ["email.cancelled_all"],
      {
        orderNo: 99,
        customerEmail: "k@x.de",
        officeEmail: "o@x.de",
        photographerEmail: "p@x.de",
      },
      targetsAll,
    );
    const roles = out.map((m) => m.role).sort();
    expect(roles).toEqual(["customer", "office", "photographer"]);
  });

  it("skips role when recipient address missing", () => {
    const out = renderWorkflowMails(
      ["email.cancelled_all"],
      { orderNo: 99, customerEmail: "k@x.de" }, // office/photog fehlen
      targetsAll,
    );
    expect(out.map((m) => m.role)).toEqual(["customer"]);
  });

  it("skips role when target flag is false", () => {
    const out = renderWorkflowMails(
      ["email.confirmed_customer"],
      { orderNo: 1, customerEmail: "k@x.de" },
      { customer: false, office: true, photographer: true, cc: true },
    );
    expect(out).toEqual([]);
  });

  it("ignores unknown effects without throwing", () => {
    const out = renderWorkflowMails(
      ["email.unknown_effect", "non.email.effect", "email.confirmed_customer"],
      { orderNo: 1, customerEmail: "k@x.de" },
      targetsAll,
    );
    expect(out.map((m) => m.effect)).toEqual(["email.confirmed_customer"]);
  });

  it("does NOT fall back to process.env.OFFICE_EMAIL (CodeRabbit Major #261)", () => {
    const prev = process.env.OFFICE_EMAIL;
    process.env.OFFICE_EMAIL = "leak@from-env.invalid";
    try {
      const out = renderWorkflowMails(
        ["email.confirmed_office"],
        { orderNo: 1 }, // explizit KEIN officeEmail
        targetsAll,
      );
      expect(out).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.OFFICE_EMAIL;
      else process.env.OFFICE_EMAIL = prev;
    }
  });
});
