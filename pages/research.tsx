import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import {
  Search,
  ArrowRight,
  GitCompare,
  Bot,
  Send,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  category: string;
}

const FEATURED_VEHICLES = [
  {
    id: "toyota-camry-2024",
    make: "Toyota",
    model: "Camry",
    year: 2024,
    category: "Sedan",
  },
  {
    id: "honda-cr-v-2024",
    make: "Honda",
    model: "CR-V",
    year: 2024,
    category: "SUV",
  },
  {
    id: "ford-f150-2024",
    make: "Ford",
    model: "F-150",
    year: 2024,
    category: "Truck",
  },
  {
    id: "tesla-model3-2024",
    make: "Tesla",
    model: "Model 3",
    year: 2024,
    category: "EV",
  },
  {
    id: "bmw-3series-2024",
    make: "BMW",
    model: "3 Series",
    year: 2024,
    category: "Luxury",
  },
  {
    id: "subaru-outback-2024",
    make: "Subaru",
    model: "Outback",
    year: 2024,
    category: "SUV",
  },
];

function slugify(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, "-");
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [compareList, setCompareList] = useState<string[]>([]);
  const [addedVehicles, setAddedVehicles] = useState<Vehicle[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(
    async (q: string) => {
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
        const alreadyShown = new Set([
          ...FEATURED_VEHICLES.map((v) => v.id),
          ...addedVehicles.map((v) => v.id),
        ]);
        setSuggestions(data.filter((v) => !alreadyShown.has(v.id)));
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [addedVehicles],
  );

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

  function addVehicleToGrid(vehicle: Vehicle) {
    setAddedVehicles((prev) =>
      prev.some((v) => v.id === vehicle.id) ? prev : [...prev, vehicle],
    );
    setVehicleSearch("");
    setShowSuggestions(false);
  }

  function removeAddedVehicle(id: string) {
    setAddedVehicles((prev) => prev.filter((v) => v.id !== id));
    setCompareList((prev) => prev.filter((v) => v !== id));
  }

  const allGridVehicles = [...FEATURED_VEHICLES, ...addedVehicles];

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Cancel in-flight chat request on unmount
  useEffect(
    () => () => {
      chatAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: Message = { role: "user", content: chatInput };
    setMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);

    chatAbortRef.current?.abort();
    const ac = new AbortController();
    chatAbortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          vehicleContext:
            "The user is looking for vehicle purchase recommendations. Help them narrow down the best vehicle for their needs by asking about budget, use case, priorities (reliability, performance, fuel economy, cargo space, etc.), and family size. Suggest specific makes and models with brief reasoning. When you recommend a vehicle, mention it by its full name (e.g. '2024 Toyota RAV4').",
        }),
        signal: ac.signal,
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              setMessages((prev) => [
                ...prev.slice(0, -1),
                {
                  role: "assistant",
                  content: "Sorry, something went wrong. Please try again.",
                },
              ]);
              break;
            }
            assistantText += parsed.text ?? "";
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { role: "assistant", content: assistantText },
            ]);
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    // Try to resolve a canonical NHTSA-backed slug first (gives compare/specs a proper ID)
    try {
      const res = await fetch(
        `/api/vehicles/search?q=${encodeURIComponent(query.trim())}`,
      );
      const results: Vehicle[] = await res.json();
      if (results.length > 0) {
        router.push(`/vehicle/${results[0].id}`);
        return;
      }
    } catch {}
    // Fallback: free-form research query (AI chat still works, specs may not)
    router.push(`/vehicle/${encodeURIComponent(slugify(query))}`);
  }

  function toggleCompare(id: string) {
    setCompareList((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : prev.length < 3
          ? [...prev, id]
          : prev,
    );
  }

  function goToCompare() {
    router.push(`/compare?vehicles=${compareList.join(",")}`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
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
          <nav className="flex items-center gap-3">
            <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
              <button className="px-3 py-1.5 text-sm font-medium bg-background shadow-sm rounded-md">
                Research
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors"
                onClick={() => router.push("/")}
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
      <section className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          Research any vehicle with AI
        </h1>
        <p className="text-xl text-muted-foreground mb-10">
          Get curated YouTube reviews, expert articles, and side-by-side
          comparisons. Export to PDF or slides in seconds.
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10 h-12 text-base"
              placeholder="Search make, model, or year…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="h-12">
            Search <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </section>

      {/* Featured Vehicles + Recommendation Chat */}
      <section className="max-w-6xl mx-auto px-4 pb-20 flex gap-6 items-start">
        {/* Vehicles Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Popular Vehicles</h2>
            {compareList.length >= 2 && (
              <Button onClick={goToCompare} variant="outline" className="gap-2">
                <GitCompare className="h-4 w-4" />
                Compare {compareList.length} vehicles
              </Button>
            )}
          </div>

          {/* Vehicle search / add to grid */}
          <div ref={searchRef} className="relative mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 pr-10"
                placeholder="Add a vehicle to compare… (e.g. Toyota, Camry, 2024 BMW)"
                value={vehicleSearch}
                onChange={(e) => {
                  setVehicleSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-popover border rounded-md shadow-lg overflow-hidden">
                {suggestions.map((v) => (
                  <button
                    key={v.id}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addVehicleToGrid(v);
                    }}
                  >
                    <span>
                      <span className="font-medium">
                        {v.year} {v.make} {v.model}
                      </span>
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {v.category}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allGridVehicles.map((vehicle) => {
              const selected = compareList.includes(vehicle.id);
              const isAdded = addedVehicles.some((v) => v.id === vehicle.id);
              return (
                <Card
                  key={vehicle.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${selected ? "ring-2 ring-primary" : ""}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </CardTitle>
                        <Badge variant="secondary" className="mt-1">
                          {vehicle.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleCompare(vehicle.id)}
                        >
                          {selected ? "Added" : "+ Compare"}
                        </Button>
                        {isAdded && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAddedVehicle(vehicle.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      AI-curated reviews, specs, and expert analysis
                    </CardDescription>
                    <Button
                      variant="ghost"
                      className="mt-3 px-4 py-2 text-sm font-medium"
                      onClick={() => router.push(`/vehicle/${vehicle.id}`)}
                    >
                      View research →
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Recommendation Chat */}
        <div
          className="w-80 shrink-0 flex flex-col border rounded-lg overflow-hidden sticky top-6"
          style={{ height: 560 }}
        >
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="font-medium text-sm">
              Find Your Perfect Vehicle
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  Tell me what you're looking for and I'll recommend the best
                  vehicles for your needs.
                </p>
                <div className="space-y-1">
                  {[
                    "Best family SUV under $40k?",
                    "Most reliable truck for towing?",
                    "Fun sports car under $35k?",
                    "Best EV for daily commuting?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      className="w-full text-left text-xs px-3 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                      onClick={() => {
                        setChatInput(prompt);
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "text-right" : ""}>
                <span
                  className={`inline-block rounded-lg px-3 py-2 max-w-[95%] text-left ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content ||
                    (chatLoading && i === messages.length - 1 ? "…" : "")}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="What are you looking for?"
              className="text-sm h-9"
              disabled={chatLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={chatLoading || !chatInput.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
