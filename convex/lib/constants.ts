export const FORM_TEMPLATE = [
  {
    section: "General Property Check",
    items: [
      "Front door and entryway clean",
      "Light switches and door handles wiped",
      "Windows and sills wiped (interior)",
      "All lights functional",
      "Thermostat set to default",
      "Smoke detectors visible and intact",
      "No personal items left behind by guests",
      "No visible damage to walls or fixtures",
      "Pleasant scent (no chemical smell)",
    ],
  },
  {
    section: "Bathroom Gold Standard",
    items: [
      "Toilet cleaned and sanitized (inside and out)",
      "Sink and vanity cleaned and polished",
      "Mirror cleaned (streak-free)",
      "Shower/tub scrubbed and rinsed",
      "Shower glass/door cleaned (no water spots)",
      "Faucets polished (no water marks)",
      "Towels folded/replaced per property standard",
      "Toiletries organized and restocked",
      "Trash emptied and bag replaced",
      "Floor swept and mopped",
      "Grout and caulking inspected",
    ],
  },
  {
    section: "Kitchen Gold Standard",
    items: [
      "Countertops wiped and sanitized",
      "Sink cleaned and polished",
      "Stovetop cleaned (no grease or residue)",
      "Oven exterior wiped",
      "Microwave interior and exterior cleaned",
      "Refrigerator exterior wiped",
      "Dishwasher exterior wiped",
      "Cabinet fronts wiped down",
      "Small appliances wiped and organized",
      "Trash emptied and bag replaced",
      "Floor swept and mopped",
    ],
  },
  {
    section: "Living Area / Bedroom",
    items: [
      "Bed made with fresh linens (per property standard)",
      "Pillows fluffed and arranged",
      "Nightstands and dresser surfaces dusted",
      "Closet organized (hangers aligned, shelves neat)",
      "Couch cushions fluffed/straightened",
      "Coffee table and side tables cleaned",
      "TV screen dusted (dry cloth only)",
      "Remote controls wiped and placed",
      "Bookshelves and decor dusted",
      "Throw blankets folded neatly",
      "Under bed checked for debris",
      "Lamps and light switches wiped",
    ],
  },
  {
    section: "Floors (Final Step)",
    items: [
      "All hard floors swept",
      "All hard floors mopped",
      "Carpeted areas vacuumed",
      "Rugs straightened and aligned",
      "Floor edges and corners cleaned",
      "No visible stains, marks, or debris",
      "Baseboards wiped (spot check)",
    ],
  },
  {
    section: "Exterior / Patio (if applicable)",
    items: [
      "Patio/deck swept",
      "Outdoor furniture wiped down",
      "Outdoor cushions arranged",
      "Grill exterior wiped (if applicable)",
      "Outdoor trash emptied",
      "Entryway mat shaken/cleaned",
      "Exterior door wiped (outside)",
    ],
  },
  {
    section: "Final Walkthrough (Client Perspective)",
    items: [
      "Walk through property as if you were the guest",
      "All lights off except entry light",
      "All windows locked",
      "All doors locked",
      "Temperature comfortable (AC/heat set)",
      "Overall appearance check (would you be happy?)",
      "Photo documentation of key areas completed",
    ],
  },
];

export const MAX_REWORK_COUNT = 2;

export const JOB_TYPE_LABELS: Record<string, string> = {
  standard: "Standard Clean",
  deep_clean: "Deep Clean",
  turnover: "Turnover",
  move_in_out: "Move In/Out",
  maintenance: "Maintenance",
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-800",
  medium: "bg-orange-100 text-orange-800",
  high: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900",
};
