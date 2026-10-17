import React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionManagementEditor from "@/components/admin/SessionManagementEditor";
import SessionCardsEditor from "@/components/admin/SessionCardsEditor";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import enAdmin from "@/i18n/translations/en/admin.json";
import esAdmin from "@/i18n/translations/es/admin.json";
import ptAdmin from "@/i18n/translations/pt/admin.json";

const catalogs = { en: enAdmin, es: esAdmin, pt: ptAdmin } as const;

describe("SessionManagementEditor initial server render", () => {
  it("renders the individual editor without initialization errors or a bulk mode grid", () => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      <SessionCardsEditor seriesId="fixture-series" sessions={[]} canManageRestricted onSaved={() => undefined} />,
    );
    expect(markup).toContain("Event dates");
    expect(markup).toContain('aria-label="Loading event dates"');
    expect(markup).not.toContain("Untouched");
    expect(markup).not.toContain("Change scope");
  });
  it.each([
    ["en", "Session management", "Loading…"],
    ["es", "Gestión de sesiones", "Cargando…"],
    ["pt", "Gerenciamento de sessões", "Carregando…"],
  ] as const)("renders the %s translated heading and accessible loading fallback", (locale, heading, loadingLabel) => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      <LocaleProvider locale={locale} translations={{ admin: catalogs[locale] }}>
        <SessionManagementEditor seriesId="fixture-series" onSaved={() => undefined} canManageRestricted />
      </LocaleProvider>,
    );
    expect(markup).toContain(heading);
    expect(markup).toContain(`aria-label="${loadingLabel}"`);
    expect(markup).toContain('aria-labelledby="session-management-title"');
    expect(markup).not.toContain("attendee@example.com");
  });
});
