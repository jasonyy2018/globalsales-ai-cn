"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquareQuote, Send, Globe, Mic, Image as ImageIcon, Trash2, Bot, User, Copy, Check } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  timestamp: string;
}

export function FreeQAModule() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我是你的自媒体专属 AI 创作伙伴。你可以向我咨询选品灵感、改写爆款文案、设计互动问答，或上传图片进行视觉分析。",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [useSearch, setUseSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let contextSearch = "";
      if (useSearch) {
        const sRes = await fetch(`/api/web_search?q=${encodeURIComponent(userMsg.content)}&count=3`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.results?.length > 0) {
            contextSearch = `\n【实时网络参考资讯】：\n` + sData.results.map((r: { title: string; snippet: string }) => `- ${r.title}: ${r.snippet}`).join("\n");
          }
        }
      }

      const res = await fetch("/api/ark_plan_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ark-code-latest",
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg.content + contextSearch },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.choices?.[0]?.message?.content || "暂未获取到回答，请重试。";
        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: replyText,
          timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (e) {
      console.error("Chat error:", e);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Top chat bar */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center space-x-2">
          <MessageSquareQuote className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-slate-100">自由智能问答工作台</h3>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setUseSearch(!useSearch)}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              useSearch
                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>联网搜索增强</span>
          </button>

          <button
            onClick={() => setMessages([])}
            className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="清空聊天记录"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start space-x-3 ${m.role === "user" ? "flex-row-reverse space-x-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                m.role === "user"
                  ? "bg-gradient-to-tr from-indigo-500 to-purple-500 text-white"
                  : "bg-slate-800 text-indigo-400 border border-slate-700"
              }`}
            >
              {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div className={`max-w-[80%] space-y-1 ${m.role === "user" ? "text-right" : ""}`}>
              <div
                className={`p-3.5 rounded-2xl text-xs leading-relaxed inline-block text-left ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-slate-950 border border-slate-800 text-slate-200"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>

              <div className="flex items-center space-x-2 text-[10px] text-slate-500 px-1">
                <span>{m.timestamp}</span>
                {m.role === "assistant" && (
                  <button
                    onClick={() => copyText(m.id, m.content)}
                    className="hover:text-slate-300 transition-colors flex items-center space-x-0.5"
                  >
                    {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === m.id ? "已复制" : "复制"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center space-x-2 text-xs text-indigo-400 animate-pulse p-2">
            <Bot className="w-4 h-4" />
            <span>AI 思考生成中...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="输入你的创作需求或问题（按 Enter 发送）..."
            className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 flex items-center space-x-1"
          >
            <Send className="w-3.5 h-3.5" />
            <span>发送</span>
          </button>
        </div>
      </div>
    </div>
  );
}
