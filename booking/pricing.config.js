const PACKAGE_PRICES = {
  cinematic: 549,
  bestseller: 399,
  fullview: 649
};

const ADDON_PRICES = {
  camera: { foto10: 229, foto20: 309, foto30: 360 },
  dronePhoto: { foto4: 249, foto8: 329, foto12: 399 },
  groundVideo: { reel30: 299, clip12: 499 },
  droneVideo: { reel30: 269, clip12: 399 },
  express: { "24h": 99 },
  keypickup: { main: 50 }
};

const FLOORPLAN_UNIT = {
  tour: 49,
  notour: 79,
  sketch: 149
};

const STAGING_UNIT = {
  stLiving: 99,
  stBusiness: 149,
  stRenov: 199
};

module.exports = {
  PACKAGE_PRICES,
  ADDON_PRICES,
  FLOORPLAN_UNIT,
  STAGING_UNIT
};
