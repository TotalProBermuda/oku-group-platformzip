import type { InviteEmailData } from "./types";

export function classicTemplate(d: InviteEmailData): string {
  const badge = d.audienceLabel
    ? `<tr><td align="center" style="padding:0 0 24px">
        <span style="background:#1a1614;color:#f5f0ea;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;padding:6px 16px;border-radius:20px;font-family:sans-serif">${d.audienceLabel}</span>
       </td></tr>`
    : "";

  const mediaBlock = d.flyerImageUrl
    ? `<tr><td style="padding:0 0 32px">
        <img src="${d.flyerImageUrl}" alt="${d.eventTitle}" style="width:100%;max-width:520px;border-radius:8px;display:block" />
       </td></tr>`
    : d.heroImageUrl
    ? `<tr><td style="padding:0 0 32px">
        <img src="${d.heroImageUrl}" alt="${d.eventTitle}" style="width:100%;max-width:520px;border-radius:8px;display:block;max-height:280px;object-fit:cover" />
       </td></tr>`
    : "";

  const ytBlock = d.youtubeUrl
    ? (() => {
        const id = extractYouTubeId(d.youtubeUrl);
        if (!id) return "";
        return `<tr><td style="padding:0 0 28px">
          <a href="${d.youtubeUrl}" style="display:block;position:relative;border-radius:8px;overflow:hidden">
            <img src="https://img.youtube.com/vi/${id}/maxresdefault.jpg" alt="Watch" style="width:100%;display:block;border-radius:8px" />
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;background:rgba(196,30,58,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center">
              <div style="width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:16px solid white;margin-left:4px"></div>
            </div>
          </a>
          <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;text-align:center;font-family:sans-serif">▶ Watch the preview</p>
        </td></tr>`;
      })()
    : "";

  const customMsg = d.customMessage
    ? `<tr><td style="padding:0 0 24px"><p style="margin:0;color:#4b4540;font-size:15px;line-height:1.75;font-family:sans-serif">${d.customMessage}</p></td></tr>`
    : d.eventDescription
    ? `<tr><td style="padding:0 0 24px"><p style="margin:0;color:#4b4540;font-size:15px;line-height:1.75;font-family:sans-serif">${d.eventDescription}</p></td></tr>`
    : "";

  const subtitle = d.eventSubtitle
    ? `<tr><td style="padding:0 0 6px"><p style="margin:0;color:#7c7168;font-size:14px;font-family:sans-serif;letter-spacing:0.04em">${d.eventSubtitle}</p></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${d.customSubject ?? `You're invited — ${d.eventTitle}`}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0ea;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ea;padding:40px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%">
  <!-- HEADER -->
  <tr>
    <td style="background:#1a1614;padding:28px 32px;text-align:center">
      <span style="color:#c41e3a;font-size:30px;font-weight:700;letter-spacing:0.06em;font-family:Georgia,serif">OKÜ</span>
      <span style="color:#9ca3af;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;margin-left:10px;font-family:sans-serif">HOSPITALITY GROUP</span>
    </td>
  </tr>
  <!-- BODY -->
  <tr>
    <td style="padding:40px 40px 36px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${badge}
        ${mediaBlock}
        ${ytBlock}
        <tr><td style="padding:0 0 6px">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;font-family:sans-serif">You are invited</p>
        </td></tr>
        <tr><td style="padding:0 0 8px">
          <h1 style="margin:0;color:#1a1614;font-size:30px;line-height:1.15;font-family:Georgia,serif">${d.eventTitle}</h1>
        </td></tr>
        ${subtitle}
        <tr><td style="padding:0 0 28px">
          <div style="width:40px;height:2px;background:#c41e3a;margin-top:14px"></div>
        </td></tr>

        <!-- Details card -->
        <tr><td style="padding:0 0 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;border-radius:10px;padding:20px">
            <tr><td style="padding-bottom:14px">
              <p style="margin:0 0 3px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;font-family:sans-serif">Date &amp; Time</p>
              <p style="margin:0;color:#1a1614;font-size:15px;font-family:sans-serif;font-weight:500">${d.eventDate ?? "Date TBD"}</p>
            </td></tr>
            <tr><td style="border-top:1px solid #e8e3db;padding-top:14px">
              <p style="margin:0 0 3px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;font-family:sans-serif">Venue</p>
              <p style="margin:0;color:#1a1614;font-size:15px;font-family:sans-serif;font-weight:500">${d.eventVenue}</p>
            </td></tr>
          </table>
        </td></tr>

        ${customMsg}

        <!-- CTA -->
        <tr><td style="padding:0 0 28px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:8px" width="50%">
                <a href="${d.rsvpUrl}" style="display:block;text-align:center;background:#c41e3a;color:#ffffff;font-size:14px;font-weight:700;font-family:sans-serif;padding:16px;border-radius:8px;text-decoration:none;letter-spacing:0.06em">RSVP</a>
              </td>
              <td style="padding-left:8px" width="50%">
                <a href="${d.declineUrl}" style="display:block;text-align:center;background:#f5f0ea;color:#7c7168;border:1px solid #e8e3db;font-size:14px;font-weight:600;font-family:sans-serif;padding:16px;border-radius:8px;text-decoration:none;letter-spacing:0.04em">Decline</a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer note -->
        <tr><td>
          <p style="margin:0;color:#c4bfb8;font-size:11px;line-height:1.6;font-family:sans-serif;text-align:center">
            This invitation is personal and non-transferable.<br/>OKÜ Hospitality Group &middot; Panama City
          </p>
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
