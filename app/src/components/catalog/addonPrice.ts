import { computeTourPrice } from "../../lib/bookingPricing";
import type { CatalogAddon } from "../../api/bookingPublic";

export function addonPrice(addon: CatalogAddon, area: number, floors: number): number {
  if (addon.pricingType === "byArea" || addon.pricingType === "per_area") {
    return computeTourPrice(area);
  }
  if (addon.pricingType === "per_floor" || addon.pricingType === "perFloor") {
    return (addon.unitPrice ?? addon.price) * floors;
  }
  return addon.price;
}
