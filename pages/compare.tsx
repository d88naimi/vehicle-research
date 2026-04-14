import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Download, FileText, Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface VehicleSpec {
  label: string;
  values: Record<string, string>;
}

const MOCK_SPECS: VehicleSpec[] = [
  {
    label: "Engine",
    values: {
      "toyota-camry-2024": "2.5L 4-cyl",
      "honda-cr-v-2024": "1.5L Turbo",
      "ford-f150-2024": "2.7L EcoBoost V6",
    },
  },
  {
    label: "Horsepower",
    values: {
      "toyota-camry-2024": "203 hp",
      "honda-cr-v-2024": "190 hp",
      "ford-f150-2024": "325 hp",
    },
  },
  {
    label: "MPG (city/hwy)",
    values: {
      "toyota-camry-2024": "28/39",
      "honda-cr-v-2024": "28/34",
      "ford-f150-2024": "20/26",
    },
  },
  {
    label: "Base Price",
    values: {
      "toyota-camry-2024": "$27,415",
      "honda-cr-v-2024": "$30,700",
      "ford-f150-2024": "$36,075",
    },
  },
  {
    label: "Cargo Space",
    values: {
      "toyota-camry-2024": "15.1 cu ft",
      "honda-cr-v-2024": "39.3 cu ft",
      "ford-f150-2024": "52.8 cu ft",
    },
  },
  {
    label: "Warranty",
    values: {
      "toyota-camry-2024": "3yr/36k basic",
      "honda-cr-v-2024": "3yr/36k basic",
      "ford-f150-2024": "3yr/36k basic",
    },
  },
];

function vehicleLabel(id: string) {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/(\d{4})/, " $1");
}

export default function ComparePage() {
  const router = useRouter();
  const { vehicles: vehiclesParam } = router.query;
  const vehicleIds =
    typeof vehiclesParam === "string"
      ? vehiclesParam.split(",").filter(Boolean)
      : [];

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const vehicleContext =
      vehicleIds.length > 0
        ? `The user is comparing these vehicles: ${vehicleIds.map(vehicleLabel).join(", ")}.`
        : "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          vehicleContext,
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
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-bold text-xl">Compare Vehicles</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={vehicleIds.length === 0}
              onClick={() => {
                window.open(
                  `/api/export/pdf?vehicles=${vehicleIds.join(",")}`,
                  "_blank",
                );
              }}
            >
              <FileText className="h-4 w-4" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export Slides
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full px-4 py-6 gap-6">
        {/* Comparison Table */}
        <div className="flex-1 overflow-auto">
          {vehicleIds.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg">No vehicles selected.</p>
              <Button className="mt-4" onClick={() => router.push("/")}>
                Go back and select vehicles
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Vehicle headers */}
              <div
                className={`grid gap-4`}
                style={{
                  gridTemplateColumns: `200px repeat(${vehicleIds.length}, 1fr)`,
                }}
              >
                <div />
                {vehicleIds.map((id) => (
                  <Card key={id} className="text-center">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {vehicleLabel(id)}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => router.push(`/vehicle/${id}`)}
                      >
                        View full research →
                      </Button>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              <Separator />

              {/* Spec rows */}
              {MOCK_SPECS.map((spec) => (
                <div
                  key={spec.label}
                  className="grid gap-4 items-center"
                  style={{
                    gridTemplateColumns: `200px repeat(${vehicleIds.length}, 1fr)`,
                  }}
                >
                  <div className="text-sm font-medium text-muted-foreground">
                    {spec.label}
                  </div>
                  {vehicleIds.map((id) => (
                    <div
                      key={id}
                      className="text-sm text-center py-2 px-3 bg-muted rounded-md"
                    >
                      {spec.values[id] ?? "—"}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Chat Panel */}
        <div className="w-80 flex flex-col border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="font-medium text-sm">AI Research Assistant</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              GPT-4
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Ask me anything about these vehicles — reliability, real-world
                ownership costs, best use cases, and more.
              </p>
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
                    (loading && i === messages.length - 1 ? "…" : "")}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
            <Input
              className="text-sm h-9"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={loading}
            >
              <Send className="h-3 w-3" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
