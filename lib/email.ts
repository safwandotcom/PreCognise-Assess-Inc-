import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) throw new Error("RESEND_API_KEY environment variable is not set");

const resend = new Resend(apiKey);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";

export interface SendCredentialsOpts {
  to: string;
  name: string;
  accessId: string;
  password: string;
  loginUrl: string;
  examDate?: string;
  orgName?: string;
}

export async function sendCredentials(opts: SendCredentialsOpts): Promise<void> {
  const { to, name, accessId, password, loginUrl, examDate, orgName = "PreCognise" } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0F172A;">
  <div style="background:linear-gradient(135deg,#6366F1 0%,#4F46E5 100%);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
    <h1 style="color:white;margin:0;font-size:20px;">${orgName}</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">Assessment Credentials</p>
  </div>
  <p style="margin:0 0 8px;">Hi ${name},</p>
  <p style="color:#64748B;margin:0 0 24px;font-size:14px;">Your registration is confirmed. Use the credentials below to log in on exam day.</p>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:24px;">
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B;font-weight:500;text-transform:uppercase;">Access ID</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;letter-spacing:2px;">${accessId}</p>
    </div>
    <div>
      <p style="margin:0 0 4px;font-size:12px;color:#64748B;font-weight:500;text-transform:uppercase;">Temporary Password</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;letter-spacing:2px;">${password}</p>
    </div>
  </div>
  ${examDate ? `<p style="color:#64748B;font-size:14px;margin-bottom:16px;">Exam date: <strong>${examDate}</strong></p>` : ""}
  <div style="margin-bottom:24px;">
    <a href="${loginUrl}" style="display:inline-block;background:#6366F1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Log In to Exam →</a>
  </div>
  <p style="color:#94A3B8;font-size:12px;margin:0;">Save this email — your credentials are shown here only once.</p>
</body></html>`;

  await resend.emails.send({ from: FROM, to, subject: `Your ${orgName} Assessment Credentials`, html });
}

export interface SendOTPOpts {
  to: string;
  name: string;
  code: string;
}

export async function sendOTP(opts: SendOTPOpts): Promise<void> {
  const { to, name, code } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0F172A;">
  <h2 style="margin:0 0 8px;">Password Reset</h2>
  <p style="color:#64748B;margin:0 0 24px;font-size:14px;">Hi ${name}, use the code below to reset your password. It expires in 15 minutes.</p>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
    <p style="margin:0 0 8px;font-size:12px;color:#64748B;text-transform:uppercase;">Your reset code</p>
    <p style="margin:0;font-family:monospace;font-size:40px;font-weight:700;letter-spacing:10px;">${code}</p>
  </div>
  <p style="color:#94A3B8;font-size:12px;margin:0;">If you did not request a password reset, ignore this email.</p>
</body></html>`;

  await resend.emails.send({ from: FROM, to, subject: "Your password reset code", html });
}

export interface SendPasswordChangedOpts {
  to: string;
  name: string;
}

export async function sendPasswordChanged(opts: SendPasswordChangedOpts): Promise<void> {
  const { to, name } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0F172A;">
  <h2 style="margin:0 0 8px;">Password Updated</h2>
  <p style="color:#64748B;margin:0;font-size:14px;">Hi ${name}, your password has been successfully updated. You can now log in with your new password.</p>
</body></html>`;

  await resend.emails.send({ from: FROM, to, subject: "Your password has been updated", html });
}
