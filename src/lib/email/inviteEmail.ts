import { Resend } from "resend";

function buildInviteEmailHtml(coachName: string, joinUrl: string) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f0ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#ffffff;border-radius:30px;">
          <tr>
            <td style="padding:36px 28px;">
              <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <img src="https://go.theperfclub.com/icon-192.png" width="48" height="48" alt="ThePerfClub" style="border-radius:12px;display:block;" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#171b1f;padding-bottom:10px;">
                    ${coachName} t'invite sur ThePerfClub
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:14px;color:#62686e;line-height:1.6;padding-bottom:26px;">
                    Rejoins son espace de coaching en 30 secondes. Ton accès est gratuit tant que tu es lié à ton coach.
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href="${joinUrl}" style="display:block;text-align:center;background:linear-gradient(180deg,#f04a08,#d44000);color:#ffffff;font-weight:800;font-size:15px;text-decoration:none;padding:14px;border-radius:16px;">
                      Rejoindre l'espace de ${coachName} →
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:11px;color:#8a8f94;padding-top:22px;line-height:1.5;">
                    Si tu n'attendais pas cette invitation, ignore simplement cet email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCoachInviteEmail(to: string, coachName: string, inviteCode: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_placeholder") {
    console.warn("[invite/create] RESEND_API_KEY absente ou placeholder — email non envoyé, invitation créée en base uniquement.");
    return;
  }
  const resend = new Resend(apiKey);
  const joinUrl = `https://go.theperfclub.com/join/${inviteCode}`;
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "ThePerfClub <invitations@theperfclub.com>",
    to,
    subject: `${coachName} t'invite à rejoindre ThePerfClub`,
    html: buildInviteEmailHtml(coachName, joinUrl),
  });
}
