// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WizardShell, type WizardStepDef } from "./WizardShell";
import { useAuthStore } from "../../../store/authStore";

const steps: WizardStepDef[] = [
  { key: "customer", label: "Kunde" },
  { key: "object", label: "Objekt" },
  { key: "service", label: "Service" },
  { key: "schedule", label: "Termin" },
];

type OverrideProps = Partial<Parameters<typeof WizardShell>[0]>;

function renderShell(overrides: OverrideProps = {}) {
  const props = {
    steps,
    currentIndex: 0,
    canNext: true,
    isSubmitting: false,
    onBack: vi.fn(),
    onNext: vi.fn(),
    onSubmit: vi.fn(),
    onGoto: vi.fn(),
    children: <div data-testid="step-content">step body</div>,
    ...overrides,
  };
  return { props, ...render(<WizardShell {...props} />) };
}

beforeEach(() => {
  cleanup();
  useAuthStore.setState({ language: "de" });
});

describe("WizardShell – progress bar", () => {
  it("renders one step button per step entry", () => {
    renderShell();
    for (const step of steps) {
      expect(screen.getByRole("button", { name: new RegExp(step.label) })).toBeDefined();
    }
  });

  it("marks only the current step with aria-current='step'", () => {
    renderShell({ currentIndex: 2 });
    const active = screen.getByRole("button", { name: /Service/ });
    expect(active.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: /Kunde/ }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: /Termin/ }).getAttribute("aria-current")).toBeNull();
  });

  it("disables future step buttons and enables done + current", () => {
    renderShell({ currentIndex: 1 });
    expect((screen.getByRole("button", { name: /Kunde/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Objekt/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Service/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Termin/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onGoto when clicking a previous step", async () => {
    const user = userEvent.setup();
    const { props } = renderShell({ currentIndex: 2 });
    await user.click(screen.getByRole("button", { name: /Kunde/ }));
    expect(props.onGoto).toHaveBeenCalledWith(0);
  });

  it("does not call onGoto when clicking a future (disabled) step", async () => {
    const user = userEvent.setup();
    const { props } = renderShell({ currentIndex: 1 });
    await user.click(screen.getByRole("button", { name: /Service/ }));
    expect(props.onGoto).not.toHaveBeenCalled();
  });
});

describe("WizardShell – navigation buttons", () => {
  it("disables the back button on the first step", () => {
    renderShell({ currentIndex: 0 });
    const back = screen.getByRole("button", { name: /zurück/i });
    expect((back as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables the back button from step 2 onwards", () => {
    renderShell({ currentIndex: 1 });
    const back = screen.getByRole("button", { name: /zurück/i });
    expect((back as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the 'next' button on intermediate steps and hides 'createOrder'", () => {
    renderShell({ currentIndex: 1 });
    expect(screen.getByRole("button", { name: /weiter/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /erstellen/i })).toBeNull();
  });

  it("shows the submit button only on the last step", () => {
    renderShell({ currentIndex: 3 });
    expect(screen.queryByRole("button", { name: /weiter/i })).toBeNull();
    expect(screen.getByRole("button", { name: /erstellen/i })).toBeDefined();
  });

  it("disables 'next' when canNext is false", () => {
    renderShell({ currentIndex: 1, canNext: false });
    const next = screen.getByRole("button", { name: /weiter/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onNext when the next button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderShell({ currentIndex: 1 });
    await user.click(screen.getByRole("button", { name: /weiter/i }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when the back button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderShell({ currentIndex: 1 });
    await user.click(screen.getByRole("button", { name: /zurück/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit on the last step when clicking the submit button", async () => {
    const user = userEvent.setup();
    const { props } = renderShell({ currentIndex: 3 });
    await user.click(screen.getByRole("button", { name: /erstellen/i }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables submit while isSubmitting is true", () => {
    renderShell({ currentIndex: 3, isSubmitting: true });
    // While submitting, the label flips to common.creating (DE: "Erstellt...")
    const submit = screen.getByRole("button", { name: /erstellt/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("WizardShell – content slot", () => {
  it("renders the children into the content area", () => {
    renderShell();
    expect(screen.getByTestId("step-content").textContent).toBe("step body");
  });

  it("does not render the sidebar aside element when no sidebar is given", () => {
    const { container } = renderShell();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("renders the sidebar aside element when a sidebar node is provided", () => {
    const { container } = renderShell({
      sidebar: <div data-testid="sidebar-content">sidebar</div>,
    });
    expect(container.querySelector("aside")).not.toBeNull();
    expect(screen.getByTestId("sidebar-content").textContent).toBe("sidebar");
  });
});
