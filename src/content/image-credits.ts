/**
 * Stock photographs used on the public website (Openverse; CC0, public domain or CC BY).
 * Every entry is listed on /legal/image-credits. These photos illustrate trades and places; they are not
 * pictures of Venkat Sai staff, trainees or premises.
 */
export type ImageCredit = {
  /** Path under /public, e.g. "/images/stock/welding-1.webp". */
  src: string;
  topic:
    | "welding"
    | "pipe"
    | "fabrication"
    | "electrical"
    | "rigging"
    | "scaffolding"
    | "mechanical"
    | "inspection"
    | "safety"
    | "crew"
    | "gulf"
    | "travel"
    | "training"
    | "plant"
    | "shipyard";
  /** Short, factual alt text describing what is visible (no claims about who the people are). */
  alt: string;
  width: number;
  height: number;
  title: string;
  creator: string;
  /** Openverse foreign_landing_url (the page where the photo was published). */
  sourceUrl: string;
  /** e.g. "CC0 1.0", "Public Domain Mark 1.0", "CC BY 2.0". */
  license: string;
  licenseUrl: string;
};

export const IMAGE_CREDITS: readonly ImageCredit[] = [
  // welding
  {
    src: "/images/stock/welding-1.webp",
    topic: "welding",
    alt: "Welder in a welding helmet silhouetted against a sunset sky, welding a steel pipe frame as sparks fly",
    width: 1600,
    height: 1066,
    title: "Finishing Touches",
    creator: "U.S. Marine Corps",
    sourceUrl: "https://www.flickr.com/photos/marine_corps/14590897686/",
    license: "Public domain (U.S. Government work)",
    licenseUrl: "https://www.usa.gov/government-copyright",
  },
  {
    src: "/images/stock/welding-2.webp",
    topic: "welding",
    alt: "Welder lying beneath a steel deck structure, welding overhead in a shower of sparks",
    width: 1600,
    height: 1066,
    title: "Extreme Park Welding",
    creator: "City of Greenville, North Carolina",
    sourceUrl: "https://www.flickr.com/photos/156869144@N02/51321585037",
    license: "Public Domain Mark 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  {
    src: "/images/stock/welding-3.webp",
    topic: "welding",
    alt: "Close-up of a welder in a hard hat and face shield TIG welding a stainless steel pipe joint",
    width: 1600,
    height: 1066,
    title: "MomekIndustrimekanikerSveiser",
    creator: "Bjorn Leirvik",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=36493156",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  // pipe
  {
    src: "/images/stock/pipe-1.webp",
    topic: "pipe",
    alt: "Worker in a hard hat grinding the inside of a large spiral-welded steel pipe, sparks spraying",
    width: 1600,
    height: 1067,
    title: "Spiral Welding",
    creator: "Mostafa Gholamnejad",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=141172572",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    src: "/images/stock/pipe-2.webp",
    topic: "pipe",
    alt: "Welder in a welding helmet welding a large black steel pipe in a workshop",
    width: 1600,
    height: 1066,
    title:
      "Blue Grass Chemical Agent-Destruction Pilot Plant Static Detonation Chamber 2000 (51944362010)",
    creator: "PEO ACWA",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=118876343",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  // fabrication
  {
    src: "/images/stock/fabrication-1.webp",
    topic: "fabrication",
    alt: "Worker in a face shield and ear defenders grinding steel held in a vice, sparks flying",
    width: 1600,
    height: 1067,
    title:
      "Flickr - DVIDSHUB - Sparks fly in 19th Civil Engineer Squadron (Image 8 of 12)",
    creator: "DVIDSHUB",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=22421110",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  {
    src: "/images/stock/fabrication-2.webp",
    topic: "fabrication",
    alt: "Ironworker on an aerial work platform fastening a structural steel beam against a blue sky",
    width: 1600,
    height: 1067,
    title:
      "Blue Grass Chemical Agent-Destruction Pilot Plant Utility Building Structural Steel (4705674261)",
    creator: "PEO ACWA",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=80269895",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  // electrical
  {
    src: "/images/stock/electrical-1.webp",
    topic: "electrical",
    alt: "Two electricians in hard hats checking the wiring inside an open industrial control cabinet",
    width: 1600,
    height: 1067,
    title:
      "Pueblo Chemical Agent-Destruction Pilot Plant Agent Processing Building (16044423789)",
    creator: "PEO ACWA",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=80268415",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  {
    src: "/images/stock/electrical-2.webp",
    topic: "electrical",
    alt: "Close-up of an electrical control panel with circuit breakers, wired terminals and push buttons",
    width: 1600,
    height: 1067,
    title: "Control panel with electrical components and buttons",
    creator: "Shixart1985",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=192577787",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  // rigging
  {
    src: "/images/stock/rigging-1.webp",
    topic: "rigging",
    alt: "Crawler crane lifting a large yellow equipment module while workers in coveralls steady it with tag lines",
    width: 1600,
    height: 1067,
    title:
      "Early Kick Detection Identified as Key to Preventing Loss of Well Control",
    creator: "Bureau of Safety and Environmental Enforcement (bseegov)",
    sourceUrl: "https://www.flickr.com/photos/123443813@N05/33193210225",
    license: "Public Domain Mark 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  {
    src: "/images/stock/rigging-2.webp",
    topic: "rigging",
    alt: "Large lattice-boom crane lifting a white steel arch footbridge into place over a river",
    width: 1600,
    height: 1067,
    title: "Crane lifting Waterside Bridge - 10 November 2025",
    creator: "Aethonatic",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=178213731",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  // scaffolding
  {
    src: "/images/stock/scaffolding-1.webp",
    topic: "scaffolding",
    alt: "Multi-storey tube-and-fitting scaffold around a building under construction, with workers in hi-vis on an upper deck",
    width: 1600,
    height: 1067,
    title:
      "Scaffolding and workers at the Royal Edinburgh Hospital (23760439516)",
    creator: "Scottish Government",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=107548844",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  {
    src: "/images/stock/scaffolding-2.webp",
    topic: "scaffolding",
    alt: "Worker in a hard hat and hi-vis vest behind system scaffolding on a building facade",
    width: 1600,
    height: 1067,
    title:
      "Construction worker on scaffolding during Mountbatten House redevelopment, Chatham, Kent",
    creator: "OathOn",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=174680378",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  // mechanical
  {
    src: "/images/stock/mechanical-1.webp",
    topic: "mechanical",
    alt: "Technician in coveralls and a hard hat working on stainless steel pipework and valves in an industrial plant",
    width: 1600,
    height: 1067,
    title:
      "Pueblo Chemical Agent-Destruction Pilot Plant Agent Processing Building (22678602067)",
    creator: "PEO ACWA",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=80267873",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  // inspection
  {
    src: "/images/stock/inspection-1.webp",
    topic: "inspection",
    alt: "Inspector under ultraviolet light carrying out a fluorescent magnetic particle test on a metal part",
    width: 1600,
    height: 1066,
    title: "170110-F-LX370-0244",
    creator: "U.S. Department of Defense Current Photos",
    sourceUrl: "https://www.flickr.com/photos/39955793@N07/32214767642",
    license: "Public Domain Mark 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  // safety
  {
    src: "/images/stock/safety-1.webp",
    topic: "safety",
    alt: "Technician wearing a blue hard hat and safety glasses using a power tool during maintenance work",
    width: 1600,
    height: 1066,
    title: 'USS Hershel "Woody" Williams (ESB 4) maintenance',
    creator: "Commander, U.S. Naval Forces Europe-Africa/U.S. 6th Fleet",
    sourceUrl: "https://www.flickr.com/photos/cne-cna-c6f/51145581062/",
    license: "Public Domain Mark 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  // crew
  {
    src: "/images/stock/crew-1.webp",
    topic: "crew",
    alt: "Construction crew in hard hats and hi-vis vests laying brick pavers on a site",
    width: 1600,
    height: 1067,
    title: "Town Creek Culvert",
    creator: "City of Greenville, North Carolina",
    sourceUrl: "https://www.flickr.com/photos/cityofgreenvillenc/49520688303/",
    license: "Public Domain Mark 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  {
    src: "/images/stock/crew-2.webp",
    topic: "crew",
    alt: "Construction workers in hard hats and hi-vis vests gathering at a shaft hoist cage before going underground",
    width: 1600,
    height: 1066,
    title: "7Line_5272",
    creator: "Metropolitan Transportation Authority / Patrick Cashin",
    sourceUrl: "https://www.flickr.com/photos/61135621@N03/5836673448",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  {
    src: "/images/stock/crew-3.webp",
    topic: "crew",
    alt: "Workers in hard hats on a work platform beside a ship's hull in a dry dock",
    width: 1600,
    height: 1067,
    title: "Modernisation de la Thalassa (Ifremer 00400-51186 - 35324)",
    creator: "Stephane Lesbats",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=159371634",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  // gulf
  {
    src: "/images/stock/gulf-1.webp",
    topic: "gulf",
    alt: "Aerial view of the Dubai skyline with the Burj Khalifa rising above low-rise districts",
    width: 1600,
    height: 1067,
    title: "Dubai Skyline mit Burj Khalifa (18241030269)",
    creator: "Tim Reckmann from Hamm, Deutschland",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=82789105",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  {
    src: "/images/stock/gulf-2.webp",
    topic: "gulf",
    alt: "Doha skyline seen across the water in soft morning light",
    width: 1600,
    height: 1067,
    title: "Doha skyline in the morning (12544910974)",
    creator: "Francisco Anzola",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=32181989",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  // travel
  {
    src: "/images/stock/travel-1.webp",
    topic: "travel",
    alt: "Bright airport departure hall with travellers walking towards the gates",
    width: 1600,
    height: 1067,
    title: "Oslo airport departure gates",
    creator: "Avinor Oslo lufthavn/Espen Solli",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=60970057",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  {
    src: "/images/stock/travel-2.webp",
    topic: "travel",
    alt: "Twin-engine passenger jet lifting off from a runway with hills in the background",
    width: 1600,
    height: 1067,
    title: "Airplane taking off at Zurich Airport (53076971424)",
    creator: "kuhnmi",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=138869387",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  // training
  {
    src: "/images/stock/training-1.webp",
    topic: "training",
    alt: "Trainee in safety glasses wiring electrical outlets in a timber-framed training booth",
    width: 1600,
    height: 1067,
    title: "Workforce Development",
    creator: "City of Greenville, North Carolina",
    sourceUrl: "https://www.flickr.com/photos/cityofgreenvillenc/49743344296/",
    license: "Public Domain Mark 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  {
    src: "/images/stock/training-2.webp",
    topic: "training",
    alt: "Trainees gathered at a lathe in a large workshop lined with machine tools",
    width: 1600,
    height: 1067,
    title:
      "Mechanical engineering workshop at Arusha Technical College, Tanzania",
    creator: "Hilda Raphael",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=190632691",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  // plant
  {
    src: "/images/stock/plant-1.webp",
    topic: "plant",
    alt: "Petrochemical plant with distillation columns, pipe racks and steel stairways under a blue sky",
    width: 1600,
    height: 1066,
    title: "TASNEE 001",
    creator: "Secl",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=7500704",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  {
    src: "/images/stock/plant-2.webp",
    topic: "plant",
    alt: "Refinery lights and chimneys on the far shore of a calm bay at dusk, with a small boat in the foreground",
    width: 1600,
    height: 1067,
    title: "Sunset over Trommekilen from Norrkila 8",
    creator: "W.carter",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=89619359",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  // shipyard
  {
    src: "/images/stock/shipyard-1.webp",
    topic: "shipyard",
    alt: "Shipyard cranes standing over a ship under construction, lit by low evening sun",
    width: 1600,
    height: 1067,
    title: "Sestaoko ontziolako garabi batzuk",
    creator: "Gorkaazk",
    sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=27479700",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
];

export function creditFor(src: string): ImageCredit | undefined {
  return IMAGE_CREDITS.find((c) => c.src === src);
}
