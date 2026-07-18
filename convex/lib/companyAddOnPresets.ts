export type AddOnPresetLocale = "en" | "es";
export type AddOnPricingMethod = "flat" | "starting_at" | "per_unit";

export interface CompanyAddOnPreset {
  presetKey: string;
  en: { name: string; description: string };
  es: { name: string; description: string };
  pricingMethod: AddOnPricingMethod;
  unitLabel?: { en: string; es: string };
  estimatedDurationMinutes?: number;
}

export const COMPANY_ADD_ON_PRESETS: readonly CompanyAddOnPreset[] = [
  { presetKey: "baseboards", en: { name: "Baseboard cleaning", description: "Detailed wiping and cleaning of accessible baseboards." }, es: { name: "Limpieza de zócalos", description: "Limpieza detallada de los zócalos accesibles." }, pricingMethod: "starting_at", estimatedDurationMinutes: 30 },
  { presetKey: "interior_oven", en: { name: "Interior oven cleaning", description: "Cleaning of the oven interior, racks, and accessible surfaces." }, es: { name: "Limpieza interior del horno", description: "Limpieza del interior del horno, las rejillas y superficies accesibles." }, pricingMethod: "flat", estimatedDurationMinutes: 45 },
  { presetKey: "interior_refrigerator", en: { name: "Interior refrigerator cleaning", description: "Cleaning of empty refrigerator shelves, drawers, and interior surfaces." }, es: { name: "Limpieza interior del refrigerador", description: "Limpieza de estantes, cajones y superficies interiores del refrigerador vacío." }, pricingMethod: "flat", estimatedDurationMinutes: 40 },
  { presetKey: "interior_windows", en: { name: "Interior windows", description: "Cleaning of accessible interior window glass and sills." }, es: { name: "Ventanas interiores", description: "Limpieza de vidrios interiores accesibles y alféizares." }, pricingMethod: "per_unit", unitLabel: { en: "window", es: "ventana" }, estimatedDurationMinutes: 10 },
  { presetKey: "interior_cabinets", en: { name: "Interior cabinets", description: "Wiping empty cabinet interiors, shelves, and accessible surfaces." }, es: { name: "Interior de gabinetes", description: "Limpieza del interior de gabinetes vacíos, estantes y superficies accesibles." }, pricingMethod: "starting_at", estimatedDurationMinutes: 60 },
  { presetKey: "blinds", en: { name: "Blinds", description: "Dusting and wiping accessible blinds." }, es: { name: "Persianas", description: "Desempolvado y limpieza de persianas accesibles." }, pricingMethod: "per_unit", unitLabel: { en: "set", es: "juego" }, estimatedDurationMinutes: 10 },
  { presetKey: "laundry", en: { name: "Laundry", description: "Wash, dry, and fold a standard laundry load." }, es: { name: "Lavandería", description: "Lavar, secar y doblar una carga estándar de ropa." }, pricingMethod: "per_unit", unitLabel: { en: "load", es: "carga" }, estimatedDurationMinutes: 60 },
  { presetKey: "dishes", en: { name: "Dishes", description: "Washing or loading a standard amount of dishes." }, es: { name: "Platos", description: "Lavado o carga de una cantidad estándar de platos." }, pricingMethod: "starting_at", estimatedDurationMinutes: 20 },
  { presetKey: "organization", en: { name: "Organization", description: "Light organization of an agreed area." }, es: { name: "Organización", description: "Organización ligera de un área acordada." }, pricingMethod: "per_unit", unitLabel: { en: "hour", es: "hora" }, estimatedDurationMinutes: 60 },
  { presetKey: "pet_hair_treatment", en: { name: "Pet hair treatment", description: "Extra treatment for visible pet hair on floors and furnishings." }, es: { name: "Tratamiento para pelo de mascotas", description: "Tratamiento adicional para pelo visible de mascotas en pisos y muebles." }, pricingMethod: "starting_at", estimatedDurationMinutes: 30 },
  { presetKey: "heavy_buildup", en: { name: "Heavy buildup", description: "Additional labor for areas with heavy soil or buildup." }, es: { name: "Acumulación intensa", description: "Trabajo adicional para áreas con suciedad o acumulación intensa." }, pricingMethod: "starting_at", estimatedDurationMinutes: 60 },
  { presetKey: "carpet_spot_treatment", en: { name: "Carpet spot treatment", description: "Spot treatment of small accessible carpet stains." }, es: { name: "Tratamiento de manchas en alfombra", description: "Tratamiento localizado de pequeñas manchas accesibles en alfombras." }, pricingMethod: "per_unit", unitLabel: { en: "spot", es: "mancha" }, estimatedDurationMinutes: 15 },
  { presetKey: "balcony_cleaning", en: { name: "Balcony cleaning", description: "Sweeping and surface cleaning of an accessible balcony." }, es: { name: "Limpieza de balcón", description: "Barrido y limpieza de superficies de un balcón accesible." }, pricingMethod: "starting_at", estimatedDurationMinutes: 40 },
  { presetKey: "garage_cleaning", en: { name: "Garage cleaning", description: "Sweeping and light surface cleaning of an accessible garage." }, es: { name: "Limpieza de garaje", description: "Barrido y limpieza ligera de superficies de un garaje accesible." }, pricingMethod: "starting_at", estimatedDurationMinutes: 60 },
  { presetKey: "linen_service", en: { name: "Linen service", description: "Change and prepare one standard set of bed linens." }, es: { name: "Servicio de ropa de cama", description: "Cambio y preparación de un juego estándar de ropa de cama." }, pricingMethod: "per_unit", unitLabel: { en: "bed", es: "cama" }, estimatedDurationMinutes: 15 },
] as const;

export function getCompanyAddOnPreset(presetKey: string) {
  return COMPANY_ADD_ON_PRESETS.find((preset) => preset.presetKey === presetKey);
}
