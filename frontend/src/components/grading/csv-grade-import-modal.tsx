"use client";

import { useState, useCallback, useRef } from "react";
import { X, Upload, FileSpreadsheet, ArrowLeft } from "lucide-react";

const SKIP = "— skip —";

export interface GradeColumnMapping {
  query_text: string;
  grade: string;
  notes: string | null;
  [key: string]: string | null;
}

interface CsvGradeImportModalProps {
  onClose: () => void;
  onImport: (file: File, mapping: GradeColumnMapping) => void;
  isPending: boolean;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export function parseCsvText(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0 };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows, totalRows: rows.length };
}

export function autoMatchGrade(headers: string[]): GradeColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());

  const findMatch = (patterns: string[]): string | null => {
    for (const p of patterns) {
      const idx = lower.findIndex((h) => h.includes(p));
      if (idx !== -1) return headers[idx];
    }
    return null;
  };

  return {
    query_text: findMatch(["query", "question", "prompt", "input"]) || "",
    grade: findMatch(["grade", "result", "score", "rating"]) || "",
    notes: findMatch(["note", "comment", "feedback", "reason"]),
  };
}

export function CsvGradeImportModal({
  onClose,
  onImport,
  isPending,
}: CsvGradeImportModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<GradeColumnMapping>({
    query_text: "",
    grade: "",
    notes: null,
  });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsvText(text);
      if (parsed.headers.length === 0) return;
      setCsv(parsed);
      setMapping(autoMatchGrade(parsed.headers));
      setStep(2);
    };
    reader.readAsText(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && (f.name.endsWith(".csv") || f.type === "text/csv"))
        handleFile(f);
    },
    [handleFile]
  );

  const canImport = mapping.query_text && mapping.grade && file && !isPending;

  const handleImport = () => {
    if (!file || !canImport) return;
    onImport(file, {
      query_text: mapping.query_text,
      grade: mapping.grade,
      notes: mapping.notes || null,
    });
  };

  const selectCls =
    "w-full px-3 py-2 rounded-lg text-sm outline-none transition-all bg-card border border-border text-foreground focus:ring-2 focus:ring-ring/30 focus:border-ring/50 appearance-none";

  const previewRows = csv?.rows.slice(0, 3) || [];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-xl w-[90%] max-w-[700px] p-6 shadow-2xl modal-content max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h3 className="text-lg font-semibold text-foreground">
              {step === 1 ? "Import Grades from CSV" : "Map Columns"}
            </h3>
          </div>
          <button
            className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {step === 1 && (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-light"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={40} className="mx-auto mb-4 text-muted-light" />
            <p className="text-foreground font-medium mb-1">
              Drop your CSV file here
            </p>
            <p className="text-muted text-sm">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {step === 2 && csv && (
          <>
            {/* File info */}
            <div className="flex items-center gap-3 mb-5 p-3 bg-[var(--surface-hover)] rounded-lg">
              <FileSpreadsheet size={20} className="text-primary shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-foreground">
                  {file?.name}
                </span>
                <span className="text-muted ml-2">
                  {csv.totalRows} rows, {csv.headers.length} columns
                </span>
              </div>
            </div>

            {/* Column mapping */}
            <div className="space-y-3 mb-5">
              {(
                [
                  { key: "query_text" as const, label: "Query Text", required: true },
                  { key: "grade" as const, label: "Grade", required: true },
                  { key: "notes" as const, label: "Notes", required: false },
                ] as const
              ).map(({ key, label, required }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="w-36 text-sm font-medium text-foreground shrink-0">
                    {label}
                    {required && (
                      <span className="text-destructive ml-0.5">*</span>
                    )}
                  </label>
                  <select
                    className={selectCls}
                    value={
                      mapping[key] === null ? SKIP : mapping[key] || ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setMapping((m) => ({
                        ...m,
                        [key]:
                          val === SKIP ? null : val === "" ? (required ? "" : null) : val,
                      }));
                    }}
                  >
                    {required ? (
                      <option value="">Select column...</option>
                    ) : (
                      <option value={SKIP}>{SKIP}</option>
                    )}
                    {csv.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted mb-4">
              Grade values must be: correct, partial, or wrong. Rows with unrecognized queries will be skipped.
            </p>

            {/* Preview */}
            {previewRows.length > 0 && (
              <div className="mb-5">
                <h4 className="text-sm font-medium text-muted mb-2">
                  Preview (first {previewRows.length} rows)
                </h4>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-muted uppercase">
                          Query Text
                        </th>
                        <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-muted uppercase">
                          Grade
                        </th>
                        <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-muted uppercase">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => {
                        const getVal = (col: string | null) => {
                          if (!col) return "";
                          const idx = csv.headers.indexOf(col);
                          return idx >= 0 ? row[idx] || "" : "";
                        };
                        return (
                          <tr key={i} className="border-t border-border">
                            <td className="p-2 text-foreground max-w-[250px] truncate">
                              {getVal(mapping.query_text)}
                            </td>
                            <td className="p-2 text-foreground">
                              {getVal(mapping.grade)}
                            </td>
                            <td className="p-2 text-muted max-w-[200px] truncate">
                              {getVal(mapping.notes)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-md font-medium text-sm bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:brightness-110 transition-colors disabled:opacity-50"
                disabled={!canImport}
                onClick={handleImport}
              >
                {isPending ? "Importing..." : "Import Grades"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
