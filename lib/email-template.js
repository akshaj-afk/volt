// Sign-in code email for Kepler: subject, HTML and plain-text versions.
// Table-based with inline styles, so it renders the same in Gmail, Outlook and Apple Mail.
// Usage: const { subject, html, text } = buildCodeEmail({ code, mode: 'signin' | 'signup', name, minutes: 10 });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildCodeEmail({ code, mode = 'signin', name = '', minutes = 10 } = {}) {
  const signup = mode === 'signup';
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const greet = first ? `Hi ${esc(first)},` : 'Hi there,';
  const lead = signup
    ? 'Welcome to Kepler. Enter this code to confirm your email and finish creating your account.'
    : 'Enter this code to sign in to Kepler.';
  const subject = signup ? `Your Kepler code: ${code}` : `Your Kepler sign-in code: ${code}`;
  const digits = String(code).split('').map(d => `<span style="display:inline-block;width:40px;height:52px;line-height:52px;margin:0 4px;border-radius:10px;background:#0B101D;border:1px solid rgba(129,140,248,.35);font-family:'JetBrains Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:600;color:#c7d2fe;text-align:center;">${esc(d)}</span>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#070A14;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Kepler code is ${esc(code)}. It expires in ${minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070A14;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:linear-gradient(180deg,#101827 0%,#0B101D 100%);border:1px solid rgba(255,255,255,.08);border-radius:18px;overflow:hidden;">
      <tr><td style="padding:32px 36px 8px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:10px;">
            <span style="display:inline-block;width:26px;height:26px;border-radius:50%;border:2px solid #6366f1;position:relative;"><span style="display:block;width:7px;height:7px;margin:7px 0 0 7px;border-radius:50%;background:#818cf8;"></span></span>
          </td>
          <td style="vertical-align:middle;font-family:'Source Serif 4',Georgia,'Times New Roman',serif;font-size:20px;font-weight:500;color:#f1f5f9;letter-spacing:-.01em;">Kepler</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 36px 0 36px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:#f8fafc;letter-spacing:-.02em;">${signup ? 'Confirm your email' : 'Your sign-in code'}</h1>
        <p style="margin:0 0 6px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">${greet}</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">${esc(lead)}</p>
      </td></tr>
      <tr><td align="center" style="padding:0 36px;">
        <div style="padding:22px 12px;border-radius:14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.22);">${digits}</div>
      </td></tr>
      <tr><td style="padding:22px 36px 0 36px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <p style="margin:0 0 6px 0;font-size:13.5px;line-height:1.6;color:#94a3b8;">This code expires in <strong style="color:#cbd5e1;">${minutes} minutes</strong>. Do not share it with anyone, including Kepler staff.</p>
        <p style="margin:0;font-size:13.5px;line-height:1.6;color:#94a3b8;">If you did not ask for this, you can safely ignore this email.</p>
      </td></tr>
      <tr><td style="padding:28px 36px 30px 36px;">
        <div style="height:1px;background:rgba(255,255,255,.07);margin-bottom:18px;"></div>
        <p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">Kepler · Sent to ${esc(name ? name : 'you')} by an automated system. Please do not reply to this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    signup ? 'Confirm your email' : 'Your sign-in code',
    '',
    greet,
    lead,
    '',
    `Your code: ${code}`,
    `It expires in ${minutes} minutes. Do not share it with anyone, including Kepler staff.`,
    '',
    'If you did not ask for this, you can safely ignore this email.',
    '',
    '— Kepler'
  ].join('\n');

  return { subject, html, text };
}
