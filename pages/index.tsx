import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import {
  Search,
  Wrench,
  Loader2,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Circle,
  RotateCcw,
  X,
  Plus,
  FileText,
  MapPin,
  Star,
  ExternalLink,
} from "lucide-react";
import type { MechanicShop } from "./api/mechanics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  category: string;
}

interface ServiceItem {
  id: string;
  service: string;
  diagnosis: string;
  laborHours: number;
  partsCost: number;
  priority: "urgent" | "recommended" | "optional";
}

interface ServiceReport {
  summary: string;
  items: ServiceItem[];
  notes: string;
}

const SYMPTOM_CATEGORIES = [
  { value: "noise", label: "Noise", hint: "grinding, clicking, knocking" },
  { value: "warning_light", label: "Warning Light", hint: "check engine, ABS, etc." },
  { value: "performance", label: "Performance Issue", hint: "stalling, loss of power" },
  { value: "vibration", label: "Vibration / Shaking", hint: "steering wheel, body, pedal" },
  { value: "fluid_leak", label: "Fluid Leak", hint: "oil, coolant, brake fluid" },
  { value: "smell_smoke", label: "Smell / Smoke", hint: "burning, exhaust, gas smell" },
  { value: "electrical", label: "Electrical Issue", hint: "lights, battery, accessories" },
  { value: "other", label: "Other", hint: "anything not listed above" },
];

const WHEN_OPTIONS = [
  "When starting / cold engine",
  "While braking",
  "While turning",
  "At highway speeds (50+ mph)",
  "At low speeds",
  "When accelerating",
  "When idling",
  "All the time",
];

const DURATION_OPTIONS = [
  "Just started today",
  "A few days",
  "A few weeks",
  "Over a month",
];

interface SymptomAnswers {
  category: string;
  whenOccurs: string[];
  duration: string;
  details: string;
}

function buildSymptomsText(answers: SymptomAnswers): string {
  const parts: string[] = [];
  const cat = SYMPTOM_CATEGORIES.find((c) => c.value === answers.category);
  if (cat) parts.push(`Issue type: ${cat.label} (${cat.hint})`);
  if (answers.whenOccurs.length > 0)
    parts.push(`Occurs: ${answers.whenOccurs.join(", ")}`);
  if (answers.duration) parts.push(`Duration: ${answers.duration}`);
  if (answers.details.trim()) parts.push(`Additional details: ${answers.details.trim()}`);
  return parts.join(". ");
}

export default function ServiceAdvisorPage() {
  const router = useRouter();

  // Vehicle search state
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Symptom questionnaire state
  const [symptomAnswers, setSymptomAnswers] = useState<SymptomAnswers>({
    category: "",
    whenOccurs: [],
    duration: "",
    details: "",
  });

  // Report state
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [laborRate, setLaborRate] = useState(150);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Mechanic finder state
  const [zipCode, setZipCode] = useState("");
  const [mechanics, setMechanics] = useState<MechanicShop[]>([]);
  const [searchingMechanics, setSearchingMechanics] = useState(false);
  const [mechanicsError, setMechanicsError] = useState<string | null>(null);
  const [mechanicsSearched, setMechanicsSearched] = useState(false);

  async function handleFindMechanics(e: React.FormEvent) {
    e.preventDefault();
    if (!zipCode.trim() || searchingMechanics) return;
    setSearchingMechanics(true);
    setMechanicsError(null);
    setMechanics([]);
    setMechanicsSearched(false);
    try {
      const res = await fetch("/api/mechanics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zipCode: zipCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMechanicsError(data.error ?? "Failed to find mechanics.");
        return;
      }
      setMechanics(data as MechanicShop[]);
      setMechanicsSearched(true);
    } catch {
      setMechanicsError("Network error. Please check your connection.");
    } finally {
      setSearchingMechanics(false);
    }
  }

  async function handleExportPdf() {
    if (!report || !selectedVehicle || exportingPdf) return;
    setExportingPdf(true);
    try {
      const res = await fetch("/api/export/service-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle: selectedVehicle, report, laborRate }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug =
        `service-quote-${selectedVehicle.year}-${selectedVehicle.make}-${selectedVehicle.model}`
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
      a.download = `${slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setExportingPdf(false);
    }
  }

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/vehicles/search?q=${encodeURIComponent(q)}`,
      );
      const data: Vehicle[] = await res.json();
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchSuggestions(vehicleSearch),
      350,
    );
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [vehicleSearch, fetchSuggestions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectVehicle(v: Vehicle) {
    setSelectedVehicle(v);
    setVehicleSearch(`${v.year} ${v.make} ${v.model}`);
    setShowSuggestions(false);
  }

  function clearVehicle() {
    setSelectedVehicle(null);
    setVehicleSearch("");
    setSuggestions([]);
  }

  const canSubmit =
    selectedVehicle !== null &&
    symptomAnswers.category !== "" &&
    symptomAnswers.whenOccurs.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting || !selectedVehicle) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/service-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedVehicle.year,
          make: selectedVehicle.make,
          model: selectedVehicle.model,
          symptoms: buildSymptomsText(symptomAnswers),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setReport(data);
    } catch {
      setSubmitError(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setReport(null);
    setSubmitError(null);
    setSelectedVehicle(null);
    setVehicleSearch("");
    setSymptomAnswers({ category: "", whenOccurs: [], duration: "", details: "" });
  }

  function updateItem(id: string, updates: Partial<ServiceItem>) {
    setReport((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
          }
        : prev,
    );
  }

  function removeItem(id: string) {
    setReport((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((item) => item.id !== id) }
        : prev,
    );
  }

  function addItem() {
    const newItem: ServiceItem = {
      id: `item-${Date.now()}`,
      service: "New service item",
      diagnosis: "Describe the issue here",
      laborHours: 1,
      partsCost: 0,
      priority: "recommended",
    };
    setReport((prev) =>
      prev ? { ...prev, items: [...prev.items, newItem] } : prev,
    );
  }

  const PRIORITY_CONFIG = {
    urgent: {
      label: "Urgent",
      icon: <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />,
      classes: "bg-red-50 border-red-200 text-red-700",
      badge: "bg-red-100 text-red-700",
    },
    recommended: {
      label: "Recommended",
      icon: <CheckCircle aria-hidden="true" className="h-3.5 w-3.5" />,
      classes: "bg-yellow-50 border-yellow-200 text-yellow-800",
      badge: "bg-yellow-100 text-yellow-800",
    },
    optional: {
      label: "Optional",
      icon: <Circle aria-hidden="true" className="h-3.5 w-3.5" />,
      classes: "bg-muted/40 border-border text-foreground",
      badge: "bg-muted text-muted-foreground",
    },
  };

  if (report && selectedVehicle) {
    const totalLabor = report.items.reduce(
      (sum, item) => sum + item.laborHours * laborRate,
      0,
    );
    const totalParts = report.items.reduce(
      (sum, item) => sum + item.partsCost,
      0,
    );
    const grandTotal = totalLabor + totalParts;

    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <button
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label="Go to VehicleIQ home"
              onClick={() => router.push("/")}
            >
              <img
                src="/brain-circuit.svg"
                alt="VehicleIQ logo"
                width={32}
                height={32}
              />
              <span className="font-bold text-xl">VehicleIQ</span>
            </button>
            <nav aria-label="Main navigation" className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.push("/research")}>
                Research
              </Button>
              <Button variant="ghost" onClick={() => router.push("/compare")}>
                Compare
              </Button>
            </nav>
          </div>
        </header>

        {/* Invoice */}
        <section className="max-w-3xl mx-auto px-4 py-10 pb-20">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl font-bold">Service Quote</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                {selectedVehicle.year} {selectedVehicle.make}{" "}
                {selectedVehicle.model}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleExportPdf}
                disabled={exportingPdf}
              >
                {exportingPdf ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleReset}
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                New quote
              </Button>
            </div>
          </div>

          {/* AI summary */}
          <div className="bg-muted/40 rounded-lg px-4 py-3 mb-6 text-sm text-foreground leading-relaxed border">
            {report.summary}
          </div>

          {/* Service items */}
          <div className="space-y-3 mb-3">
            {report.items.map((item) => {
              const cfg = PRIORITY_CONFIG[item.priority];
              const priorities: ServiceItem["priority"][] = [
                "urgent",
                "recommended",
                "optional",
              ];
              const itemTotal = item.laborHours * laborRate + item.partsCost;
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-4 ${cfg.classes}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Priority cycle button */}
                    <button
                      type="button"
                      aria-label={`Priority: ${cfg.label}. Click to change.`}
                      onClick={() => {
                        const next =
                          priorities[
                            (priorities.indexOf(item.priority) + 1) %
                              priorities.length
                          ];
                        updateItem(item.id, { priority: next });
                      }}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 hover:opacity-70 transition-opacity cursor-pointer ${cfg.badge}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </button>

                    {/* Editable content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={item.service}
                        aria-label="Service name"
                        onChange={(e) =>
                          updateItem(item.id, { service: e.target.value })
                        }
                        className="font-semibold text-sm w-full bg-transparent border-b border-transparent hover:border-current focus:border-current outline-none transition-colors"
                        placeholder="Service name"
                      />
                      <input
                        type="text"
                        value={item.diagnosis}
                        aria-label="Diagnosis description"
                        onChange={(e) =>
                          updateItem(item.id, { diagnosis: e.target.value })
                        }
                        className="text-xs w-full bg-transparent border-b border-transparent hover:border-current focus:border-current outline-none opacity-80 transition-colors"
                        placeholder="Diagnosis description"
                      />
                      {/* Labor + parts inline */}
                      <div className="flex items-center gap-1.5 text-xs opacity-70 pt-1">
                        <input
                          type="number"
                          value={item.laborHours}
                          min={0.1}
                          max={20}
                          step={0.5}
                          aria-label="Labor hours"
                          onChange={(e) =>
                            updateItem(item.id, {
                              laborHours: Math.max(0.1, Number(e.target.value)),
                            })
                          }
                          className="w-14 text-center bg-transparent border-b border-current outline-none"
                        />
                        <span>h labor</span>
                        <span className="mx-1" aria-hidden="true">+</span>
                        <span aria-hidden="true">$</span>
                        <input
                          type="number"
                          value={item.partsCost}
                          min={0}
                          step={5}
                          aria-label="Parts cost in dollars"
                          onChange={(e) =>
                            updateItem(item.id, {
                              partsCost: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-20 text-center bg-transparent border-b border-current outline-none"
                        />
                        <span>parts</span>
                      </div>
                    </div>

                    {/* Line total + remove */}
                    <div className="shrink-0 text-right flex flex-col items-end gap-2">
                      <button
                        type="button"
                        aria-label={`Remove ${item.service}`}
                        onClick={() => removeItem(item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 -m-1 rounded"
                      >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      <p className="font-bold text-sm">
                        ${itemTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add row */}
          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 py-2 mb-6 text-sm text-muted-foreground border border-dashed rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add service item
          </button>

          {/* Totals + labor rate */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="labor-rate" className="text-muted-foreground">
                Labor rate
              </label>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-muted-foreground">$</span>
                <input
                  id="labor-rate"
                  type="number"
                  min={50}
                  max={500}
                  step={5}
                  value={laborRate}
                  aria-label="Labor rate per hour in dollars"
                  onChange={(e) =>
                    setLaborRate(Math.max(50, Number(e.target.value)))
                  }
                  className="w-20 text-right border rounded px-2 py-0.5 text-sm bg-background"
                />
                <span className="text-muted-foreground">/hr</span>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Labor subtotal</span>
                <span>${totalLabor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Parts subtotal</span>
                <span>${totalParts.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1 border-t mt-2">
                <span>Estimated Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {report.notes && (
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed border rounded-md px-3 py-2 bg-muted/30">
              {report.notes}
            </p>
          )}

          {/* Error */}
          {submitError && (
            <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mt-4">
              {submitError}
            </p>
          )}

          {/* Mechanic Finder */}
          <MechanicFinder
            zipCode={zipCode}
            setZipCode={setZipCode}
            mechanics={mechanics}
            searchingMechanics={searchingMechanics}
            mechanicsError={mechanicsError}
            mechanicsSearched={mechanicsSearched}
            onSubmit={handleFindMechanics}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
            aria-label="Go to VehicleIQ home"
            onClick={() => router.push("/")}
          >
            <img
              src="/brain-circuit.svg"
              alt="VehicleIQ logo"
              width={32}
              height={32}
            />
            <span className="font-bold text-xl">VehicleIQ</span>
          </button>
          <nav aria-label="Main navigation" className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
              <button
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors"
                onClick={() => router.push("/research")}
              >
                Research
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium bg-background shadow-sm rounded-md"
                aria-current="page"
              >
                AI Service Advisor
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/compare")}
            >
              Compare
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-2xl mx-auto px-4 py-10 sm:py-16 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-5" aria-hidden="true">
          <Wrench className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          AI Service Advisor
        </h1>
        <p className="text-lg text-muted-foreground">
          Describe your vehicle and symptoms. Get a diagnosed service quote in
          seconds.
        </p>
      </section>

      {/* Form */}
      <section className="max-w-2xl mx-auto px-4 pb-20">
        <form onSubmit={handleSubmit} className="space-y-5" aria-label="Service diagnosis form">
          {/* Vehicle search */}
          <div className="space-y-2">
            <label htmlFor="vehicle-search" className="text-sm font-medium">
              Your Vehicle
            </label>
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="vehicle-search"
                  className="pl-10 pr-10 h-12"
                  placeholder="Search year, make, or model… (e.g. 2021 Honda Civic)"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && suggestions.length > 0}
                  aria-controls="vehicle-suggestions"
                  aria-haspopup="listbox"
                  value={vehicleSearch}
                  onChange={(e) => {
                    setVehicleSearch(e.target.value);
                    setSelectedVehicle(null);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                />
                {searchLoading && (
                  <Loader2 aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                )}
                {selectedVehicle && !searchLoading && (
                  <button
                    type="button"
                    aria-label="Clear vehicle selection"
                    onClick={clearVehicle}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul
                  id="vehicle-suggestions"
                  role="listbox"
                  aria-label="Vehicle suggestions"
                  className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg overflow-hidden"
                >
                  {suggestions.map((v) => (
                    <li key={v.id} role="option" aria-selected={selectedVehicle?.id === v.id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectVehicle(v);
                        }}
                      >
                        <span className="font-medium">
                          {v.year} {v.make} {v.model}
                        </span>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {v.category}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedVehicle && (
              <p className="text-xs text-green-600 font-medium pl-1" aria-live="polite">
                ✓ {selectedVehicle.year} {selectedVehicle.make}{" "}
                {selectedVehicle.model} selected
              </p>
            )}
          </div>

          {/* Symptom questionnaire */}
          <div className="space-y-5">
            {/* Q1: Issue type */}
            <div
              role="radiogroup"
              aria-labelledby="q1-label"
              aria-required="true"
              className="space-y-2"
            >
              <p id="q1-label" className="text-sm font-medium">
                1. What type of issue are you experiencing?
                <span aria-hidden="true" className="text-destructive ml-1">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SYMPTOM_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    role="radio"
                    aria-checked={symptomAnswers.category === cat.value}
                    onClick={() =>
                      setSymptomAnswers((prev) => ({
                        ...prev,
                        category: prev.category === cat.value ? "" : cat.value,
                      }))
                    }
                    className={`text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                      symptomAnswers.category === cat.value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="block font-medium">{cat.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {cat.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Q2: When it occurs */}
            <div
              role="group"
              aria-labelledby="q2-label"
              aria-required="true"
              className="space-y-2"
            >
              <p id="q2-label" className="text-sm font-medium">
                2. When does it happen?
                <span aria-hidden="true" className="text-destructive ml-1">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {WHEN_OPTIONS.map((opt) => {
                  const selected = symptomAnswers.whenOccurs.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() =>
                        setSymptomAnswers((prev) => ({
                          ...prev,
                          whenOccurs: selected
                            ? prev.whenOccurs.filter((w) => w !== opt)
                            : [...prev.whenOccurs, opt],
                        }))
                      }
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q3: Duration */}
            <div
              role="radiogroup"
              aria-labelledby="q3-label"
              className="space-y-2"
            >
              <p id="q3-label" className="text-sm font-medium">
                3. How long has this been happening?
              </p>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={symptomAnswers.duration === opt}
                    onClick={() =>
                      setSymptomAnswers((prev) => ({
                        ...prev,
                        duration: prev.duration === opt ? "" : opt,
                      }))
                    }
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      symptomAnswers.duration === opt
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Q4: Additional details */}
            <div className="space-y-2">
              <label htmlFor="symptom-details" className="text-sm font-medium">
                4. Any additional details?
                <span className="text-xs text-muted-foreground ml-2 font-normal">
                  optional
                </span>
              </label>
              <textarea
                id="symptom-details"
                className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder="Recent repairs, severity, specific sounds or smells, warning light codes…"
                value={symptomAnswers.details}
                onChange={(e) =>
                  setSymptomAnswers((prev) => ({
                    ...prev,
                    details: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          {/* Error */}
          {submitError && (
            <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {submitError}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full h-12 text-base gap-2"
            disabled={!canSubmit || submitting}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Analyzing symptoms…
              </>
            ) : (
              <>
                Get Service Quote
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* How it works */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            {
              step: "1",
              title: "Describe symptoms",
              desc: "Tell us what's wrong in plain English",
            },
            {
              step: "2",
              title: "AI diagnoses",
              desc: "Claude analyzes likely causes for your specific vehicle",
            },
            {
              step: "3",
              title: "Get a quote",
              desc: "Editable service invoice with parts and labor estimates",
            },
          ].map(({ step, title, desc }) => (
            <Card key={step} className="border-dashed">
              <CardHeader className="pb-2">
                <div aria-hidden="true" className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mx-auto mb-2">
                  {step}
                </div>
                <CardTitle className="text-sm">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs">{desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mechanic Finder */}
        <MechanicFinder
          zipCode={zipCode}
          setZipCode={setZipCode}
          mechanics={mechanics}
          searchingMechanics={searchingMechanics}
          mechanicsError={mechanicsError}
          mechanicsSearched={mechanicsSearched}
          onSubmit={handleFindMechanics}
        />
      </section>
    </div>
  );
}

interface MechanicFinderProps {
  zipCode: string;
  setZipCode: (v: string) => void;
  mechanics: MechanicShop[];
  searchingMechanics: boolean;
  mechanicsError: string | null;
  mechanicsSearched: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function MechanicFinder({
  zipCode,
  setZipCode,
  mechanics,
  searchingMechanics,
  mechanicsError,
  mechanicsSearched,
  onSubmit,
}: MechanicFinderProps) {
  return (
    <div className="mt-12 border-t pt-10">
      <div className="flex items-center gap-2 mb-1">
        <MapPin aria-hidden="true" className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Find a Mechanic Near You</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Enter your ZIP code to find nearby auto repair shops.
      </p>

      <form onSubmit={onSubmit} className="flex gap-2 max-w-sm">
        <label htmlFor="zip-code" className="sr-only">
          ZIP code
        </label>
        <Input
          id="zip-code"
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="ZIP code (e.g. 90210)"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value.replace(/[^\d-]/g, ""))}
          className="h-10"
          aria-label="ZIP code for mechanic search"
        />
        <Button
          type="submit"
          size="sm"
          className="h-10 px-4 shrink-0"
          disabled={!zipCode.trim() || searchingMechanics}
          aria-busy={searchingMechanics}
        >
          {searchingMechanics ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </form>

      {mechanicsError && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mt-3 max-w-sm">
          {mechanicsError}
        </p>
      )}

      {mechanicsSearched && mechanics.length === 0 && !mechanicsError && (
        <p role="status" className="text-sm text-muted-foreground mt-4">
          No mechanics found near {zipCode}. Try a nearby ZIP code.
        </p>
      )}

      {mechanics.length > 0 && (
        <ul className="mt-5 space-y-3" aria-label="Nearby mechanic shops">
          {mechanics.map((shop) => (
            <li key={shop.placeId}>
              <a
                href={shop.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${shop.name}${shop.address ? `, ${shop.address}` : ""} — opens in new tab`}
                className="flex items-start justify-between gap-4 rounded-lg border p-4 hover:bg-muted/40 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">
                      {shop.name}
                    </span>
                    {shop.isOpen === true && (
                      <span className="text-xs text-green-600 font-medium shrink-0">
                        Open now
                      </span>
                    )}
                    {shop.isOpen === false && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Closed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {shop.address}
                  </p>
                  {shop.rating !== null && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star aria-hidden="true" className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium">
                        {shop.rating.toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({shop.totalRatings.toLocaleString()} reviews)
                      </span>
                    </div>
                  )}
                </div>
                <ExternalLink aria-hidden="true" className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
