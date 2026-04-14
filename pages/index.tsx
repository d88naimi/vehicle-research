import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { Search, ArrowRight, GitCompare, Bot, Send } from "lucide-react";
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

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [compareList, setCompareList] = useState<string[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          vehicleContext:
            "The user is looking for vehicle purchase recommendations. Help them narrow down the best vehicle for their needs by asking about budget, use case, priorities (reliability, performance, fuel economy, cargo space, etc.), and family size. Suggest specific makes and models with brief reasoning. When you recommend a vehicle, mention it by its full name (e.g. '2024 Toyota RAV4').",
        }),
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
            const { text } = JSON.parse(data);
            assistantText += text;
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { role: "assistant", content: assistantText },
            ]);
          } catch {}
        }
      }
    } catch {
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(
        `/vehicle/${encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, "-"))}`,
      );
    }
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
          <div className="flex items-center gap-2">
            <img
              src="/brain-circuit.svg"
              alt="VehicleIQ logo"
              width={32}
              height={32}
            />
            <span className="font-bold text-xl">VehicleIQ</span>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/compare")}>
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Popular Vehicles</h2>
            {compareList.length >= 2 && (
              <Button onClick={goToCompare} variant="outline" className="gap-2">
                <GitCompare className="h-4 w-4" />
                Compare {compareList.length} vehicles
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURED_VEHICLES.map((vehicle) => {
              const selected = compareList.includes(vehicle.id);
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
                      <Button
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleCompare(vehicle.id)}
                      >
                        {selected ? "Added" : "+ Compare"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      AI-curated reviews, specs, and expert analysis
                    </CardDescription>
                    <Button
                      variant="ghost"
                      className="mt-3 p-0 h-auto text-sm font-medium"
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
