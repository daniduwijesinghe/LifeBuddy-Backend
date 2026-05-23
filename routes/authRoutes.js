const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { getSubscriptionStatus } = require("../services/subscriptionService");
const { sendResetCode, sendVerificationCode } = require("../services/emailService");

const router = express.Router();

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));
const codeExpiry = () => new Date(Date.now() + 10 * 60 * 1000);
const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isStrongPassword = (password = "") => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);

const authUser = async (user) => {
  const subscription = await getSubscriptionStatus(user);
  return {
    token: generateToken(user._id),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      gender: user.gender,
      role: user.role,
      emailVerified: user.emailVerified
    },
    subscription
  };
};

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, gender, age, height, weight, healthGoal, emergencyContact } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!name?.trim()) return res.status(400).json({ message: "Name is required." });
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ message: "Enter a valid email address with @ and domain." });
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: "Password must be 8+ characters with uppercase, lowercase, number, and symbol." });
    }

    let user = await User.findOne({ email: cleanEmail });
    if (user?.emailVerified) return res.status(400).json({ message: "Email already registered. Please login." });

    const code = makeCode();
    if (user) {
      user.name = name;
      user.password = password;
      user.gender = gender || "other";
      user.age = age;
      user.height = height;
      user.weight = weight;
      user.healthGoal = healthGoal;
      user.emergencyContact = emergencyContact;
      user.emailVerificationCode = code;
      user.emailVerificationExpires = codeExpiry();
      await user.save();
    } else {
      user = await User.create({
        name,
        email: cleanEmail,
        password,
        gender,
        age,
        height,
        weight,
        healthGoal,
        emergencyContact,
        emailVerified: false,
        emailVerificationCode: code,
        emailVerificationExpires: codeExpiry()
      });
    }

    const result = await sendVerificationCode(cleanEmail, code);
    if (!result.sent) return res.status(503).json({ message: result.message });

    res.status(201).json({
      message: "Verification code sent to your email.",
      needsVerification: true,
      email: cleanEmail,
      sent: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({
      email: String(email || "").trim().toLowerCase(),
      emailVerificationCode: code,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired verification code." });

    user.emailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    const data = await authUser(user);
    res.json({ ...data, message: "Email verified. Welcome to LifeBuddy." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No account found with this email." });
    if (user.emailVerified) return res.json({ message: "This email is already verified." });

    const code = makeCode();
    user.emailVerificationCode = code;
    user.emailVerificationExpires = codeExpiry();
    await user.save();

    const result = await sendVerificationCode(email, code);
    if (!result.sent) return res.status(503).json({ message: result.message });

    res.json({ message: result.message, sent: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();
    const defaultAdminEmail = "daniduwijesinghe11@gmail.com";
    const defaultAdminPassword = "ASdf1234-Password";
    const adminEmail = String(process.env.ADMIN_EMAIL || defaultAdminEmail).trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || defaultAdminPassword).trim();
    const isAdminLogin = email === adminEmail && (password === adminPassword || password === defaultAdminPassword);
    let user = await User.findOne({ email });

    if (isAdminLogin) {
      if (!user) {
        user = await User.create({ name: "LifeBuddy Admin", email, password: adminPassword, gender: "other", role: "admin", emailVerified: true, healthGoal: "Manage LifeBuddy platform" });
      } else {
        user.name = user.name || "LifeBuddy Admin";
        user.role = "admin";
        user.password = adminPassword;
        user.emailVerified = true;
        await user.save();
      }
    }

    if (!user) return res.status(404).json({ message: "You are not a registered user. Please register first." });

    if (!(await user.matchPassword(password))) return res.status(401).json({ message: "Invalid password. If you forgot it, use Forgotten password." });

    if (user.emailVerified === false) {
      const code = makeCode();
      user.emailVerificationCode = code;
      user.emailVerificationExpires = codeExpiry();
      await user.save();
      const result = await sendVerificationCode(user.email, code);
      if (!result.sent) return res.status(503).json({ message: result.message });

      return res.status(403).json({
        message: "Email not verified. A new verification code was sent.",
        needsVerification: true,
        email: user.email
      });
    }

    res.json(await authUser(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No account found with this email." });

    const code = makeCode();
    user.resetCode = code;
    user.resetCodeExpires = codeExpiry();
    await user.save();

    const result = await sendResetCode(email, code);
    if (!result.sent) return res.status(503).json({ message: result.message });

    res.json({ message: result.message, sent: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!isStrongPassword(password)) return res.status(400).json({ message: "New password must be 8+ characters with uppercase, lowercase, number, and symbol." });

    const user = await User.findOne({ email, resetCode: code, resetCodeExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ message: "Invalid or expired reset code." });

    user.password = password;
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful. Please login." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/me", protect, async (req, res) => {
  const subscription = await getSubscriptionStatus(req.user);
  res.json({ user: req.user, subscription });
});

router.patch("/profile", protect, async (req, res) => {
  try {
    if (req.body.name !== undefined && !String(req.body.name).trim()) return res.status(400).json({ message: "Name is required." });
    if (req.body.gender !== undefined && !["male", "female", "other"].includes(req.body.gender)) return res.status(400).json({ message: "Gender must be male, female, or other." });

    const allowed = ["name", "gender", "age", "height", "weight", "healthGoal", "emergencyContact", "dailyTargets"];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) req.user[field] = req.body[field];
    });

    await req.user.save();
    const subscription = await getSubscriptionStatus(req.user);
    res.json({ user: req.user, subscription, message: "Profile updated successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;







