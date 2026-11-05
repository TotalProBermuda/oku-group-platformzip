import Link from "next/link";

export default function SaveToPhonePage() {
  return (
    <main className="page-container" style={{ maxWidth: 720, padding: "32px 20px", overflowWrap: "anywhere" }}>
      <h1>Keep OKÜ one tap away</h1>
      <p>Save your account or dashboard to your phone’s home screen. This is a website shortcut: you still need an internet connection and may need to sign in again.</p>
      <section className="card" style={{ padding: 20, margin: "24px 0" }}>
        <h2>1. Choose what to save</h2>
        <p>Open your account for reservations, or My Tickets for your event tickets. Referrers and staff can open their dashboard from the account menu first.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link className="btn btn-primary" href="/my">Open my account</Link>
          <Link className="btn btn-ghost" href="/my/tickets">Open my tickets</Link>
        </div>
        <p>Save the destination page—not an email sign-in link, payment page or bank verification screen. Never share your private sign-in link.</p>
      </section>
      <section className="card" style={{ padding: 20, margin: "24px 0" }}>
        <h2>2. Add it to your home screen</h2>
        <h3>iPhone · Safari</h3>
        <p>On your chosen page, open Share, choose Add to Home Screen, then tap Add. You may find Share inside the browser’s More menu.</p>
        <h3>Android · Chrome</h3>
        <p>On your chosen page, open the three-dot menu, choose Add to home screen, then Create shortcut and Add. Wording may vary by device.</p>
        <p>If you opened OKÜ inside Instagram, WhatsApp or an email app, open the page in Safari or Chrome first.</p>
      </section>
      <p>Coming back? Open the shortcut and use the same email address as your booking or invitation. The menu keeps personal tickets separate from your work dashboard.</p>
      <p style={{ fontSize: 14 }}>Device help: <a href="https://support.apple.com/guide/iphone/iphea86e5236/ios">Apple’s instructions</a> · <a href="https://support.google.com/chrome/answer/15085120?co=GENIE.Platform%3DAndroid&amp;hl=en">Chrome’s instructions</a></p>
    </main>
  );
}
