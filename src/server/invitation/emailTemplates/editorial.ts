import type { InviteEmailData } from "./types";

export function editorialTemplate(d: InviteEmailData): string {
  const heroUrl = d.flyerImageUrl ?? d.heroImageUrl;

  const heroBlock = heroUrl
    ? `<tr><td style="padding:0;position:relative">
        <div style="position:relative;overflow:hidden;border-radius:10px 10px 0 0;min-height:320px;background:#1a1614">
          <img src="${heroUrl}" alt="${d.eventTitle}" style="width:100%;display:block;max-height:380px;object-fit:cover;opacity:0.75" />
          <div style="position:absolute;bottom:0;left:0;right:0;padding:32px 36px;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%)">
            ${d.audienceLabel ? `<p style="margin:0 0 8px;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.16em;font-family:sans-serif">${d.audienceLabel}</p>` : ""}
            <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;font-family:Georgia,serif">${d.eventTitle}</h1>
            ${d.eventSubtitle ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;font-family:sans-serif">${d.eventSubtitle}</p>` : ""}
          </div>
        </div>
       </td></tr>`
    : `<tr><td style="background:#1a1614;padding:40px 36px;border-radius:10px 10px 0 0">
        <span style="color:#c41e3a;font-size:26px;font-weight:700;font-family:Georgia,serif">OKÜ</span>
        <h1 style="margin:16px 0 0;color:#ffffff;font-size:28px;font-family:Georgia,serif">${d.eventTitle}</h1>
       </td></tr>`;

  const ytBlock = d.youtubeUrl && !heroUrl
    ? (() => {
        const id = d.youtubeUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1];
        if (!id) return "";
        return `<tr><td style="padding:0 0 24px">
          <a href="${d.youtubeUrl}" style="display:block;border-radius:8px;overflow:hidden;position:relative">
            <img src="https://img.youtube.com/vi/${id}/maxresdefault.jpg" alt="Watch" style="width:100%;display:block" />
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
              <div style="width:64px;height:64px;background:rgba(196,30,58,0.95);border-radius:50%"></div>
            </div>
          </a>
        </td></tr>`;
      })()
    : "";

  const customMsg = d.customMessage ?? d.eventDescription;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${d.customSubject ?? `You're invited — ${d.eventTitle}`}</title>
</head>
<body style="margin:0;padding:0;background:#1a1614;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1614;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:560px;width:100%">

  ${heroBlock}

  <!-- BODY -->
  <tr>
    <td style="padding:36px 36px 32px">
      ${!heroUrl ? `<p style="margin:0 0 20px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;font-family:sans-serif">You are invited</p>` : ""}
      <table width="100%" cellpadding="0" cellspacing="0">
        ${ytBlock}

        <!-- Details card -->
        <tr><td style="padding:0 0 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e3db;border-radius:8px">
            <tr>
              <td style="padding:18px 20px;border-right:1px solid #e8e3db" width="50%">
                <p style="margin:0 0 3px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;font-family:sans-serif">Date</p>
                <p style="margin:0;color:#1a1614;font-size:14px;font-family:sans-serif;font-weight:600">${d.eventDate ?? "TBD"}</p>
              </td>
              <td style="padding:18px 20px" width="50%">
                <p style="margin:0 0 3px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;font-family:sans-serif">Venue</p>
                <p style="margin:0;color:#1a1614;font-size:14px;font-family:sans-serif;font-weight:600">${d.eventVenue}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${customMsg ? `<tr><td style="padding:0 0 28px"><p style="margin:0;color:#4b4540;font-size:15px;line-height:1.75;font-family:sans-serif">${customMsg}</p></td></tr>` : ""}

        <!-- CTA -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:8px" width="50%">
                <a href="${d.rsvpUrl}" style="display:block;text-align:center;background:#c41e3a;color:#fff;font-size:14px;font-weight:700;font-family:sans-serif;padding:16px;border-radius:8px;text-decoration:none;letter-spacing:0.06em">RSVP</a>
              </td>
              <td style="padding-left:8px" width="50%">
                <a href="${d.declineUrl}" style="display:block;text-align:center;background:#fff;color:#7c7168;border:1px solid #e8e3db;font-size:14px;font-weight:600;font-family:sans-serif;padding:16px;border-radius:8px;text-decoration:none">Decline</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f9f7f4;padding:20px 36px;text-align:center">
      <span style="color:#c41e3a;font-size:18px;font-weight:700;font-family:Georgia,serif">OKÜ</span>
      <p style="margin:4px 0 0;color:#c4bfb8;font-size:11px;font-family:sans-serif">HOSPITALITY GROUP &middot; PANAMA CITY</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
