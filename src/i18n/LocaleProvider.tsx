"use client";

import React, { createContext, useContext } from "react";
import type { Locale } from "@/types/i18n";

type LocaleContextType = {
  locale: Locale;
};

const LocaleContext = createContext<LocaleContextType>({ locale: "en" });

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <LocaleContext.Provider value={{ locale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}
