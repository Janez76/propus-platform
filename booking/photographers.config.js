const PHOTOGRAPHERS = [
  {
    key: "janez",
    name: "Janez Smirmaul",
    email: "janez.smirmaul@propus.ch",
    phone: "+41 76 340 70 75",
    image: "assets/photographers/Janez.png",
    initials: "JS"
  },
  {
    key: "ivan",
    name: "Ivan Mijajlovic",
    email: "ivan.mijajlovic@propus.ch",
    phone: "",
    image: "assets/photographers/Ivan.png",
    initials: "IM"
  },
  {
    key: "maher",
    name: "Maher Azizi",
    email: "ma@propus.ch",
    phone: "",
    image: "assets/photographers/Maher.png",
    initials: "MA"
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = PHOTOGRAPHERS;
}
if (typeof window !== "undefined") {
  window.PHOTOGRAPHERS_CONFIG = PHOTOGRAPHERS;
}
