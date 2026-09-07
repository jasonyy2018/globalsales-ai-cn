"use client";

import React, { useState, useEffect } from "react";
import { Sidebar, NAV_GROUPS } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AuthGateModal } from "@/components/layout/AuthGateModal";

// Module components
import { SourcingModule } from "@/components/modules/SourcingModule";
import { HotspotModule } from "@/components/modules/HotspotModule";
import { ProductModule } from "@/components/modules/ProductModule";
import { ArticleModule } from "@/components/modules/ArticleModule";
import { VideoModule } from "@/components/modules/VideoModule";
import { FreeQAModule } from "@/components/modules/FreeQAModule";
import { TextStudioModule } from "@/components/modules/TextStudioModule";
import { ImageModule } from "@/components/modules/ImageModule";
import { VideoCreateModule } from "@/components/modules/VideoCreateModule";
import { CommentModule, SmartReplyModule } from "@/components/modules/CommentModules";
import { AssetsModule } from "@/components/modules/AssetsModule";
import {
  CommercePlatformsModule,
  SocialPlatformsModule,
  HolidaysModule,
  MetricsModule,
} from "@/components/modules/KnowledgeModules";
import { PromptsModule, ModelsModule, ModelShopModule } from "@/components/modules/ConfigModules";
import { AdminUsersModule, AdminIpStatsModule, AccountsModule } from "@/components/modules/AdminModules";
import { DemoModule, UserCenterModule } from "@/components/modules/UserCenterAndDemoModules";

import type { User, ScrapeProductResult } from "@/types";

export default function Home() {
  const [currentSection, setCurrentSection] = useState("hotspot");
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [productContext, setProductContext] = useState<ScrapeProductResult | null>(null);
  const [articleTopic, setArticleTopic] = useState("");
  const [videoTopic, setVideoTopic] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Fetch current user on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});

    // Restore workspace appdata
    fetch("/api/data/appdata")
      .then((res) => res.ok ? res.json() : null)
      .then((d) => {
        if (d?.data?.productContext) {
          setProductContext(d.data.productContext);
        }
      })
      .catch(() => {});
  }, []);

  // Autosave workspace on productContext update
  useEffect(() => {
    if (!user) return;
    setSaveStatus("saving");
    const t = setTimeout(() => {
      fetch("/api/data/appdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productContext }),
      })
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("idle"));
    }, 2000);

    return () => clearTimeout(t);
  }, [productContext, user]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  // Find current section metadata
  let currentTitle = "工作台";
  let currentDesc = "";
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.id === currentSection);
    if (item) {
      currentTitle = item.name;
      currentDesc = group.name;
      break;
    }
  }

  // Navigation callbacks from Hotspot
  const handleJumpToArticle = (topic: string) => {
    setArticleTopic(topic);
    setCurrentSection("article");
  };

  const handleJumpToVideo = (topic: string) => {
    setVideoTopic(topic);
    setCurrentSection("video");
  };

  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-200">
      {/* Sidebar */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={setCurrentSection}
        userRole={user?.role}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentSectionTitle={currentTitle}
          currentSectionDesc={currentDesc}
          user={user}
          onOpenAuth={() => setAuthModalOpen(true)}
          onLogout={handleLogout}
          saveStatus={saveStatus}
        />

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {currentSection === "sourcing" && <SourcingModule />}
          {currentSection === "hotspot" && (
            <HotspotModule
              onNavigateToArticle={handleJumpToArticle}
              onNavigateToVideo={handleJumpToVideo}
            />
          )}
          {currentSection === "product" && (
            <ProductModule
              productContext={productContext}
              onUpdateProductContext={setProductContext}
            />
          )}
          {currentSection === "article" && (
            <ArticleModule
              initialTopic={articleTopic}
              productContext={productContext}
            />
          )}
          {currentSection === "video" && (
            <VideoModule
              initialTopic={videoTopic}
              productContext={productContext}
            />
          )}
          {currentSection === "freeqa" && <FreeQAModule />}

          {currentSection === "text-studio" && <TextStudioModule />}
          {currentSection === "image" && <ImageModule />}
          {currentSection === "video-create" && <VideoCreateModule />}
          {currentSection === "comment" && <CommentModule />}
          {currentSection === "smart-reply" && <SmartReplyModule />}

          {currentSection === "accounts" && <AccountsModule />}
          {currentSection === "assets" && <AssetsModule />}
          {currentSection === "ip-stats" && <AdminIpStatsModule />}

          {currentSection === "commerce-platforms" && <CommercePlatformsModule />}
          {currentSection === "social-platforms" && <SocialPlatformsModule />}
          {currentSection === "holidays" && <HolidaysModule />}
          {currentSection === "metrics" && <MetricsModule />}

          {currentSection === "prompts" && <PromptsModule />}
          {currentSection === "models" && <ModelsModule />}
          {currentSection === "model-shop" && <ModelShopModule />}

          {currentSection === "demo" && <DemoModule />}
          {currentSection === "user-center" && <UserCenterModule user={user} />}
          {currentSection === "users" && <AdminUsersModule />}
        </main>
      </div>

      {/* Auth Modal */}
      <AuthGateModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => setUser(u)}
      />
    </div>
  );
}
