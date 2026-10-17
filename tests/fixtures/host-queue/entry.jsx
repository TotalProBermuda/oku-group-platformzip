import React from 'react';
import { createRoot } from 'react-dom/client';
import Board from '../../../src/components/host/HostOperationsBoard';
import { LocaleProvider } from '../../../src/components/i18n/LocaleProvider';
import host from '../../../src/i18n/translations/en/host.json';
const booking = { id: 'isolated-next-month', contactName: 'Isolated Future Guest', contactEmail: 'guest@example.invalid', contactPhone: '+507 5550100', partySize: 2, status: 'PENDING_APPROVAL', reservationDate: '2026-11-08T22:00:00Z', source: 'UMBRELLA_SITE', handoffs: [], attributions: [], addons: [], statusLogs: [] };
// No network, database, email or real booking mutations in this fixture.
window.fetch = async (url, options) => {
  if (options?.method && options.method !== 'GET') throw new Error('Mutations prohibited in fixture');
  return new Response(JSON.stringify({ ok: true, data: String(url).includes('/queue') ? { reservations: [booking] } : [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<LocaleProvider locale="en" translations={{host}}><Board reservations={[booking]} waitlist={[]} zones={[]} /></LocaleProvider>);
