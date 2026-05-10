import { afterEach, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { DeadlineBadge } from "@/components/ui/DeadlineBadge";

/** Fixierte Referenz-Zeit für deterministische 7d/14d-Boundary-Tests. */
const FIXED_NOW = new Date("2026-06-01T12:00:00.000Z");

function isoInDays(days: number): string {
  const d = new Date(FIXED_NOW);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

describe("DeadlineBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing without a deadline", () => {
    const { container } = render(<DeadlineBadge deadlineAt={null} />);
    expect(container.textContent).toBe("");
  });

  it("uses red tone for < 7 days", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(3)} />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span!.className).toMatch(/red/);
  });

  it("uses amber tone for < 14 days but >= 7", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(10)} />);
    const span = container.querySelector("span");
    expect(span!.className).toMatch(/amber/);
  });

  it("uses neutral tone for >= 14 days", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(30)} />);
    const span = container.querySelector("span");
    expect(span!.className).toMatch(/zinc/);
  });

  it("labels 'Heute fällig' for 0 days", () => {
    const { getByText } = render(<DeadlineBadge deadlineAt={new Date().toISOString()} />);
    expect(getByText(/Heute/)).toBeInTheDocument();
  });

  it("labels 'Morgen fällig' for ~1 day", () => {
    const { getByText } = render(<DeadlineBadge deadlineAt={isoInDays(1)} />);
    expect(getByText(/Morgen/)).toBeInTheDocument();
  });

  it("renders nothing for empty string deadline", () => {
    const { container } = render(<DeadlineBadge deadlineAt="" />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing for invalid ISO string", () => {
    const { container } = render(<DeadlineBadge deadlineAt="not-a-date" />);
    expect(container.textContent).toBe("");
  });

  it("labels past deadlines as 'Überfällig' (signed days, not clamped)", () => {
    const past = new Date(FIXED_NOW);
    past.setUTCDate(past.getUTCDate() - 5);
    const { getByText, container } = render(<DeadlineBadge deadlineAt={past.toISOString()} />);
    expect(getByText(/Überfällig/)).toBeInTheDocument();
    const span = container.querySelector("span");
    expect(span!.className).toMatch(/red/);
  });

  it("uses amber tone exactly at 7 days (< 14d boundary, >= 7d)", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(7)} />);
    const span = container.querySelector("span");
    expect(span!.className).toMatch(/amber/);
  });

  it("uses neutral tone exactly at 14 days (boundary)", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(14)} />);
    const span = container.querySelector("span");
    expect(span!.className).toMatch(/zinc/);
  });

  it("renders title attribute with formatted deadline date", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(5)} />);
    const span = container.querySelector("span");
    expect(span!.getAttribute("title")).toMatch(/^Deadline:/);
  });

  it("merges custom className with tone classes", () => {
    const { container } = render(<DeadlineBadge deadlineAt={isoInDays(5)} className="custom-class" />);
    const span = container.querySelector("span");
    expect(span!.className).toMatch(/custom-class/);
    expect(span!.className).toMatch(/red/);
  });
});
