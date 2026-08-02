import type { InviteEmailData } from "./types";

export function darkLuxuryTemplate(d: InviteEmailData): string {
  const GOLD = "#b8973a";
  const DARK = "#111010";
  const MID = "#1e1b1a";
  const CARD = "#252220";

  const heroUrl = d.flyerImageUrl ?? d.heroImageUrl;

  const mediaBlock = heroUrl
    ? `<tr><td style="padding:0 0 32px">
        <img src="${heroUrl}" alt="${d.eventTitle}" style="width:100%;display:block;border-radius:6px;max-height:300px;object-fit:cover;border:1px solid #2e2a28" />
       </td></tr>`
    : "";

  const ytBlock = d.youtubeUrl
    ? (() => {
        const id = d.youtubeUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1];
        if (!id) return "";
        return `<tr><td style="padding:0 0 28px">
          <a href="${d.youtubeUrl}" style="display:block;border-radius:6px;overflow:hidden;position:relative;border:1px solid #2e2a28">
            <img src="https://img.youtube.com/vi/${id}/maxresdefault.jpg" alt="Watch" style="width:100%;display:block;opacity:0.7" />
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4)">
              <div style="width:56px;height:56px;background:${GOLD};border-radius:50%;display:flex;align-items:center;justify-content:center">
                <div style="width:0;height:0;border-top:9px solid transparent;border-bottom:9px solid transparent;border-left:14px solid #111;margin-left:3px"></div>
              </div>
            </div>
          </a>
        </td></tr>`;
      })()
    : "";

  const badge = d.audienceLabel
    ? `<tr><td align="center" style="padding:0 0 28px">
        <span style="border:1px solid ${GOLD};color:${GOLD};font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;padding:6px 18px;border-radius:20px;font-family:sans-serif">${d.audienceLabel}</span>
       </td></tr>`
    : "";

  const customMsg = d.customMessage ?? d.eventDescription;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${d.customSubject ?? `You're invited — ${d.eventTitle}`}</title>
</head>
<body style="margin:0;padding:0;background:${DARK};font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${DARK};padding:40px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:${MID};border:1px solid #2e2a28;border-radius:12px;overflow:hidden;max-width:560px;width:100%">

  <!-- HEADER -->
  <tr>
    <td style="padding:32px;text-align:center;border-bottom:1px solid #2e2a28">
      <div style="display:inline-block;width:1px;height:20px;background:${GOLD};vertical-align:middle;margin-right:12px"></div>
      <span style="color:${GOLD};font-size:26px;font-weight:700;letter-spacing:0.08em;font-family:Georgia,serif">OKÜ</span>
      <div style="display:inline-block;width:1px;height:20px;background:${GOLD};vertical-align:middle;margin-left:12px"></div>
      <p style="margin:6px 0 0;color:#6b6560;font-size:9px;letter-spacing:0.28em;text-transform:uppercase;font-family:sans-serif">HOSPITALITY GROUP</p>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:40px 40px 36px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${badge}
        ${mediaBlock}
        ${ytBlock}

        <tr><td style="padding:0 0 4px">
          <p style="margin:0;color:#6b6560;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;font-family:sans-serif">You are invited</p>
        </td></tr>
        <tr><td style="padding:0 0 6px">
          <h1 style="margin:0;color:#f5f0ea;font-size:30px;line-height:1.15;font-family:Georgia,serif">${d.eventTitle}</h1>
        </td></tr>
        ${d.eventSubtitle ? `<tr><td style="padding:0 0 8px"><p style="margin:0;color:#9c9690;font-size:14px;font-family:sans-serif">${d.eventSubtitle}</p></td></tr>` : ""}
        <tr><td style="padding:0 0 32px">
          <div style="width:36px;height:1px;background:${GOLD};margin-top:14px"></div>
        </td></tr>

        <!-- Details card -->
        <tr><td style="padding:0 0 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid #2e2a28;border-radius:8px">
            <tr><td style="padding:18px 20px;border-bottom:1px solid #2e2a28">
              <p style="margin:0 0 3px;color:#6b6560;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;font-family:sans-serif">Date &amp; Time</p>
              <p style="margin:0;color:#f5f0ea;font-size:15px;font-family:sans-serif;font-weight:500">${d.eventDate ?? "Date TBD"}</p>
            </td></tr>
            <tr><td style="padding:18px 20px">
              <p style="margin:0 0 3px;color:#6b6560;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;font-family:sans-serif">Venue</p>
              <p style="margin:0;color:#f5f0ea;font-size:15px;font-family:sans-serif;font-weight:500">${d.eventVenue}</p>
            </td></tr>
          </table>
        </td></tr>

        ${customMsg ? `<tr><td style="padding:0 0 28px"><p style="margin:0;color:#9c9690;font-size:15px;line-height:1.75;font-family:sans-serif">${customMsg}</p></td></tr>` : ""}

        <!-- CTA -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:8px" width="50%">
                <a href="${d.rsvpUrl}" style="display:block;text-align:center;background:${GOLD};color:#111;font-size:13px;font-weight:700;font-family:sans-serif;padding:16px;border-radius:8px;text-decoration:none;letter-spacing:0.08em">RSVP</a>
              </td>
              <td style="padding-left:8px" width="50%">
                <a href="${d.declineUrl}" style="display:block;text-align:center;background:transparent;color:#6b6560;border:1px solid #2e2a28;font-size:13px;font-weight:600;font-family:sans-serif;padding:16px;border-radius:8px;text-decoration:none;letter-spacing:0.06em">Decline</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:20px 40px;border-top:1px solid #2e2a28;text-align:center">
      <p style="margin:0;color:#4a4540;font-size:10px;letter-spacing:0.12em;font-family:sans-serif;text-transform:uppercase">Invitation exclusive · Non-transferable</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
