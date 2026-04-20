import { computeTourPrice } from "../../lib/bookingPricing";
import type { CatalogAddon } from "../../api/bookingPublic";

export function addonPrice(addon: CatalogAddon, area: number, floors: number): number {
  if (addon.pricingType === "byArea" || addon.pricingType === "per_area") {
    return computeTourPrice(area);
  }
  if (addon.pricingType === "per_floor" || addon.pricingType === "perFloor") {
    const unit = Number(addon.unitPrice ?? addon.price) || 0;
    return unit * (Number(floors) || 0);
  }
  return Number(addon.price) || 0;
}
