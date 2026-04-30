import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateMemoryBody } from "@/lib/assistant/memory-store";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";

describe("validateMemoryBody", () => {
  it("rejects empty body", () => {
    expect(validateMemoryBody("")).toBe("Body darf nicht leer sein");
    expect(validateMemoryBody("   ")).toBe("Body darf nicht leer sein");
  });

  it("rejects body exceeding 2000 chars", () => {
    const long = "a".repeat(2001);
    expect(validateMemoryBody(long)).toMatch(/max\. 2000/);
  });

  it("accepts body at exactly 2000 chars", () => {
    const ok = "Ich mag ".repeat(250);
    expect(validateMemoryBody(ok.slice(0, 2000))).toBeNull();
  });

  it("rejects body containing 'password'", () => {
    expect(validateMemoryBody("Mein password ist 1234")).toMatch(/sensible/);
  });

  it("rejects body containing 'api_key'", () => {
    expect(validateMemoryBody("Die api_key lautet xyz")).toMatch(/sensible/);
  });

  it("rejects body containing 'apikey'", () => {
    expect(validateMemoryBody("Der apikey lautet xyz")).toMatch(/sensible/);
  });

  it("rejects body containing 'secret'", () => {
    expect(validateMemoryBody("The client_secret is abc")).toMatch(/sensible/);
  });

  it("rejects body containing long base64 string", () => {
    const base64 = "A".repeat(85);
    expect(validateMemoryBody(`Token: ${base64}`)).toBe("Body enthält potenziell sensible Daten");
  });

  it("accepts normal text body", () => {
    expect(validateMemoryBody("Ich bevorzuge Zusammenfassungen auf Deutsch.")).toBeNull();
  });

  it("accepts short alphanumeric strings without triggering base64", () => {
    expect(validateMemoryBody("Der Kunde heisst ABCDef12345")).toBeNull();
  });
});

describe("buildSystemPrompt with memories", () => {
  const base = {
    userName: "Janez",
    userEmail: "janez@propus.ch",
    currentTime: "30.04.2026, 23:00",
    timezone: "Europe/Zurich",
  };

  it("includes memories as bullet points", () => {
    const result = buildSystemPrompt({
      ...base,
      memories: ["Ich bevorzuge kurze Antworten", "Lieblingsfarbe: Blau"],
    });
    expect(result).toContain("Erinnerungen des Benutzers");
    expect(result).toContain("- Ich bevorzuge kurze Antworten");
    expect(result).toContain("- Lieblingsfarbe: Blau");
  });

  it("omits memories section when empty", () => {
    const result = buildSystemPrompt({ ...base, memories: [] });
    expect(result).not.toContain("Erinnerungen");
  });

  it("omits memories section when undefined", () => {
    const result = buildSystemPrompt(base);
    expect(result).not.toContain("Erinnerungen");
  });

  it("truncates memories exceeding 3000 chars total", () => {
    const longMem = "x".repeat(2800);
    const shortMem = "y".repeat(300);
    const result = buildSystemPrompt({
      ...base,
      memories: [longMem, shortMem, "Dritte Erinnerung"],
    });
    expect(result).toContain(`- ${longMem}`);
    expect(result).not.toContain(shortMem);
    expect(result).not.toContain("Dritte Erinnerung");
  });
});

describe("merk-dir regex pattern", () => {
  const MERK_DIR_REGEX = /^(?:merk\s+dir|merke\s+dir|notiere|speicher[en]?)\s*[:\s]+([\s\S]+)/i;

  it.each([
    ["Merk dir: Ich mag kurze Antworten", "Ich mag kurze Antworten"],
    ["merke dir: Der Kunde heisst Müller", "Der Kunde heisst Müller"],
    ["Notiere: Tour 123 hat Sonderwünsche", "Tour 123 hat Sonderwünsche"],
    ["Speichere: Bevorzugte Sprache ist Deutsch", "Bevorzugte Sprache ist Deutsch"],
    ["speichern: bitte immer auf deutsch", "bitte immer auf deutsch"],
    ["MERK DIR: grossbuchstaben", "grossbuchstaben"],
    ["merk  dir  etwas wichtiges", "etwas wichtiges"],
  ])("matches '%s' → '%s'", (input, expected) => {
    const match = input.match(MERK_DIR_REGEX);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe(expected);
  });

  it.each([
    "Kannst du dir merken dass",
    "Was hast du dir gemerkt?",
    "Bitte suche nach Touren",
    "Welche Aufträge hat der Kunde?",
  ])("does not match '%s'", (input) => {
    expect(input.match(MERK_DIR_REGEX)).toBeNull();
  });
});

describe("memory store DB functions", () => {
  const mockQuery = vi.fn();
  const mockQueryOne = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  async function getStoreModule() {
    vi.doMock("@/lib/db", () => ({
      query: mockQuery,
      queryOne: mockQueryOne,
    }));
    return import("@/lib/assistant/memory-store");
  }

  it("listMemoriesForUser calls query with correct params", async () => {
    mockQuery.mockResolvedValue([{ id: "1", body: "test", userId: "u1" }]);
    const store = await getStoreModule();
    const result = await store.listMemoriesForUser("u1", 10);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("assistant_memories"),
      ["u1", 10],
    );
    expect(result).toHaveLength(1);
  });

  it("listMemoriesForUser caps limit to 100", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();
    await store.listMemoriesForUser("u1", 999);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["u1", 100],
    );
  });

  it("createMemory checks limit and inserts", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ count: "5" })
      .mockResolvedValueOnce({ id: "new-id", userId: "u1", body: "test", source: "explicit_user" });
    const store = await getStoreModule();
    const result = await store.createMemory("u1", "test", "explicit_user");
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("new-id");
  });

  it("createMemory rejects when limit reached", async () => {
    mockQueryOne.mockResolvedValueOnce({ count: "100" });
    const store = await getStoreModule();
    await expect(store.createMemory("u1", "test", "explicit_user")).rejects.toThrow(/Maximal 100/);
  });

  it("createMemory rejects invalid body", async () => {
    const store = await getStoreModule();
    await expect(store.createMemory("u1", "", "explicit_user")).rejects.toThrow(/leer/);
  });

  it("createMemory rejects sensitive body", async () => {
    const store = await getStoreModule();
    await expect(store.createMemory("u1", "mein password ist xyz", "explicit_user")).rejects.toThrow(/sensible/);
  });

  it("softDeleteMemory calls update", async () => {
    mockQuery.mockResolvedValue([]);
    const store = await getStoreModule();
    await store.softDeleteMemory("u1", "mem-id");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("deleted_at"),
      ["mem-id", "u1"],
    );
  });
});
