const nodemailer = require("nodemailer");

const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendCodeEmail = async ({ email, code, subject, purpose }) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`LifeBuddy ${purpose} code for ${email}: ${code}`);
    return { sent: false, message: "Email service is not configured yet. Please contact LifeBuddy support or try again later." };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "LifeBuddy <no-reply@lifebuddy.app>",
    to: email,
    subject,
    text: `Your LifeBuddy ${purpose} code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your LifeBuddy ${purpose} code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
  });

  return { sent: true, message: `${subject} sent to email.` };
};

const sendResetCode = (email, code) => sendCodeEmail({
  email,
  code,
  subject: "LifeBuddy password reset code",
  purpose: "password reset"
});

const sendVerificationCode = (email, code) => sendCodeEmail({
  email,
  code,
  subject: "LifeBuddy email verification code",
  purpose: "email verification"
});

module.exports = { sendResetCode, sendVerificationCode };

