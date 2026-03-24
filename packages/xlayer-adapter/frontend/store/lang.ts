import { create } from "zustand";
import { Language } from "@/lib/i18n";

interface LangState {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: "en",
  setLang: (lang) => set({ lang }),
  toggleLang: () => set((state) => ({ lang: state.lang === "en" ? "zh" : "en" })),
}));
