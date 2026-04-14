import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Youtube,
  FileText,
  Download,
  Send,
  Bot,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { YouTubeVideo } from "@/pages/api/youtube";
import type { Article } from "@/pages/api/articles";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function formatVehicleTitle(id: string) {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function VehiclePage() {
  const router = useRouter();
  const { id } = router.query;
  const vehicleId = typeof id === "string" ? id : "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const dataAbortRef = useRef<AbortController | null>(null);

  // Cancel in-flight requests when the component unmounts
  useEffect(
    () => () => {
      chatAbortRef.current?.abort();
      dataAbortRef.current?.abort();
    },
    [],
  );

  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!vehicleId) return;
    const query = `${formatVehicleTitle(vehicleId)} review`;

    dataAbortRef.current?.abort();
    const ac = new AbortController();
    dataAbortRef.current = ac;

    setVideosLoading(true);
    setVideosError(null);
    fetch(`/api/youtube?q=${encodeURIComponent(query)}`, { signal: ac.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setVideos(data.videos ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setVideosError(err.message);
      })
      .finally(() => setVideosLoading(false));

    setArticlesLoading(true);
    setArticlesError(null);
    fetch(`/api/articles?q=${encodeURIComponent(query)}`, { signal: ac.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setArticles(data.articles ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setArticlesError(err.message);
      })
      .finally(() => setArticlesLoading(false));
  }, [vehicleId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const vehicleContext = `The user is researching the ${formatVehicleTitle(vehicleId)}.`;

    chatAbortRef.current?.abort();
    const ac = new AbortController();
    chatAbortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          vehicleContext,
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
      setLoading(false);
    }
  }

  if (!vehicleId) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-bold text-xl">
                {formatVehicleTitle(vehicleId)}
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-curated research
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => router.push(`/compare?vehicles=${vehicleId}`)}
            >
              + Compare
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <FileText className="h-4 w-4" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Slides
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Main content */}
        <div className="flex-1 space-y-8 min-w-0">
          {/* YouTube Reviews */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Youtube className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold">Top Video Reviews</h2>
              {!videosLoading && !videosError && (
                <Badge variant="secondary">{videos.length} videos</Badge>
              )}
            </div>

            {videosLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading videos…
              </div>
            )}

            {videosError && (
              <p className="text-sm text-destructive py-4">{videosError}</p>
            )}

            {!videosLoading && !videosError && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map((video) => (
                  <Card
                    key={video.id}
                    className="overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full aspect-video object-cover"
                      />
                    </a>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium line-clamp-2 mb-1">
                        {video.title}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {video.channel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {video.views}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-xs gap-1 px-2"
                        asChild
                      >
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Watch <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Articles */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Expert Articles</h2>
              {!articlesLoading && !articlesError && (
                <Badge variant="secondary">{articles.length} articles</Badge>
              )}
            </div>

            {articlesLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading articles…
              </div>
            )}

            {articlesError && (
              <p className="text-sm text-destructive py-4">{articlesError}</p>
            )}

            {!articlesLoading && !articlesError && (
              <div className="space-y-3">
                {articles.map((article) => (
                  <Card key={article.id}>
                    <CardContent className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-snug">
                          {article.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {article.snippet}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-muted-foreground">
                            {article.source}
                          </span>
                          {article.date && (
                            <>
                              <span className="text-xs text-muted-foreground">
                                ·
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {article.date}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        asChild
                      >
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* AI Chat Panel */}
        <div className="w-80 shrink-0 flex flex-col border rounded-lg overflow-hidden h-[calc(100vh-120px)] sticky top-6">
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="font-medium text-sm">AI Research Assistant</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  Ask me anything about the {formatVehicleTitle(vehicleId)}:
                </p>
                {[
                  "What are common reliability issues?",
                  "How does it compare to competitors?",
                  "Is it good for families?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    className="block w-full text-left text-xs px-3 py-2 rounded-md bg-muted hover:bg-muted/70 transition-colors"
                    onClick={() => setInput(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "text-right" : ""}>
                <span
                  className={`inline-block rounded-lg px-3 py-2 max-w-[95%] text-left whitespace-pre-wrap ${
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
              placeholder="Ask about this vehicle…"
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
