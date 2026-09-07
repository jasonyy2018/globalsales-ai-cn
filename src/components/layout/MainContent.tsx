"use client";

import React, { useEffect } from "react";
import legacyMain from "./legacy_main_html.json";
import legacyOverlays from "./legacy_overlays_html.json";

export function MainContent() {
  useEffect(() => {
    // If window.init is available, run it
    if (typeof window !== "undefined") {
      const runInit = () => {
        if (typeof (window as any).init === "function") {
          try {
            (window as any).init();
          } catch (e) {
            console.error("App init error:", e);
          }
        }
      };

      if (document.readyState === "complete" || document.readyState === "interactive") {
        runInit();
      } else {
        window.addEventListener("DOMContentLoaded", runInit);
        return () => window.removeEventListener("DOMContentLoaded", runInit);
      }
    }
  }, []);

  return (
    <>
      <main
        className="main-content"
        id="mainContent"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: legacyMain.html }}
      />
      <div
        id="legacy-overlays-container"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: legacyOverlays.html }}
      />
    </>
  );
}
