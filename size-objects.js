"use strict";
// Dimensions are explicit measures, not bounding boxes inferred from artwork.
// Original GiG silhouettes are keyed by shape; no Magnitudle artwork is copied.
const objects = [];
function add(
  id,
  name,
  nameEn,
  m,
  shape,
  aspect,
  measure,
  source,
  family = id,
  note = "",
) {
  objects.push({
    id,
    name,
    nameEn,
    m,
    shape,
    aspect,
    measure,
    measureEn: {
      Länge: "Length",
      Höhe: "Height",
      Breite: "Width",
      Durchmesser: "Diameter",
      Spannweite: "Wingspan",
    }[measure],
    source,
    family,
    note,
  });
}
const nist =
  "https://www.nist.gov/pml/owm/metric-sports-summer-games-fast-facts";
add(
  "pingpong",
  "Tischtennisball",
  "Table tennis ball",
  0.04,
  "ball",
  1,
  "Durchmesser",
  nist,
);
add(
  "tennisball",
  "Tennisball – Standardmodell",
  "Tennis ball – standard model",
  0.067,
  "tennis",
  1,
  "Durchmesser",
  nist,
  "tennisball",
  "Normbereich 6,54–6,86 cm; für dieses Spiel 6,7 cm.",
);
add(
  "football",
  "Fußball – Standardmodell",
  "Football – standard model",
  0.69 / Math.PI,
  "football",
  1,
  "Durchmesser",
  nist,
  "football",
  "Durchmesser aus 69 cm Umfang berechnet; Normbereich des Umfangs 68–70 cm.",
);
add(
  "basketball",
  "Basketball – Herrenmodell",
  "Basketball – men’s model",
  0.76 / Math.PI,
  "basketball",
  1,
  "Durchmesser",
  nist,
  "basketball",
  "Durchmesser aus 76 cm Umfang berechnet; Herren-Referenz.",
);
add(
  "volleyball",
  "Volleyball – Standardmodell",
  "Volleyball – standard model",
  0.66 / Math.PI,
  "volleyball",
  1,
  "Durchmesser",
  nist,
  "volleyball",
  "Durchmesser aus 66 cm Umfang berechnet.",
);
add(
  "tabletennis",
  "Tischtennisplatte",
  "Table tennis table",
  2.74,
  "table",
  0.58,
  "Länge",
  nist,
  "tabletennis",
);
add(
  "tenniscourt",
  "Tennisplatz",
  "Tennis court",
  23.77,
  "court",
  0.462,
  "Länge",
  nist,
  "court-tennis",
);
add(
  "volleycourt",
  "Volleyballfeld",
  "Volleyball court",
  18,
  "court",
  0.5,
  "Länge",
  nist,
  "court-volley",
);
add(
  "hoop",
  "Basketballkorb – Ring",
  "Basketball hoop – ring",
  0.45,
  "ring",
  1,
  "Durchmesser",
  nist,
);
add(
  "barbell",
  "Herren-Langhantel",
  "Men’s weightlifting bar",
  2.2,
  "barbell",
  0.18,
  "Länge",
  nist,
  "barbell",
);
add(
  "barbellw",
  "Damen-Langhantel",
  "Women’s weightlifting bar",
  2.01,
  "barbell",
  0.18,
  "Länge",
  nist,
  "barbell",
);
const air =
  "https://www.airbus.com/sites/g/files/jlcbta136/files/2022-01/EN-Airbus-A380-Facts-and-Figures-January-2022.pdf";
add(
  "a380",
  "Airbus A380",
  "Airbus A380",
  72.7,
  "airliner",
  0.33,
  "Länge",
  air,
  "a380",
);
add(
  "a380wing",
  "Airbus A380 von vorne",
  "Airbus A380 – front view",
  79.8,
  "plane-front",
  0.302,
  "Spannweite",
  air,
  "a380",
);
const a320 =
  "https://mediaassets.airbus.com/pm_38_914_914157-tlwvtuuhjj.pdf?fileName=airbus-a320-family-facts-and-figures-june-2026.pdf";
for (const [id, name, m] of [
  ["a319", "Airbus A319neo", 33.84],
  ["a320", "Airbus A320neo", 37.57],
  ["a321", "Airbus A321neo", 44.51],
])
  add(id, name, name, m, "airliner", 0.31, "Länge", a320, "a320-family");
add(
  "saturn",
  "Saturn V – aufgestellt",
  "Saturn V – upright",
  111,
  "rocket",
  0.13,
  "Höhe",
  "https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/",
  "rocket",
);
add(
  "eiffel",
  "Eiffelturm inkl. Antenne",
  "Eiffel Tower incl. antenna",
  330,
  "tower",
  0.38,
  "Höhe",
  "https://www.toureiffel.paris/en/news/history-and-culture/300-330-meters-story-towers-height",
  "tower",
);
add(
  "bluewhale",
  "Blauwal (größtes Referenztier)",
  "Blue whale (maximum reference animal)",
  33.528,
  "whale",
  0.22,
  "Länge",
  "https://www.fisheries.noaa.gov/species/blue-whale",
  "whale",
  "NOAA: bis 110 Fuß, exakt in Meter umgerechnet. Keine durchschnittliche Tiergröße.",
);
const apple = "https://www.apple.com/iphone-16/specs/";
add(
  "iphone",
  "iPhone 16 – aufrecht",
  "iPhone 16 – upright",
  0.1476,
  "phone",
  0.485,
  "Höhe",
  apple,
  "iphone",
);
// ISO A-series: the long edge is the requested measure. Dimensions are fixed standards.
const paper = "https://www.iso.org/standard/36631.html";
for (const [i, m, w] of [
  [0, 1.189, 0.841],
  [1, 0.841, 0.594],
  [2, 0.594, 0.42],
  [3, 0.42, 0.297],
  [4, 0.297, 0.21],
  [5, 0.21, 0.148],
  [6, 0.148, 0.105],
])
  add(
    "paper" + i,
    "DIN A" + i + " – lange Seite",
    "A" + i + " paper – long edge",
    m,
    "paper",
    w / m,
    "Länge",
    paper,
    "paper",
  );
// Exact defined lengths provide unambiguous small and human-scale references.
const metric = "https://www.nist.gov/pml/owm/si-units-length";
for (const [id, n, en, m] of [
  ["ruler", "30-cm-Lineal", "30 cm ruler", 0.3],
  ["metre", "Meterstab – ausgeklappt", "Metre rule – unfolded", 1],
  ["yard", "1 Yard – Messlatte", "1 yard measuring rod", 0.9144],
  ["foot", "1 Fuß – Messlatte", "1 foot measuring rod", 0.3048],
  ["inch", "1 Zoll – Messstrecke", "1 inch measure", 0.0254],
])
  add(
    id,
    n,
    en,
    m,
    "ruler",
    0.1,
    "Länge",
    metric,
    "ruler",
    "Fest definierte Messstrecke.",
  );
add(
  "orca",
  "Orca (größtes Referenztier)",
  "Orca (maximum reference animal)",
  9.7536,
  "orca",
  0.28,
  "Länge",
  "https://www.fisheries.noaa.gov/species/killer-whale",
  "whale",
  "NOAA: bis 32 Fuß, in Meter umgerechnet.",
);
add(
  "humpback",
  "Buckelwal (größtes Referenztier)",
  "Humpback whale (maximum reference animal)",
  18.288,
  "humpback",
  0.3,
  "Länge",
  "https://www.fisheries.noaa.gov/species/humpback-whale",
  "whale",
  "NOAA: bis etwa 60 Fuß, in Meter umgerechnet.",
);
add(
  "iss",
  "Internationale Raumstation",
  "International Space Station",
  109,
  "station",
  0.6,
  "Spannweite",
  "https://www.nasa.gov/international-space-station/space-station-facts-and-figures/",
  "station",
);
add(
  "shuttle",
  "Space-Shuttle-Orbiter",
  "Space Shuttle orbiter",
  37.1856,
  "shuttle",
  0.45,
  "Länge",
  "https://www.nasa.gov/reference/the-space-shuttle/",
  "shuttle",
  "NASA: 122 Fuß, in Meter umgerechnet.",
);
add(
  "f1",
  "F1-Auto 2026 – von vorne",
  "2026 F1 car – front view",
  1.9,
  "f1-front",
  0.53,
  "Breite",
  "https://www.fia.com/news/new-era-competition-fia-showcases-future-focused-formula-1-regulations-2026-and-beyond",
  "f1",
  "FIA-Regelreferenz: maximale Fahrzeugbreite 1.900 mm.",
);
add(
  "mini",
  "MINI Cooper – 3 Türen",
  "MINI Cooper – 3 doors",
  3.876,
  "car",
  0.375,
  "Länge",
  "https://www.mini.ch/de_CH/home/range/mini-cooper-3-door/technical-data.html",
  "mini",
);
module.exports = { objects };
