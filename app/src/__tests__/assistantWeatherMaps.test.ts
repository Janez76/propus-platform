import { describe, expect, it, vi } from "vitest";
import { createWeatherHandlers } from "@/lib/assistant/tools/weather";
import { createMapsHandlers } from "@/lib/assistant/tools/maps";

const ctx = { userId: "u", userEmail: "u@example.com" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  } as unknown as Response;
}

describe("assistant weather tools", () => {
  it("get_weather_forecast resolves zip via lookupZip and returns days", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        current: { time: "2026-05-01T08:00", temperature_2m: 14, weather_code: 1, relative_humidity_2m: 70, wind_speed_10m: 8, precipitation: 0 },
        daily: {
          time: ["2026-05-01", "2026-05-02"],
          weather_code: [1, 61],
          temperature_2m_max: [16, 12],
          temperature_2m_min: [9, 7],
          precipitation_probability_max: [10, 80],
          wind_speed_10m_max: [12, 22],
          sunrise: ["2026-05-01T06:10", "2026-05-02T06:09"],
          sunset: ["2026-05-01T20:25", "2026-05-02T20:26"],
        },
      }),
    );
    const handlers = createWeatherHandlers({ fetch });
    const result = (await handlers.get_weather_forecast({ zip: "8001", days: 2 }, ctx)) as Record<string, unknown>;

    expect(fetch).toHaveBeenCalledOnce();
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("api.open-meteo.com");
    expect(url).toContain("models=icon_d2");
    expect(result.location).toMatchObject({ zip: "8001", area: "Zürich Altstadt" });
    expect(result.attribution).toBe("Open-Meteo · MeteoSwiss ICON-CH");
    expect(Array.isArray(result.days)).toBe(true);
    expect((result.days as unknown[]).length).toBe(2);
    expect(result.warningsNote).toContain("meteoschweiz.admin.ch");
  });

  it("get_weather_forecast returns error for unknown zip", async () => {
    const fetch = vi.fn();
    const handlers = createWeatherHandlers({ fetch });
    const result = (await handlers.get_weather_forecast({ zip: "9999" }, ctx)) as { error?: string };

    expect(fetch).not.toHaveBeenCalled();
    expect(result.error).toContain("PLZ 9999");
  });

  it("get_weather_forecast requires lat/lng or zip", async () => {
    const fetch = vi.fn();
    const handlers = createWeatherHandlers({ fetch });
    const result = (await handlers.get_weather_forecast({}, ctx)) as { error?: string };
    expect(fetch).not.toHaveBeenCalled();
    expect(result.error).toContain("lat/lng oder zip");
  });

  it("get_weather_for_order returns error when order lacks schedule date", async () => {
    const queryOne = vi.fn().mockResolvedValue({
      order_no: 42,
      address: "Bahnhofstrasse 1, 8001 Zürich",
      zip: "8001",
      schedule: { date: null },
    });
    const handlers = createWeatherHandlers({ queryOne, fetchOrderWeather: vi.fn() });
    const result = (await handlers.get_weather_for_order({ order_id: "42" }, ctx)) as { error?: string };
    expect(result.error).toContain("keinen Termin");
  });
});

describe("assistant maps tools", () => {
  it("get_route returns error when no API key configured", async () => {
    const fetch = vi.fn();
    const handlers = createMapsHandlers({ fetch, apiKey: "" });
    const oldEnv = process.env.GOOGLE_MAPS_API_KEY;
    const oldServer = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    try {
      const result = (await handlers.get_route(
        { origin: "A", destination: "B" },
        ctx,
      )) as { error?: string };
      expect(fetch).not.toHaveBeenCalled();
      expect(result.error).toContain("GOOGLE_MAPS_SERVER_KEY");
    } finally {
      if (oldEnv) process.env.GOOGLE_MAPS_API_KEY = oldEnv;
      if (oldServer) process.env.GOOGLE_MAPS_SERVER_KEY = oldServer;
    }
  });

  it("get_route parses Google Directions response and returns legs/steps", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "OK",
        routes: [
          {
            summary: "A1",
            warnings: [],
            overview_polyline: { points: "abc" },
            legs: [
              {
                distance: { text: "10 km", value: 10000 },
                duration: { text: "12 Min.", value: 720 },
                duration_in_traffic: { text: "15 Min.", value: 900 },
                start_address: "Zürich",
                end_address: "Winterthur",
                steps: [
                  { distance: { text: "1 km" }, duration: { text: "2 Min." }, html_instructions: "<b>Links</b> abbiegen", travel_mode: "DRIVING" },
                ],
              },
            ],
          },
        ],
      }),
    );
    const handlers = createMapsHandlers({ fetch, apiKey: "TESTKEY" });
    const result = (await handlers.get_route(
      { origin: "Zürich HB", destination: "Winterthur HB", departure_time: "now" },
      ctx,
    )) as Record<string, unknown>;

    expect(fetch).toHaveBeenCalledOnce();
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain("departure_time=now");
    expect(url).toContain("key=TESTKEY");
    expect(result.summary).toBe("A1");
    expect(result.totalDistanceMeters).toBe(10000);
    expect(result.totalDurationSeconds).toBe(720);
    expect(Array.isArray(result.steps)).toBe(true);
    expect((result.steps as Array<{ instruction: string }>)[0].instruction).toBe("Links abbiegen");
  });

  it("get_route forwards Directions API error status", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ status: "ZERO_RESULTS", error_message: "no route" }),
    );
    const handlers = createMapsHandlers({ fetch, apiKey: "K" });
    const result = (await handlers.get_route(
      { origin: "X", destination: "Y" },
      ctx,
    )) as { error?: string };
    expect(result.error).toContain("ZERO_RESULTS");
    expect(result.error).toContain("no route");
  });

  it("get_distance_matrix limits inputs to MAX_BATCH and parses matrix", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "OK",
        origin_addresses: ["A"],
        destination_addresses: ["X", "Y"],
        rows: [
          {
            elements: [
              { status: "OK", distance: { text: "5 km", value: 5000 }, duration: { text: "8 Min.", value: 480 } },
              { status: "OK", distance: { text: "12 km", value: 12000 }, duration: { text: "20 Min.", value: 1200 } },
            ],
          },
        ],
      }),
    );
    const handlers = createMapsHandlers({ fetch, apiKey: "K" });
    const result = (await handlers.get_distance_matrix(
      { origins: ["A"], destinations: ["X", "Y"] },
      ctx,
    )) as Record<string, unknown>;

    expect(result.originCount).toBe(1);
    expect(result.destinationCount).toBe(2);
    expect((result.matrix as Array<{ cells: unknown[] }>)[0].cells.length).toBe(2);
  });

  it("get_travel_time_for_orders sorts by duration ascending", async () => {
    const query = vi.fn().mockResolvedValue([
      { order_no: 10, address: "Adresse A" },
      { order_no: 11, address: "Adresse B" },
    ]);
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "OK",
        rows: [
          {
            elements: [
              { status: "OK", distance: { text: "20 km", value: 20000 }, duration: { text: "30 Min.", value: 1800 } },
              { status: "OK", distance: { text: "5 km", value: 5000 }, duration: { text: "10 Min.", value: 600 } },
            ],
          },
        ],
      }),
    );
    const handlers = createMapsHandlers({ query, fetch, apiKey: "K" });
    const result = (await handlers.get_travel_time_for_orders(
      { start_address: "Zürich HB", order_ids: ["10", "11"] },
      ctx,
    )) as { orders: Array<{ orderNo: number; durationSeconds: number | null }> };

    expect(result.orders.map((o) => o.orderNo)).toEqual([11, 10]);
  });
});
