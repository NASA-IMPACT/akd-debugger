"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isExistentialModeUser,
  normalizeEmail,
  syncExistentialModeAttribute,
  THEME_SYNC_EVENT,
  USER_EMAIL_STORAGE_KEY,
} from "@/lib/existential-mode";

type Theme = "light" | "dark";

function resolveThemeFromStorage(): Theme {
  const email = normalizeEmail(localStorage.getItem(USER_EMAIL_STORAGE_KEY));
  syncExistentialModeAttribute(email);
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return isExistentialModeUser(email) ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const applyResolvedTheme = () => {
      const next = resolveThemeFromStorage();
      setThemeState(next);
      document.documentElement.setAttribute("data-theme", next);
    };

    applyResolvedTheme();
    window.addEventListener(THEME_SYNC_EVENT, applyResolvedTheme);
    window.addEventListener("storage", applyResolvedTheme);
    return () => {
      window.removeEventListener(THEME_SYNC_EVENT, applyResolvedTheme);
      window.removeEventListener("storage", applyResolvedTheme);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
    window.dispatchEvent(new Event(THEME_SYNC_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
