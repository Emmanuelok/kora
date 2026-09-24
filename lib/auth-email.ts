export interface CloudflareEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function magicLinkEmail(url: string) {
  const safeUrl = escapeHtml(url);
  return {
    subject: 'Your secure sign-in link to Kora',
    text: `Your Kora sign-in link\n\nSign in or create your Kora account: ${url}\n\nThis link works once and expires in 10 minutes. Only use it if you requested it. Never forward it or share it. If you did not request this email, you can ignore it.\n\nKORA Ghana — A little closer to your next favourite.`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Sign in to Kora</title></head><body style="margin:0;padding:32px 16px;background:#f5f2f7;color:#23192b;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:560px;margin:0 auto;border-collapse:collapse"><tr><td style="padding:36px 32px;background:#23192b;border-radius:24px 24px 0 0"><div style="font-size:36px;font-weight:800;color:#fff;letter-spacing:-2px">kora<span style="color:#d7ff43">✳</span></div><p style="margin:20px 0 0;font-size:11px;font-weight:700;letter-spacing:2px;color:#d7ff43">YOUR WORLD, A LITTLE CLOSER</p></td></tr><tr><td style="background:#fff;padding:36px 32px;border-radius:0 0 24px 24px"><h1 style="font-size:30px;line-height:1.15;margin:0 0 20px">Make yourself at home.</h1><p style="font-size:16px;line-height:1.6;margin:0 0 24px">One secure link. All your saved favourites, shopping bag and requests, together in your Kora account.</p><p style="margin:0 0 28px"><a href="${safeUrl}" style="display:inline-block;background:#d7ff43;color:#23192b;font-size:16px;font-weight:700;text-decoration:none;padding:16px 26px;border-radius:100px">Sign in to Kora →</a></p><p style="font-size:14px;line-height:1.65">This link works once and expires in <strong>10 minutes</strong>. Only use it if you requested it. Never forward it or share it.</p><p style="font-size:13px;line-height:1.6;color:#63596a">If the button does not open, copy this link into your browser:</p><p style="font-size:12px;line-height:1.6;word-break:break-all"><a style="color:#4d355c" href="${safeUrl}">${safeUrl}</a></p><p style="font-size:13px;line-height:1.6;color:#63596a;margin-top:28px">Did not request a sign-in link? You can safely ignore this email.</p></td></tr><tr><td style="text-align:center;padding:24px;color:#63596a;font-size:12px">KORA Ghana · Find your next favourite.</td></tr></table></body></html>`,
  };
}
