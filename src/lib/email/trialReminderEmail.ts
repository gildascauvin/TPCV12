import { Resend } from "resend";

/* Rappel avant la fin de l'essai (2026-11-15, onboarding vécu : « On te prévient avant la fin »).
   Le webhook Stripe `customer.subscription.trial_will_end` arrive 3 jours avant `trial_end` : rappel tout de
   suite (3 jours), ou programmé à J-2 (choix `trial_reminder_days` = 2 dans l'onboarding). Abonnements web seulement : les achats App Store / Google Play préviennent eux-mêmes. */
function buildHtml(first: string | null, endLabel: string, priceLabel: string, daysLeft: number) {
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
                    ${first ? `${first}, il` : "Il"} te reste ${daysLeft} jours d'essai
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:14px;color:#62686e;line-height:1.6;padding-bottom:26px;">
                    Premier prélèvement le ${endLabel} : ${priceLabel}.<br />
                    Pour continuer, tu n'as rien à faire. Pour arrêter, annule avant cette date depuis ton profil, en 1 clic.
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href="https://go.theperfclub.com/today" style="display:block;text-align:center;background:linear-gradient(180deg,#f04a08,#d44000);color:#ffffff;font-weight:800;font-size:15px;text-decoration:none;padding:14px;border-radius:16px;">
                      Ouvrir ThePerfClub
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:11px;color:#8a8f94;padding-top:22px;line-height:1.5;">
                    Tu reçois cet email parce que tu as commencé un essai de 14 jours sur ThePerfClub.
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

/* `daysLeft` : rappel choisi dans l'onboarding (2 ou 3 jours avant) ; `sendAt` : envoi programmé chez Resend. */
export async function sendTrialReminderEmail(to: string, opts: { first: string | null; trialEnd: Date; amountCents: number | null; interval: string | null; daysLeft?: number; sendAt?: Date }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_placeholder") {
    console.warn("[trial-reminder] RESEND_API_KEY absente ou placeholder : email non envoyé.");
    return;
  }
  const endLabel = opts.trialEnd.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const amount = opts.amountCents != null ? `${(opts.amountCents / 100).toFixed(2).replace(".", ",").replace(",00", "")} €` : null;
  const per = opts.interval === "year" ? " par an" : opts.interval === "month" ? " par mois" : "";
  const priceLabel = amount ? `${amount}${per}` : "le montant de ta formule";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "ThePerfClub <invitations@theperfclub.com>",
    to,
    subject: `Ton essai se termine le ${endLabel}`,
    html: buildHtml(opts.first, endLabel, priceLabel, opts.daysLeft ?? 3),
    ...(opts.sendAt ? { scheduledAt: opts.sendAt.toISOString() } : {}),
  });
  if (error) console.error("[trial-reminder] resend", error);
}
