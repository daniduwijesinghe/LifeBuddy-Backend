const nodemailer = require("nodemailer");

const sendResetCode = async (email, code) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`LifeBuddy reset code for ${email}: ${code}`);
    return { sent: false, message: "SMTP not configured. Code printed in backend terminal." };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "LifeBuddy <no-reply@lifebuddy.app>",
    to: email,
    subject: "LifeBuddy password reset code",
    text: `Your LifeBuddy one-time password reset code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your LifeBuddy one-time password reset code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
  });

  return { sent: true, message: "Reset code sent to email." };
};

module.exports = { sendResetCode };
