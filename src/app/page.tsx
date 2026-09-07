"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import type { User } from "@/types";

export default function Home() {
  const [currentSection, setCurrentSection] = useState("hotspot");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectSection = (id: string) => {
    setCurrentSection(id);
    if (typeof window !== "undefined" && typeof (window as any).scrollToSection === "function") {
      (window as any).scrollToSection(id);
    }
  };

  const handleLogout = async () => {
    if (typeof window !== "undefined" && typeof (window as any).authLogout === "function") {
      (window as any).authLogout();
    } else {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    }
  };

  const handleOpenAuth = () => {
    if (typeof document !== "undefined") {
      const gate = document.getElementById("authGate");
      if (gate) gate.style.display = "flex";
    }
  };

  return (
    <div className="app-layout">
      {/* 1:1 Aligned Sidebar */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={handleSelectSection}
        user={user}
        onLogout={handleLogout}
        onOpenAuth={handleOpenAuth}
      />

      {/* 1:1 Aligned Main Content and Overlays */}
      <MainContent />

    </div>
  );
}
