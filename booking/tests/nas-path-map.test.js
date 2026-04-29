const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  mapBookingContainerPathToNas,
  mapContainerStagingToVpsHostPath,
  buildRsyncRemoteSource,
  mapNasLocalPathToContainer,
} = require("../nas-path-map");

const env = {
  NAS_BOOKING_UPLOAD_RAW_ROOT: "/volume1/PROPUS DRIVE/raw",
  NAS_BOOKING_UPLOAD_CUSTOMER_ROOT: "/volume1/PROPUS DRIVE/kunden",
  NAS_VPS_STAGING_HOST_PATH: "/opt/propus-upload-staging",
  BOOKING_UPLOAD_STAGING_ROOT: "/upload_staging",
};

test("mapBookingContainerPathToNas maps raw and customer roots", () => {
  const raw = mapBookingContainerPathToNas("/booking_upload_raw/8266 Test/Unbearbeitete", env);
  assert.equal(
    raw,
    path.join("/volume1/PROPUS DRIVE/raw", "8266 Test", "Unbearbeitete")
  );
  const cust = mapBookingContainerPathToNas("/booking_upload_customer/foo/Finale", env);
  assert.equal(
    cust,
    path.join("/volume1/PROPUS DRIVE/kunden", "foo", "Finale")
  );
});

test("mapNasLocalPathToContainer inverts raw and customer", () => {
  const nasRaw = path.join("/volume1/PROPUS DRIVE/raw", "8266", "x");
  const rawOut = mapNasLocalPathToContainer(nasRaw, env).replace(/\\/g, "/");
  assert.equal(rawOut, "/booking_upload_raw/8266/x");
  const nasCust = path.join("/volume1/PROPUS DRIVE/kunden", "a", "b");
  const custOut = mapNasLocalPathToContainer(nasCust, env).replace(/\\/g, "/");
  assert.equal(custOut, "/booking_upload_customer/a/b");
});

test("mapContainerStagingToVpsHostPath maps upload_staging to host root", () => {
  const h = mapContainerStagingToVpsHostPath("/upload_staging/upl_1/file.bin", env);
  assert.equal(h, path.join("/opt/propus-upload-staging", "upl_1", "file.bin"));
});

test("buildRsyncRemoteSource joins host and absolute path", () => {
  const spec = buildRsyncRemoteSource("root@87.106.24.107", "/opt/propus-upload-staging/x.bin");
  assert.equal(spec, "root@87.106.24.107:/opt/propus-upload-staging/x.bin");
});
