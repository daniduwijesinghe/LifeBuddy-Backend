const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { getSubscriptionStatus } = require("../services/subscriptionService");
const { sendResetCode } = require("../services/emailService");

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isStrongPassword = (password = "") => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
};

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, gender, age, height, weight, healthGoal, emergencyContact } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address with @ and domain." });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must be 8+ characters with uppercase, lowercase, number, and symbol."
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = await User.create({
      name,
      email,
      password,
      gender,
      age,
      height,
      weight,
      healthGoal,
      emergencyContact
    });

    const subscription = await getSubscriptionStatus(user);

    res.status(201).json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        role: user.role
      },
      subscription
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || "daniduwijesinghe11@gmail.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "ASdf1234-Password";
    let user = await User.findOne({ email });

    if (email === adminEmail && password === adminPassword) {
      if (!user) {
        user = await User.create({
          name: "LifeBuddy Admin",
          email,
          password: adminPassword,
          gender: "other",
          role: "admin",
          healthGoal: "Manage LifeBuddy platform"
        });
      } else {
        user.name = user.name || "LifeBuddy Admin";
        user.role = "admin";
        user.password = adminPassword;
        await user.save();
      }
    }

    if (!user && email === adminEmail) {
      user = await User.create({
        name: "LifeBuddy Admin",
        email,
        password: adminPassword,
        gender: "other",
        role: "admin",
        healthGoal: "Manage LifeBuddy platform"
      });
    }

    if (
      user &&
      user.email === adminEmail &&
      user.role !== "admin"
    ) {
      user.role = "admin";
      await user.save();
    }

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const subscription = await getSubscriptionStatus(user);

    res.json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        role: user.role
      },
      subscription
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const result = await sendResetCode(email, code);
    res.json({
      message: result.message,
      sent: result.sent,
      devCode: result.sent ? undefined : code
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, password } = req.body;

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "New password must be 8+ characters with uppercase, lowercase, number, and symbol."
      });
    }

    const user = await User.findOne({
      email,
      resetCode: code,
      resetCodeExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code." });
    }

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
