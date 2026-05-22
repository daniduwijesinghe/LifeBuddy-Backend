const Payment = require("../models/Payment");

const getSubscriptionStatus = async (user) => {
  const now = new Date();
  const trialActive = user.freeTrialEnd && user.freeTrialEnd >= now;

  const latestPayment = await Payment.findOne({
    userEmail: user.email,
    paymentStatus: "Paid",
    expiryDate: { $gte: now }
  }).sort({ expiryDate: -1 });

  return {
    email: user.email,
    freeTrialStart: user.freeTrialStart,
    freeTrialEnd: user.freeTrialEnd,
    trialActive,
    premiumActive: Boolean(latestPayment),
    plan: latestPayment ? latestPayment.plan : trialActive ? "Free Trial" : "Free",
    needsPayment: !trialActive && !latestPayment,
    monthlyPrice: 700,
    latestPayment
  };
};

module.exports = { getSubscriptionStatus };
