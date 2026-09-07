"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { parseCsv, type ParsedCsv } from "@fintrack/shared/csv";
import type { FinancialAccount } from "@fintrack/shared/types";
import { importTransactions } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  guessColumnMapping,
  mapCsvRows,
  type ColumnMapping,
  type ImportField,
} from "./import-utils";

const FIELD_LABELS: Record<ImportField, string> = {
  date: "Date",
  amount: "Amount",
  description: "Description",
  type: "Type",
  category: "Category",
  tags: "Tags",
};

const FIELD_HINTS: Partial<Record<ImportField, string>> = {
  type: "When unmapped, negative amounts are expenses and positive ones income",
  tags: "Separate several tags with ; or |",
};

const UNMAPPED = "__unmapped";
const PREVIEW_ROWS = 10;
const MAX_ROWS = 2000;

type ImportResult = Awaited<ReturnType<typeof importTransactions>>;

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: FinancialAccount[];
  onImported: () => void;
}

function defaultAccountId(accounts: FinancialAccount[]) {
  const active = accounts.filter((a) => !a.isArchived);
  return active.find((a) => a.isDefault)?.id || active[0]?.id || null;
}

export function ImportDialog({ open, onOpenChange, accounts, onImported }: ImportDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dayFirst, setDayFirst] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(() => defaultAccountId(accounts));
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setParsed(null);
    setMapping({});
    setDayFirst(false);
    setSkipDuplicates(true);
    setResult(null);
    setAccountId(defaultAccountId(accounts));
  }, [open, accounts]);

  const accountItems = useMemo(
    () =>
      accounts
        .filter((account) => !account.isArchived)
        .map((account) => ({
          value: account.id,
          label: (
            <>
              {account.icon} {account.name}
            </>
          ),
        })),
    [accounts]
  );

  const columnItems = useMemo(
    () => [
      { value: UNMAPPED, label: "Not mapped" },
      ...(parsed?.headers ?? []).map((header, index) => ({
        value: String(index),
        label: header || `Column ${index + 1}`,
      })),
    ],
    [parsed]
  );

  const mapped = useMemo(
    () => (parsed ? mapCsvRows(parsed.rows, mapping, { dayFirst }) : null),
    [parsed, mapping, dayFirst]
  );

  const missingRequired = REQUIRED_FIELDS.filter((field) => mapping[field] === undefined);
  const tooMany = (mapped?.valid.length ?? 0) > MAX_ROWS;
  const canImport =
    !!parsed &&
    !!accountId &&
    missingRequired.length === 0 &&
    !!mapped &&
    mapped.valid.length > 0 &&
    !tooMany &&
    !isImporting;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const csv = parseCsv(text);
      if (csv.headers.length === 0 || csv.rows.length === 0) {
        toast.error("The file has no data rows");
        return;
      }
      setFileName(file.name);
      setParsed(csv);
      setMapping(guessColumnMapping(csv.headers));
      setResult(null);
    } catch {
      toast.error("Could not read the file");
    } finally {
      event.target.value = "";
    }
  }

  function updateMapping(field: ImportField, value: string | null) {
    setMapping((prev) => {
      const next = { ...prev };
      if (!value || value === UNMAPPED) delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  async function handleImport() {
    if (!canImport || !mapped || !accountId) return;
    setIsImporting(true);
    try {
      const summary = await importTransactions({
        accountId,
        rows: mapped.valid,
        skipDuplicates,
      });
      setResult(summary);
      toast.success(`Imported ${summary.imported} transactions`);
      onImported();
    } catch {
      toast.error("Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  const previewRows = mapped?.preview.slice(0, PREVIEW_ROWS) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Upload a bank or spreadsheet export, match its columns, then import into one account.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">Import finished</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>{result.imported} transactions imported</li>
                <li>{result.skipped} duplicates skipped</li>
                {result.createdCategories.length > 0 && (
                  <li>New categories: {result.createdCategories.join(", ")}</li>
                )}
              </ul>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="import-file">CSV file</Label>
                <Input id="import-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
                {fileName && parsed && (
                  <p className="text-xs text-muted-foreground">
                    {fileName} · {parsed.rows.length} rows
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId} items={accountItems}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {parsed && (
              <>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Columns</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {IMPORT_FIELDS.map((field) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs">
                          {FIELD_LABELS[field]}
                          {REQUIRED_FIELDS.includes(field) && (
                            <span className="text-destructive"> *</span>
                          )}
                        </Label>
                        <Select
                          value={mapping[field] === undefined ? UNMAPPED : String(mapping[field])}
                          onValueChange={(value) => updateMapping(field, value)}
                          items={columnItems}
                        >
                          <SelectTrigger className="w-full" aria-label={`${FIELD_LABELS[field]} column`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {columnItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {FIELD_HINTS[field] && (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {FIELD_HINTS[field]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={dayFirst} onCheckedChange={setDayFirst} />
                    Day-first dates (31/12/2024)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={skipDuplicates}
                      onCheckedChange={(checked) => setSkipDuplicates(checked)}
                    />
                    Skip rows that already exist
                  </label>
                </div>

                {mapped && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p className="font-medium">Preview</p>
                      <p className="text-muted-foreground">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {mapped.valid.length} valid
                        </span>
                        {" · "}
                        <span className={mapped.invalid.length > 0 ? "text-destructive" : undefined}>
                          {mapped.invalid.length} invalid
                        </span>
                        {mapped.preview.length > PREVIEW_ROWS && ` · showing first ${PREVIEW_ROWS}`}
                      </p>
                    </div>
                    {missingRequired.length > 0 && (
                      <p className="text-xs text-destructive">
                        Map the {missingRequired.map((f) => FIELD_LABELS[f]).join(" and ")} column
                        {missingRequired.length > 1 ? "s" : ""} to continue.
                      </p>
                    )}
                    {tooMany && (
                      <p className="text-xs text-destructive">
                        At most {MAX_ROWS} rows can be imported at once.
                      </p>
                    )}
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Tags</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((entry) => (
                            <TableRow
                              key={entry.index}
                              className={entry.row ? undefined : "bg-destructive/10"}
                            >
                              <TableCell className="text-muted-foreground">{entry.index + 1}</TableCell>
                              {entry.row ? (
                                <>
                                  <TableCell>{entry.row.date}</TableCell>
                                  <TableCell className="capitalize">{entry.row.type}</TableCell>
                                  <TableCell className="text-right">{entry.row.amount}</TableCell>
                                  <TableCell className="max-w-[240px] truncate">
                                    {entry.row.description}
                                  </TableCell>
                                  <TableCell>{entry.row.categoryName ?? "Imported"}</TableCell>
                                  <TableCell>{entry.row.tags.join(", ")}</TableCell>
                                </>
                              ) : (
                                <TableCell colSpan={6} className="text-destructive">
                                  {entry.reason}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!canImport}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {mapped && mapped.valid.length > 0 ? `${mapped.valid.length} rows` : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
