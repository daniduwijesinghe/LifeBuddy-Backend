const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Payment = require("../models/Payment");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, token missing" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

const requireActiveSubscription = async (req, res, next) => {
  try {
    if (req.user?.role === "admin") return next();

    const now = new Date();
    const trialActive = req.user.freeTrialEnd && req.user.freeTrialEnd >= now;
    if (trialActive) return next();

    const paidPayment = await Payment.findOne({
      userEmail: req.user.email,
      paymentStatus: "Paid",
      expiryDate: { $gte: now }
    });

    if (paidPayment) return next();

    return res.status(402).json({
      message: "Your free one-month trial is over. Please upload a bank payment slip. Features unlock after admin approval.",
      needsPayment: true
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }

  return res.status(403).json({ message: "Admin access required" });
};

module.exports = { protect, adminOnly, requireActiveSubscription };
