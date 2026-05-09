import { render } from "@testing-library/react";
import { DeadlineBadge } from "@/components/ui/DeadlineBadge";

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

describe("DeadlineBadge", () => {
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
});
