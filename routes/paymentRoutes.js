const express = require("express");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { getSubscriptionStatus } = require("../services/subscriptionService");

const router = express.Router();

router.get("/subscription", protect, async (req, res) => {
  const subscription = await getSubscriptionStatus(req.user);
  res.json(subscription);
});

router.post("/pay", protect, async (req, res) => {
  try {
    const { plan = "Premium" } = req.body;
    const payment = await Payment.create({
      userEmail: req.user.email,
      plan,
      amount: plan === "Family" ? 1200 : 700,
      paymentStatus: "Paid",
      paymentDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    const subscription = await getSubscriptionStatus(req.user);
    await Notification.create({
      user: req.user._id,
      title: "Payment successful",
      message: `${plan} plan activated until ${payment.expiryDate.toDateString()}.`,
      type: "report"
    });
    res.status(201).json({ payment, subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/admin-record", protect, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/history", protect, async (req, res) => {
  const payments = await Payment.find({ userEmail: req.user.email }).sort({ paymentDate: -1 });
  res.json(payments);
});

module.exports = router;
