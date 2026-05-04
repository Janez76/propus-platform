import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/components/SafeHtml";

describe("sanitizeHtml", () => {
  describe("variant: ui (default)", () => {
    it("strips script tags", () => {
      const out = sanitizeHtml("<script>alert(1)</script>safe");
      expect(out).not.toContain("<script");
      expect(out).toContain("safe");
    });
    it("strips img tags (not in ui allowlist)", () => {
      const out = sanitizeHtml('<img src="x.png" alt="a" />ok');
      expect(out).not.toContain("<img");
      expect(out).toContain("ok");
    });
    it("strips style attribute", () => {
      const out = sanitizeHtml('<span style="color:red">x</span>');
      expect(out).not.toContain("style");
      expect(out).toContain("x");
    });
  });

  describe("variant: mail", () => {
    it("preserves links and forces target+rel", () => {
      const out = sanitizeHtml('<a href="https://example.com">x</a>', "mail");
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer"');
    });
    it("strips javascript: hrefs", () => {
      const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>', "mail");
      expect(out).not.toContain("javascript:");
    });
    it("strips inline style attribute (not allowed in mail variant)", () => {
      const out = sanitizeHtml('<p style="color:red;text-align:center">x</p>', "mail");
      expect(out).not.toContain("style");
      expect(out).toContain("<p>x</p>");
    });
  });

  describe("variant: mail_styled", () => {
    it("preserves safe CSS properties (Codex P2 #265)", () => {
      const out = sanitizeHtml('<p style="color: red; text-align: center; padding: 8px">x</p>', "mail_styled");
      expect(out).toContain("color: red");
      expect(out).toContain("text-align: center");
      expect(out).toContain("padding: 8px");
    });
    it("strips dangerous position-based clickjacking styles", () => {
      const out = sanitizeHtml('<div style="position: fixed; top: 0; left: 0; z-index: 9999">x</div>', "mail_styled");
      expect(out).not.toContain("position");
      expect(out).not.toContain("top:");
      expect(out).not.toContain("z-index");
    });
    it("strips background-image (tracking pixel via url())", () => {
      const out = sanitizeHtml('<div style="color: red; background-image: url(http://evil/p.png)">x</div>', "mail_styled");
      expect(out).toContain("color: red");
      expect(out).not.toContain("background-image");
      expect(out).not.toContain("url(");
    });
    it("strips expression() and javascript: in style values", () => {
      const out = sanitizeHtml('<p style="color: expression(alert(1))">x</p>', "mail_styled");
      expect(out).not.toContain("expression");
      const out2 = sanitizeHtml('<p style="background: url(javascript:alert(1))">x</p>', "mail_styled");
      expect(out2).not.toContain("javascript");
    });
    it("removes style attribute entirely when no safe properties remain", () => {
      const out = sanitizeHtml('<p style="position: absolute">x</p>', "mail_styled");
      expect(out).toBe("<p>x</p>");
    });
    it("preserves typical RichTextEditor TextAlign output", () => {
      const out = sanitizeHtml('<p style="text-align: right">aligned</p>', "mail_styled");
      expect(out).toContain("text-align: right");
    });
  });

  describe("global safety", () => {
    it("returns empty string for null/undefined input", () => {
      expect(sanitizeHtml(null)).toBe("");
      expect(sanitizeHtml(undefined)).toBe("");
    });
  });
});
