/** Google Maps JS – abgedunkelte Karte, passend zu html.dark / Buchungs-Wizard */
export const GMAPS_DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1e1f22" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1e1f22" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2d2f33" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#25262a" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2e32" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#3d3f44" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a1a1aa" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#25262a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#12141a" }] },
];
