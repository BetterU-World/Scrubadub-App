import { useState, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Upload, X, AlertCircle, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import Papa from "papaparse";

// ── Types ────────────────────────────────────────────────────────────────────

type PropertyType = "residential" | "commercial" | "vacation_rental" | "office";

const VALID_TYPES: PropertyType[] = ["residential", "commercial", "vacation_rental", "office"];

interface ParsedRow {
  name: string;
  address: string;
  type: PropertyType;
  beds: number | undefined;
  baths: number | undefined;
  notes: string;
  amenities: string[];
  accessInstructions: string;
  pillowCount: number | undefined;
  maintenanceNotes: string;
}

interface ValidatedRow {
  data: ParsedRow;
  errors: Record<string, string>;
  isDuplicate: boolean;
  duplicateOfRow?: number;
  excluded: boolean;
}

type Step = "upload" | "preview" | "result";

interface ImportResult {
  created: number;
  errors: Array<{ row: number; message: string }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 1_000_000; // 1 MB
const MAX_ROWS = 200;
const BATCH_SIZE = 50;
const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_NOTE_LENGTH = 5000;
const MAX_ACCESS_INSTRUCTIONS_LENGTH = 5000;
const MAX_MAINTENANCE_NOTES_LENGTH = 5000;

// ── Column Mapping ───────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  // Name
  "property name": "name",
  "name": "name",
  "property_name": "name",
  "propertyname": "name",
  // Address
  "address": "address",
  "street address": "address",
  "street_address": "address",
  "city": "address", // handled specially
  "state": "address",
  "zip": "address",
  "zipcode": "address",
  "zip_code": "address",
  "zip code": "address",
  // Type
  "type": "type",
  "property type": "type",
  "property_type": "type",
  "propertytype": "type",
  // Beds
  "beds": "beds",
  "bedrooms": "beds",
  "bedroom": "beds",
  "bed": "beds",
  "br": "beds",
  // Baths
  "baths": "baths",
  "bathrooms": "baths",
  "bathroom": "baths",
  "bath": "baths",
  "ba": "baths",
  // Owner Notes
  "notes": "notes",
  "owner notes": "notes",
  "owner_notes": "notes",
  "ownernotes": "notes",
  // Amenities (Phase A)
  "amenities": "amenities",
  "amenity": "amenities",
  "amenity list": "amenities",
  "amenities list": "amenities",
  "amenity_list": "amenities",
  "amenities_list": "amenities",
  // Access Instructions (Phase A)
  "access instructions": "accessInstructions",
  "access_instructions": "accessInstructions",
  "accessinstructions": "accessInstructions",
  "entry instructions": "accessInstructions",
  "entry_instructions": "accessInstructions",
  "check-in instructions": "accessInstructions",
  "checkin instructions": "accessInstructions",
  "access": "accessInstructions",
  // Pillow Count (Phase A)
  "pillows": "pillowCount",
  "pillow count": "pillowCount",
  "pillow_count": "pillowCount",
  "pillowcount": "pillowCount",
  "number of pillows": "pillowCount",
  // Maintenance Notes (Phase A)
  "maintenance notes": "maintenanceNotes",
  "maintenance_notes": "maintenanceNotes",
  "maintenancenotes": "maintenanceNotes",
  "maintenance": "maintenanceNotes",
};

// Columns that are part of a compound address
const ADDRESS_PARTS = ["city", "state", "zip", "zipcode", "zip_code", "zip code"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

/** Resolve a ParsedRow field from a normalized record using COLUMN_MAP as single source of truth */
function resolveField(normalized: Record<string, string>, targetField: string): string {
  for (const [alias, mappedField] of Object.entries(COLUMN_MAP)) {
    if (mappedField === targetField && normalized[alias]) {
      return normalized[alias];
    }
  }
  return "";
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Tracks which optional columns were detected in the CSV */
interface DetectedColumns {
  hasNameCol: boolean;
  hasAddressCol: boolean;
  hasAmenities: boolean;
  hasAccessInstructions: boolean;
  hasPillowCount: boolean;
  hasMaintenanceNotes: boolean;
}

function mapCsvToRows(
  records: Record<string, string>[]
): { rows: ParsedRow[]; detected: DetectedColumns } {
  const emptyDetected: DetectedColumns = {
    hasNameCol: false, hasAddressCol: false,
    hasAmenities: false, hasAccessInstructions: false,
    hasPillowCount: false, hasMaintenanceNotes: false,
  };
  if (records.length === 0) return { rows: [], detected: emptyDetected };

  // Determine which columns exist
  const sampleKeys = Object.keys(records[0]).map(normalizeHeader);
  const hasNameCol = sampleKeys.some(
    (k) => COLUMN_MAP[k] === "name"
  );
  const hasDirectAddress = sampleKeys.some(
    (k) => k === "address" || k === "street address" || k === "street_address"
  );
  const hasAddressParts = ADDRESS_PARTS.some((p) => sampleKeys.includes(p));
  const hasAddressCol = hasDirectAddress || hasAddressParts;

  // Detect Phase A columns
  const hasAmenities = sampleKeys.some((k) => COLUMN_MAP[k] === "amenities");
  const hasAccessInstructions = sampleKeys.some((k) => COLUMN_MAP[k] === "accessInstructions");
  const hasPillowCount = sampleKeys.some((k) => COLUMN_MAP[k] === "pillowCount");
  const hasMaintenanceNotes = sampleKeys.some((k) => COLUMN_MAP[k] === "maintenanceNotes");

  const rows: ParsedRow[] = records.map((record) => {
    // Build a normalized key map
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      normalized[normalizeHeader(key)] = (value ?? "").trim();
    }

    // Extract name (via COLUMN_MAP)
    const name = resolveField(normalized, "name");

    // Extract address: prefer direct address column, fall back to city/state/zip concat
    let address = "";
    if (hasDirectAddress) {
      address =
        normalized["address"] ||
        normalized["street address"] ||
        normalized["street_address"] ||
        "";
    }
    if (!address && hasAddressParts) {
      const parts = [
        normalized["city"] || "",
        normalized["state"] || "",
        normalized["zip"] || normalized["zipcode"] || normalized["zip_code"] || normalized["zip code"] || "",
      ].filter(Boolean);
      address = parts.join(", ");
    }
    // If both direct address and parts exist, append parts to address
    if (address && hasDirectAddress && hasAddressParts) {
      const city = normalized["city"] || "";
      const state = normalized["state"] || "";
      const zip = normalized["zip"] || normalized["zipcode"] || normalized["zip_code"] || normalized["zip code"] || "";
      const suffix = [city, state, zip].filter(Boolean).join(", ");
      if (suffix && !address.includes(city) && city) {
        address = `${address}, ${suffix}`;
      }
    }

    // Extract type (via COLUMN_MAP)
    const rawType = resolveField(normalized, "type").toLowerCase().replace(/\s+/g, "_");
    const type: PropertyType = VALID_TYPES.includes(rawType as PropertyType)
      ? (rawType as PropertyType)
      : "residential";

    // Extract beds/baths (via COLUMN_MAP)
    const bedsRaw = resolveField(normalized, "beds");
    const bathsRaw = resolveField(normalized, "baths");
    const beds = bedsRaw ? parseInt(bedsRaw.replace(/,/g, ""), 10) : undefined;
    const baths = bathsRaw ? parseInt(bathsRaw.replace(/,/g, ""), 10) : undefined;

    // Extract notes (via COLUMN_MAP)
    const notes = resolveField(normalized, "notes");

    // Extract amenities (Phase A) — comma-delimited string → string[]
    const amenitiesRaw = resolveField(normalized, "amenities");
    const amenities = amenitiesRaw
      ? amenitiesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Extract access instructions (Phase A, via COLUMN_MAP)
    const accessInstructions = resolveField(normalized, "accessInstructions");

    // Extract pillow count (Phase A, via COLUMN_MAP)
    const pillowCountRaw = resolveField(normalized, "pillowCount");
    const pillowCount = pillowCountRaw
      ? parseInt(pillowCountRaw.replace(/,/g, ""), 10)
      : undefined;

    // Extract maintenance notes (Phase A, via COLUMN_MAP)
    const maintenanceNotes = resolveField(normalized, "maintenanceNotes");

    return { name, address, type, beds, baths, notes, amenities, accessInstructions, pillowCount, maintenanceNotes };
  });

  const detected: DetectedColumns = {
    hasNameCol, hasAddressCol,
    hasAmenities, hasAccessInstructions, hasPillowCount, hasMaintenanceNotes,
  };
  return { rows, detected };
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateRows(rows: ParsedRow[]): ValidatedRow[] {
  // Build a map for within-CSV duplicate detection (name+address)
  const seen = new Map<string, number>();

  return rows.map((data, index) => {
    const errors: Record<string, string> = {};

    // Name validation
    if (!data.name.trim()) {
      errors.name = "required";
    } else if (data.name.length > MAX_NAME_LENGTH) {
      errors.name = "tooLong";
    }

    // Address validation
    if (!data.address.trim()) {
      errors.address = "required";
    } else if (data.address.length > MAX_ADDRESS_LENGTH) {
      errors.address = "tooLong";
    }

    // Beds validation
    if (data.beds !== undefined && (isNaN(data.beds) || data.beds < 0)) {
      errors.beds = "invalidNumber";
    }

    // Baths validation
    if (data.baths !== undefined && (isNaN(data.baths) || data.baths < 0)) {
      errors.baths = "invalidNumber";
    }

    // Notes validation
    if (data.notes.length > MAX_NOTE_LENGTH) {
      errors.notes = "tooLong";
    }

    // Access instructions validation (Phase A)
    if (data.accessInstructions.length > MAX_ACCESS_INSTRUCTIONS_LENGTH) {
      errors.accessInstructions = "tooLong";
    }

    // Pillow count validation (Phase A)
    if (data.pillowCount !== undefined && (isNaN(data.pillowCount) || data.pillowCount < 0)) {
      errors.pillowCount = "invalidNumber";
    }

    // Maintenance notes validation (Phase A)
    if (data.maintenanceNotes.length > MAX_MAINTENANCE_NOTES_LENGTH) {
      errors.maintenanceNotes = "tooLong";
    }

    // Within-CSV duplicate detection
    const key = `${data.name.trim().toLowerCase()}|${data.address.trim().toLowerCase()}`;
    let isDuplicate = false;
    let duplicateOfRow: number | undefined;
    if (data.name.trim() && data.address.trim()) {
      if (seen.has(key)) {
        isDuplicate = true;
        duplicateOfRow = seen.get(key)! + 1; // 1-indexed for display
      } else {
        seen.set(key, index);
      }
    }

    return { data, errors, isDuplicate, duplicateOfRow, excluded: false };
  });
}

function isRowImportable(row: ValidatedRow): boolean {
  return Object.keys(row.errors).length === 0 && !row.isDuplicate && !row.excluded;
}

// ── Component ────────────────────────────────────────────────────────────────

interface ImportPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: Id<"companies">;
  userId: Id<"users">;
}

export function ImportPropertiesDialog({
  open,
  onOpenChange,
  companyId,
  userId,
}: ImportPropertiesDialogProps) {
  const { t } = useTranslation();
  const bulkCreate = useMutation(api.mutations.properties.bulkCreate);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [detectedCols, setDetectedCols] = useState<DetectedColumns>({
    hasNameCol: false, hasAddressCol: false,
    hasAmenities: false, hasAccessInstructions: false,
    hasPillowCount: false, hasMaintenanceNotes: false,
  });
  const [parseError, setParseError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setRows([]);
    setParseError("");
    setIsParsing(false);
    setIsImporting(false);
    setResult(null);
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isImporting) return; // prevent closing during import
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [isImporting, onOpenChange, reset]
  );

  // ── File Selection ───────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setParseError("");
      setRows([]);

      // Validate file type
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setParseError(t("properties.import.invalidFileTypeError"));
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setParseError(t("properties.import.fileTooLargeError"));
        return;
      }

      setIsParsing(true);
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          if (!text.trim()) {
            setParseError(t("properties.import.emptyFileError"));
            setIsParsing(false);
            return;
          }

          const parsed = Papa.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim(),
          });

          if (parsed.errors.length > 0 && parsed.data.length === 0) {
            setParseError(t("properties.import.parseError"));
            setIsParsing(false);
            return;
          }

          if (parsed.data.length === 0) {
            setParseError(t("properties.import.emptyFileError"));
            setIsParsing(false);
            return;
          }

          if (parsed.data.length > MAX_ROWS) {
            setParseError(
              t("properties.import.tooManyRowsError", { count: parsed.data.length })
            );
            setIsParsing(false);
            return;
          }

          const { rows: parsedRows, detected } = mapCsvToRows(parsed.data);

          if (!detected.hasNameCol || !detected.hasAddressCol) {
            setParseError(t("properties.import.noHeaderError"));
            setIsParsing(false);
            return;
          }

          const validated = validateRows(parsedRows);
          setRows(validated);
          setDetectedCols(detected);
          setIsParsing(false);
        } catch {
          setParseError(t("properties.import.parseError"));
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        setParseError(t("properties.import.parseError"));
        setIsParsing(false);
      };
      reader.readAsText(file);
    },
    [t]
  );

  // ── Row Exclusion Toggle ─────────────────────────────────────────────────

  const toggleRowExcluded = useCallback((index: number) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, excluded: !row.excluded } : row))
    );
  }, []);

  // ── Import Execution ─────────────────────────────────────────────────────

  const importableRows = rows.filter(isRowImportable);

  const handleImport = useCallback(async () => {
    if (importableRows.length === 0) return;

    setIsImporting(true);
    setImportError("");

    const properties = importableRows.map((row) => ({
      name: row.data.name.trim(),
      address: row.data.address.trim(),
      type: row.data.type,
      beds: row.data.beds !== undefined && !isNaN(row.data.beds) ? row.data.beds : undefined,
      baths: row.data.baths !== undefined && !isNaN(row.data.baths) ? row.data.baths : undefined,
      ownerNotes: row.data.notes.trim() || undefined,
      amenities: row.data.amenities.length > 0 ? row.data.amenities : undefined,
      accessInstructions: row.data.accessInstructions.trim() || undefined,
      pillowCount: row.data.pillowCount !== undefined && !isNaN(row.data.pillowCount) ? row.data.pillowCount : undefined,
      maintenanceNotes: row.data.maintenanceNotes.trim() || undefined,
    }));

    // Send in batches of BATCH_SIZE
    let totalCreated = 0;
    const allErrors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < properties.length; i += BATCH_SIZE) {
      const batch = properties.slice(i, i + BATCH_SIZE);
      try {
        const batchResult = await bulkCreate({
          userId,
          companyId,
          properties: batch,
        });
        totalCreated += batchResult.created;
        // Offset error row numbers by batch start index
        for (const err of batchResult.errors) {
          allErrors.push({ row: i + err.row + 1, message: err.message });
        }
      } catch (err) {
        // Entire batch failed
        for (let j = 0; j < batch.length; j++) {
          allErrors.push({
            row: i + j + 1,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    setResult({ created: totalCreated, errors: allErrors });
    setStep("result");
    setIsImporting(false);

    if (totalCreated > 0) {
      sessionStorage.setItem(
        "scrubadub_toast",
        `${totalCreated} properties imported`
      );
    }
  }, [importableRows, bulkCreate, userId, companyId]);

  // ── Render Helpers ─────────────────────────────────────────────────────

  const validCount = importableRows.length;
  const totalCount = rows.length;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[85vh] z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-0">
            <Dialog.Title className="text-lg font-semibold">
              {t("properties.import.title")}
            </Dialog.Title>
            <Dialog.Close className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto flex-1">
            {step === "upload" && (
              <UploadStep
                t={t}
                fileName={fileName}
                rows={rows}
                parseError={parseError}
                isParsing={isParsing}
                fileInputRef={fileInputRef}
                onFileSelect={handleFileSelect}
              />
            )}

            {step === "preview" && (
              <PreviewStep
                t={t}
                rows={rows}
                validCount={validCount}
                totalCount={totalCount}
                onToggleExclude={toggleRowExcluded}
                detectedCols={detectedCols}
              />
            )}

            {step === "result" && result && (
              <ResultStep t={t} result={result} importError={importError} />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 pt-0 border-t border-gray-100 mt-auto">
            <div className="text-sm text-gray-500">
              {step === "preview" &&
                t("properties.import.validCount", { valid: validCount, total: totalCount })}
            </div>
            <div className="flex items-center gap-3">
              {step === "upload" && (
                <>
                  <Dialog.Close className="btn-secondary">
                    {t("properties.import.cancel")}
                  </Dialog.Close>
                  <button
                    className="btn-primary"
                    disabled={rows.length === 0 || !!parseError || isParsing}
                    onClick={() => setStep("preview")}
                  >
                    {t("properties.import.next")}
                  </button>
                </>
              )}

              {step === "preview" && (
                <>
                  <button className="btn-secondary" onClick={() => setStep("upload")}>
                    {t("properties.import.back")}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={validCount === 0 || isImporting}
                    onClick={handleImport}
                  >
                    {isImporting
                      ? t("properties.import.importing")
                      : t("properties.import.confirmImport", { count: validCount })}
                  </button>
                </>
              )}

              {step === "result" && (
                <button
                  className="btn-primary"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("properties.import.done")}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function UploadStep({
  t,
  fileName,
  rows,
  parseError,
  isParsing,
  fileInputRef,
  onFileSelect,
}: {
  t: (key: string, opts?: Record<string, unknown>) => string;
  fileName: string;
  rows: ValidatedRow[];
  parseError: string;
  isParsing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t("properties.import.uploadDesc")}</p>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept=".csv"
          onChange={onFileSelect}
          className="hidden"
          id="csv-upload"
        />
        <label
          htmlFor="csv-upload"
          className="btn-primary inline-block cursor-pointer"
        >
          {fileName ? t("properties.import.changeFile") : t("properties.import.selectFile")}
        </label>

        {isParsing && (
          <p className="text-sm text-gray-500 mt-3">{t("properties.import.parsing")}</p>
        )}

        {fileName && rows.length > 0 && !parseError && (
          <p className="text-sm text-green-600 mt-3 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            {t("properties.import.fileSelected", { name: fileName, count: rows.length })}
          </p>
        )}
      </div>

      {parseError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {parseError}
        </div>
      )}
    </div>
  );
}

function PreviewStep({
  t,
  rows,
  validCount,
  totalCount,
  onToggleExclude,
  detectedCols,
}: {
  t: (key: string, opts?: Record<string, unknown>) => string;
  rows: ValidatedRow[];
  validCount: number;
  totalCount: number;
  onToggleExclude: (index: number) => void;
  detectedCols: DetectedColumns;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t("properties.import.previewDesc")}</p>

      {validCount === 0 && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {t("properties.import.noValidRows")}
        </div>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-2 font-medium text-gray-600 w-12">
                {t("properties.import.row")}
              </th>
              <th className="text-left p-2 font-medium text-gray-600">
                {t("properties.import.name")}
              </th>
              <th className="text-left p-2 font-medium text-gray-600">
                {t("properties.import.address")}
              </th>
              <th className="text-left p-2 font-medium text-gray-600 w-28">
                {t("properties.import.type")}
              </th>
              <th className="text-left p-2 font-medium text-gray-600 w-16">
                {t("properties.import.beds")}
              </th>
              <th className="text-left p-2 font-medium text-gray-600 w-16">
                {t("properties.import.baths")}
              </th>
              {detectedCols.hasAmenities && (
                <th className="text-left p-2 font-medium text-gray-600 w-32">
                  {t("properties.import.amenities")}
                </th>
              )}
              {detectedCols.hasAccessInstructions && (
                <th className="text-left p-2 font-medium text-gray-600 w-32">
                  {t("properties.import.accessInstructions")}
                </th>
              )}
              {detectedCols.hasPillowCount && (
                <th className="text-left p-2 font-medium text-gray-600 w-20">
                  {t("properties.import.pillowCount")}
                </th>
              )}
              {detectedCols.hasMaintenanceNotes && (
                <th className="text-left p-2 font-medium text-gray-600 w-32">
                  {t("properties.import.maintenanceNotes")}
                </th>
              )}
              <th className="text-left p-2 font-medium text-gray-600 w-20">
                {t("properties.import.status")}
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const hasErrors = Object.keys(row.errors).length > 0;
              const importable = isRowImportable(row);
              const rowBg = row.excluded
                ? "bg-gray-50 opacity-50"
                : row.isDuplicate
                  ? "bg-yellow-50"
                  : hasErrors
                    ? "bg-red-50"
                    : "";

              return (
                <tr key={index} className={`border-b last:border-0 ${rowBg}`}>
                  <td className="p-2 text-gray-400">{index + 1}</td>
                  <td className="p-2">
                    <CellValue value={row.data.name} error={row.errors.name} t={t} />
                  </td>
                  <td className="p-2">
                    <CellValue value={row.data.address} error={row.errors.address} t={t} />
                  </td>
                  <td className="p-2 text-gray-700">{row.data.type}</td>
                  <td className="p-2">
                    <CellValue
                      value={row.data.beds !== undefined ? String(row.data.beds) : ""}
                      error={row.errors.beds}
                      t={t}
                    />
                  </td>
                  <td className="p-2">
                    <CellValue
                      value={row.data.baths !== undefined ? String(row.data.baths) : ""}
                      error={row.errors.baths}
                      t={t}
                    />
                  </td>
                  {detectedCols.hasAmenities && (
                    <td className="p-2">
                      <span className="text-gray-700" title={row.data.amenities.join(", ")}>
                        {row.data.amenities.length > 0
                          ? row.data.amenities.length === 1
                            ? row.data.amenities[0]
                            : `${row.data.amenities.length} items`
                          : "—"}
                      </span>
                    </td>
                  )}
                  {detectedCols.hasAccessInstructions && (
                    <td className="p-2">
                      <CellValue
                        value={row.data.accessInstructions}
                        error={row.errors.accessInstructions}
                        t={t}
                      />
                    </td>
                  )}
                  {detectedCols.hasPillowCount && (
                    <td className="p-2">
                      <CellValue
                        value={row.data.pillowCount !== undefined ? String(row.data.pillowCount) : ""}
                        error={row.errors.pillowCount}
                        t={t}
                      />
                    </td>
                  )}
                  {detectedCols.hasMaintenanceNotes && (
                    <td className="p-2">
                      <CellValue
                        value={row.data.maintenanceNotes}
                        error={row.errors.maintenanceNotes}
                        t={t}
                      />
                    </td>
                  )}
                  <td className="p-2">
                    <RowStatus
                      t={t}
                      excluded={row.excluded}
                      isDuplicate={row.isDuplicate}
                      duplicateOfRow={row.duplicateOfRow}
                      hasErrors={hasErrors}
                      importable={importable}
                    />
                  </td>
                  <td className="p-2">
                    {!hasErrors && !row.isDuplicate && (
                      <button
                        onClick={() => onToggleExclude(index)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded"
                        title={
                          row.excluded
                            ? t("properties.import.includeRow")
                            : t("properties.import.removeRow")
                        }
                      >
                        {row.excluded ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <MinusCircle className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellValue({
  value,
  error,
  t,
}: {
  value: string;
  error?: string;
  t: (key: string) => string;
}) {
  if (error) {
    return (
      <div>
        <span className="text-gray-700">{value || "—"}</span>
        <span className="block text-xs text-red-600">
          {t(`properties.import.${error}`)}
        </span>
      </div>
    );
  }
  return <span className="text-gray-700">{value || "—"}</span>;
}

function RowStatus({
  t,
  excluded,
  isDuplicate,
  duplicateOfRow,
  hasErrors,
  importable,
}: {
  t: (key: string, opts?: Record<string, unknown>) => string;
  excluded: boolean;
  isDuplicate: boolean;
  duplicateOfRow?: number;
  hasErrors: boolean;
  importable: boolean;
}) {
  if (excluded) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <MinusCircle className="w-3 h-3" />
        {t("properties.import.excluded")}
      </span>
    );
  }
  if (isDuplicate) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
        <AlertCircle className="w-3 h-3" />
        {t("properties.import.duplicateInCsv", { row: duplicateOfRow })}
      </span>
    );
  }
  if (hasErrors) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600">
        <XCircle className="w-3 h-3" />
        {t("properties.import.invalid")}
      </span>
    );
  }
  if (importable) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="w-3 h-3" />
        {t("properties.import.valid")}
      </span>
    );
  }
  return null;
}

function ResultStep({
  t,
  result,
  importError,
}: {
  t: (key: string, opts?: Record<string, unknown>) => string;
  result: ImportResult;
  importError: string;
}) {
  if (importError) {
    return (
      <div className="flex items-start gap-2 p-4 bg-red-50 rounded-lg text-sm text-red-700">
        <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
        {t("properties.import.resultError")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result.errors.length === 0 ? (
        <div className="flex items-start gap-2 p-4 bg-green-50 rounded-lg text-sm text-green-700">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          {t("properties.import.resultSuccess", { count: result.created })}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 p-4 bg-yellow-50 rounded-lg text-sm text-yellow-700">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            {t("properties.import.resultPartial", {
              created: result.created,
              total: result.created + result.errors.length,
              failed: result.errors.length,
            })}
          </div>
          <ul className="text-sm text-red-600 space-y-1 pl-4">
            {result.errors.map((err, i) => (
              <li key={i}>
                {t("properties.import.row")} {err.row}: {err.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
