import React from 'react';
import { createRoot } from 'react-dom/client';
import Checkout from '../../../src/app/checkout/[slug]/page';
import NavbarAuth from '../../../src/components/NavbarAuth';
import NavbarMobileMenu from '../../../src/components/NavbarMobileMenu';
import AdminNav from '../../../src/components/AdminNav';
import ReservationWizard from '../../../src/components/reservations/ReservationWizard';
import bookingCopy from '../../../src/i18n/translations/en/booking.json';
import VerifyMagicLinkPage from '../../../src/app/auth/verify/page';
import { LocaleProvider } from '../../../src/components/i18n/LocaleProvider';
import authCopy from '../../../src/i18n/translations/en/auth.json';
import { AdminContext } from '../../../src/contexts/AdminContext';
import '../../../src/app/globals.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'approved';
const respond = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
let confirms = 0;
const count = document.createElement('p');
count.id = 'fixture-count';
count.textContent = 'ISOLATED TEST · confirm requests: 0';
document.body.prepend(count);
window.Flex = class { microform() { return {
  createField: () => ({ load: id => { document.querySelector(id).textContent = 'Simulated secure field — no card required'; } }),
  createToken: (_options, callback) => callback(null, 'mock-token-not-a-card'),
}; } };
const script = document.createElement('script');
script.src = '/mock-flex.js'; document.head.append(script);
window.fetch = async (url) => {
  if (url.startsWith('/api/reservations/service-window')) return respond({ slots: ['17:00', '17:30', '19:00'] });
  if (url.startsWith('/api/v1/experiences?')) return respond({ series: [{ title: 'Isolated event', city: 'Panama', sessions: [{ id: 's', startsAt: '2030-01-01T22:00:00Z' }], ticketTypes: [{ id: 't', name: 'Test ticket', priceCents: 200 }] }] });
  if (url.endsWith('/quote')) return respond({ sessionId: 's', subtotalCents: 200, feesCents: 10, taxCents: 17, totalCents: 227, lineItems: [{ nameSnapshot: 'Test ticket', qty: 1, unitPriceCents: 200, totalCents: 200 }] });
  if (url.endsWith('/intent')) return respond({ data: { intentId: 'isolated-order' } });
  if (url.endsWith('/capture-context')) return respond({ data: { captureContext: 'mock', clientLibrary: '/mock-flex.js' } });
  if (url.endsWith('/setup')) return respond({ data: { deviceDataCollectionUrl: '/bank', accessToken: 'mock', referenceId: 'mock' } });
  if (url.endsWith('/confirm')) {
    confirms++; count.textContent = `ISOLATED TEST · confirm requests: ${confirms}`;
    if (confirms === 1) return respond({ data: { payerAuthenticationChallenge: { authenticationTransactionId: 'isolated-challenge', stepUpUrl: '/bank', token: 'mock' } } }, 202);
    if (scenario === 'lost-response') throw new Error('Simulated lost response');
    if (scenario === 'declined') return respond({ ok: false, data: { code: 'DECLINED' } }, 402);
    return respond({ ok: true, data: { orderId: 'isolated-order' } });
  }
  throw new Error('Network disabled in isolated checkout fixture');
};
const role = new URLSearchParams(location.search).get('role') || 'REFERRER';
const session = { user: { name: 'Isolated Tester', email: 'tester@example.invalid', roles: [role] } };
createRoot(document.getElementById('root')).render(<React.StrictMode>{scenario === 'signin-recovery'
  ? <LocaleProvider locale="en" translations={{auth:authCopy}}><VerifyMagicLinkPage /></LocaleProvider>
  : scenario === 'reservation'
  ? <ReservationWizard t={bookingCopy} locale="en" />
  : scenario === 'admin-navigation'
  ? <AdminContext.Provider value={{roles:[role]}}><AdminNav /></AdminContext.Provider>
  : scenario === 'navigation'
  ? <><NavbarAuth session={session}/><NavbarMobileMenu session={session} locale="en" labels={{restaurants:'Restaurants',experiences:'Events',membership:'Membership',careers:'Careers'}}/></>
  : <Checkout />}</React.StrictMode>);
