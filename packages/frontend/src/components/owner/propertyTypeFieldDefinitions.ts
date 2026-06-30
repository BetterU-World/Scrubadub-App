export type PropertyIntelligenceType =
  | "commercial"
  | "office"
  | "residential"
  | "vacation_rental"
  | "move_in_out"
  | "post_construction"
  | "generic";

export type PropertyIntelligenceValueType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multi_select";

export type PropertyIntelligenceField = {
  key: string;
  groupKey: string;
  labelKey: string;
  valueType: PropertyIntelligenceValueType;
  options?: Array<{ value: string; labelKey: string }>;
};

export type PropertyIntelligenceGroup = {
  key: string;
  titleKey: string;
  fields: PropertyIntelligenceField[];
};

export type StructuredPropertyResponse = {
  key: string;
  groupKey: string;
  valueType: PropertyIntelligenceValueType;
  textValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
  stringValues?: string[];
};

export const PROPERTY_INTELLIGENCE_FIELD_SET_VERSION = "property-intelligence-v1";

const floorOptions = [
  "carpet",
  "tile",
  "hardwood",
  "vinyl",
  "concrete",
  "stone",
  "other",
].map((value) => ({
  value,
  labelKey: `propertyIntelligence.options.floorTypes.${value}`,
}));

const highTouchOptions = [
  "doorHandles",
  "lightSwitches",
  "desks",
  "conferenceTables",
  "reception",
  "elevatorButtons",
  "railings",
  "sharedEquipment",
].map((value) => ({
  value,
  labelKey: `propertyIntelligence.options.highTouchAreas.${value}`,
}));

const amenityOptions = [
  "washerDryer",
  "hotTub",
  "pool",
  "bbqGrill",
  "petsAllowed",
  "stairs",
  "elevator",
  "smartLock",
  "garage",
].map((value) => ({
  value,
  labelKey: `propertyIntelligence.options.amenities.${value}`,
}));

export const PROPERTY_TYPE_FIELD_GROUPS: Record<
  PropertyIntelligenceType,
  PropertyIntelligenceGroup[]
> = {
  commercial: [
    {
      key: "siteProfile",
      titleKey: "propertyIntelligence.groups.siteProfile",
      fields: [
        {
          key: "restroomCount",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.restroomCount",
          valueType: "number",
        },
        {
          key: "breakroomCount",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.breakroomCount",
          valueType: "number",
        },
        {
          key: "trashCanCount",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.trashCanCount",
          valueType: "number",
        },
        {
          key: "floorTypes",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.floorTypes",
          valueType: "multi_select",
          options: floorOptions,
        },
      ],
    },
    {
      key: "operations",
      titleKey: "propertyIntelligence.groups.operations",
      fields: [
        {
          key: "highTouchAreas",
          groupKey: "operations",
          labelKey: "propertyIntelligence.fields.highTouchAreas",
          valueType: "multi_select",
          options: highTouchOptions,
        },
        {
          key: "supplyRestockNeeds",
          groupKey: "operations",
          labelKey: "propertyIntelligence.fields.supplyRestockNeeds",
          valueType: "text",
        },
        {
          key: "afterHoursAccess",
          groupKey: "operations",
          labelKey: "propertyIntelligence.fields.afterHoursAccess",
          valueType: "boolean",
        },
        {
          key: "securityAlarmNotes",
          groupKey: "operations",
          labelKey: "propertyIntelligence.fields.securityAlarmNotes",
          valueType: "text",
        },
      ],
    },
  ],
  office: [],
  residential: [
    {
      key: "siteProfile",
      titleKey: "propertyIntelligence.groups.siteProfile",
      fields: [
        {
          key: "bedCount",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.bedCount",
          valueType: "number",
        },
        {
          key: "towelCount",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.towelCount",
          valueType: "number",
        },
        {
          key: "sheetSets",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.sheetSets",
          valueType: "number",
        },
        {
          key: "pillowCount",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.pillowCount",
          valueType: "number",
        },
      ],
    },
    {
      key: "turnover",
      titleKey: "propertyIntelligence.groups.turnover",
      fields: [
        {
          key: "amenities",
          groupKey: "turnover",
          labelKey: "propertyIntelligence.fields.amenities",
          valueType: "multi_select",
          options: amenityOptions,
        },
        {
          key: "accessInstructions",
          groupKey: "turnover",
          labelKey: "propertyIntelligence.fields.accessInstructions",
          valueType: "text",
        },
        {
          key: "laundryNotes",
          groupKey: "turnover",
          labelKey: "propertyIntelligence.fields.laundryNotes",
          valueType: "text",
        },
        {
          key: "resetNotes",
          groupKey: "turnover",
          labelKey: "propertyIntelligence.fields.resetNotes",
          valueType: "text",
        },
      ],
    },
  ],
  vacation_rental: [],
  move_in_out: [
    {
      key: "condition",
      titleKey: "propertyIntelligence.groups.condition",
      fields: [
        {
          key: "debrisLevel",
          groupKey: "condition",
          labelKey: "propertyIntelligence.fields.debrisLevel",
          valueType: "select",
          options: ["low", "medium", "high"].map((value) => ({
            value,
            labelKey: `propertyIntelligence.options.levels.${value}`,
          })),
        },
        {
          key: "applianceCleanoutNeeded",
          groupKey: "condition",
          labelKey: "propertyIntelligence.fields.applianceCleanoutNeeded",
          valueType: "boolean",
        },
        {
          key: "cabinetDrawerCleanout",
          groupKey: "condition",
          labelKey: "propertyIntelligence.fields.cabinetDrawerCleanout",
          valueType: "boolean",
        },
        {
          key: "conditionNotes",
          groupKey: "condition",
          labelKey: "propertyIntelligence.fields.conditionNotes",
          valueType: "text",
        },
      ],
    },
  ],
  post_construction: [
    {
      key: "constructionCleanup",
      titleKey: "propertyIntelligence.groups.constructionCleanup",
      fields: [
        {
          key: "dustLevel",
          groupKey: "constructionCleanup",
          labelKey: "propertyIntelligence.fields.dustLevel",
          valueType: "select",
          options: ["low", "medium", "high"].map((value) => ({
            value,
            labelKey: `propertyIntelligence.options.levels.${value}`,
          })),
        },
        {
          key: "debrisRemovalNeeded",
          groupKey: "constructionCleanup",
          labelKey: "propertyIntelligence.fields.debrisRemovalNeeded",
          valueType: "boolean",
        },
        {
          key: "windowGlassCleanup",
          groupKey: "constructionCleanup",
          labelKey: "propertyIntelligence.fields.windowGlassCleanup",
          valueType: "boolean",
        },
        {
          key: "paintAdhesiveResidue",
          groupKey: "constructionCleanup",
          labelKey: "propertyIntelligence.fields.paintAdhesiveResidue",
          valueType: "boolean",
        },
        {
          key: "ppeSafetyNotes",
          groupKey: "constructionCleanup",
          labelKey: "propertyIntelligence.fields.ppeSafetyNotes",
          valueType: "text",
        },
      ],
    },
  ],
  generic: [
    {
      key: "siteProfile",
      titleKey: "propertyIntelligence.groups.siteProfile",
      fields: [
        {
          key: "accessInstructions",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.accessInstructions",
          valueType: "text",
        },
        {
          key: "serviceNotes",
          groupKey: "siteProfile",
          labelKey: "propertyIntelligence.fields.serviceNotes",
          valueType: "text",
        },
      ],
    },
  ],
};

PROPERTY_TYPE_FIELD_GROUPS.office = PROPERTY_TYPE_FIELD_GROUPS.commercial;
PROPERTY_TYPE_FIELD_GROUPS.vacation_rental = PROPERTY_TYPE_FIELD_GROUPS.residential;

export function groupsForPropertyIntelligenceType(type: PropertyIntelligenceType) {
  return PROPERTY_TYPE_FIELD_GROUPS[type] ?? PROPERTY_TYPE_FIELD_GROUPS.generic;
}

export function propertyTypeFromLeadType(leadType?: string | null): PropertyIntelligenceType | null {
  switch (leadType) {
    case "commercial":
      return "commercial";
    case "str_airbnb":
      return "vacation_rental";
    case "residential":
      return "residential";
    case "move_out":
      return "move_in_out";
    case "post_construction":
      return "post_construction";
    default:
      return null;
  }
}

export function propertyTypeFromWalkthroughType(
  walkthroughType?: string | null
): PropertyIntelligenceType {
  switch (walkthroughType) {
    case "commercial":
      return "commercial";
    case "str":
      return "vacation_rental";
    case "residential":
      return "residential";
    case "move_in_out":
      return "move_in_out";
    case "post_construction":
      return "post_construction";
    default:
      return "generic";
  }
}
