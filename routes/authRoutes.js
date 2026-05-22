const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { getSubscriptionStatus } = require("../services/subscriptionService");

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, age, height, weight, healthGoal, emergencyContact } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = await User.create({
      name,
      email,
      password,
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
        role: user.role
      },
      subscription
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/me", protect, async (req, res) => {
  const subscription = await getSubscriptionStatus(req.user);
  res.json({ user: req.user, subscription });
});

module.exports = router;
