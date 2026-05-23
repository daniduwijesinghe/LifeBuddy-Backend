const crypto = require("crypto");
const express = require("express");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { getSubscriptionStatus } = require("../services/subscriptionService");

const router = express.Router();

const gatewayBaseUrl = () => process.env.PAYHERE_SANDBOX === "true"
  ? "https://sandbox.payhere.lk/pay/checkout"
  : "https://www.payhere.lk/pay/checkout";

const backendBaseUrl = (req) => (process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

const planAmount = (plan) => plan === "Family" ? 1200 : 700;

const md5 = (value) => crypto.createHash("md5").update(String(value)).digest("hex").toUpperCase();

const paymentHash = ({ merchantId, orderId, amount, currency, merchantSecret }) => {
  const formattedAmount = Number(amount).toFixed(2);
  return md5(`${merchantId}${orderId}${formattedAmount}${currency}${md5(merchantSecret)}`);
};

const statusFromPayHere = (statusCode) => {
  if (String(statusCode) === "2") return "Paid";
  if (["-1", "-2", "-3"].includes(String(statusCode))) return "Failed";
  return "Pending";
};

router.get("/subscription", protect, async (req, res) => {
  const subscription = await getSubscriptionStatus(req.user);
  res.json(subscription);
});

router.post("/checkout", protect, async (req, res) => {
  try {
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    if (!merchantId || !merchantSecret) {
      return res.status(503).json({
        message: "Payment gateway is not configured yet. Add PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET in Render environment variables."
      });
    }

    const plan = req.body.plan === "Family" ? "Family" : "Premium";
    const amount = planAmount(plan);
    const currency = "LKR";
    const orderId = `LB-${Date.now()}-${String(req.user._id).slice(-6)}`;
    const baseUrl = backendBaseUrl(req);

    const payment = await Payment.create({
      userEmail: req.user.email,
      plan,
      amount,
      paymentStatus: "Pending",
      gateway: "PayHere",
      gatewayOrderId: orderId,
      saveCardPreference: Boolean(req.body.saveCardPreference)
    });

    const fields = {
      merchant_id: merchantId,
      return_url: `${baseUrl}/api/payments/payhere/return?order_id=${encodeURIComponent(orderId)}`,
      cancel_url: `${baseUrl}/api/payments/payhere/cancel?order_id=${encodeURIComponent(orderId)}`,
      notify_url: `${baseUrl}/api/payments/payhere/notify`,
      order_id: orderId,
      items: `LifeBuddy ${plan} Plan`,
      amount: amount.toFixed(2),
      currency,
      first_name: req.user.name || "LifeBuddy",
      last_name: "User",
      email: req.user.email,
      phone: req.user.emergencyContact || "0000000000",
      address: "LifeBuddy Mobile App",
      city: "Colombo",
      country: "Sri Lanka",
      custom_1: String(payment._id),
      custom_2: req.body.saveCardPreference ? "save-card-requested" : "one-time",
      hash: paymentHash({ merchantId, orderId, amount, currency, merchantSecret })
    };

    res.status(201).json({
      payment,
      checkoutUrl: `${baseUrl}/api/payments/payhere/checkout/${orderId}`,
      gateway: "PayHere",
      acceptedMethods: ["VISA", "MASTER", "AMEX", "GENIE", "FRIMI", "EZCASH", "MCASH"],
      fields
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/payhere/checkout/:orderId", async (req, res) => {
  try {
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const payment = await Payment.findOne({ gatewayOrderId: req.params.orderId });
    if (!payment || !merchantId || !merchantSecret) return res.status(404).send("Payment session not found or gateway not configured.");

    const amount = Number(payment.amount).toFixed(2);
    const currency = "LKR";
    const baseUrl = backendBaseUrl(req);
    const fields = {
      merchant_id: merchantId,
      return_url: `${baseUrl}/api/payments/payhere/return?order_id=${encodeURIComponent(payment.gatewayOrderId)}`,
      cancel_url: `${baseUrl}/api/payments/payhere/cancel?order_id=${encodeURIComponent(payment.gatewayOrderId)}`,
      notify_url: `${baseUrl}/api/payments/payhere/notify`,
      order_id: payment.gatewayOrderId,
      items: `LifeBuddy ${payment.plan} Plan`,
      amount,
      currency,
      first_name: "LifeBuddy",
      last_name: "User",
      email: payment.userEmail,
      phone: "0000000000",
      address: "LifeBuddy Mobile App",
      city: "Colombo",
      country: "Sri Lanka",
      custom_1: String(payment._id),
      custom_2: payment.saveCardPreference ? "save-card-requested" : "one-time",
      hash: paymentHash({ merchantId, orderId: payment.gatewayOrderId, amount, currency, merchantSecret })
    };

    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, "&quot;")}" />`)
      .join("\n");

    res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /><title>LifeBuddy Payment</title></head><body style="font-family:Arial;padding:24px;background:#ecfdf5;color:#0f172a"><h2>Opening PayHere...</h2><p>Please wait while LifeBuddy redirects you to the secure payment gateway.</p><form id="payhere" method="post" action="${gatewayBaseUrl()}">${inputs}<button type="submit">Continue to PayHere</button></form><script>document.getElementById('payhere').submit();</script></body></html>`);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.post("/payhere/notify", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const { order_id, payment_id, status_code, md5sig, method, card_no, card_expiry } = req.body;
    const payment = await Payment.findOne({ gatewayOrderId: order_id });
    if (!payment) return res.status(404).send("Payment not found");

    const localSig = md5(`${process.env.PAYHERE_MERCHANT_ID}${order_id}${payment.amount.toFixed(2)}LKR${status_code}${md5(merchantSecret)}`);
    if (merchantSecret && md5sig && localSig !== String(md5sig).toUpperCase()) {
      return res.status(400).send("Invalid payment signature");
    }

    payment.paymentStatus = statusFromPayHere(status_code);
    payment.paymentDate = new Date();
    payment.gatewayPaymentId = payment_id;
    payment.gatewayMethod = method;
    payment.maskedCard = card_no;
    payment.cardExpiry = card_expiry;
    payment.cardBrand = method;
    if (payment.paymentStatus === "Paid") {
      payment.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    await payment.save();

    if (payment.paymentStatus === "Paid") {
      const User = require("../models/User");
      const user = await User.findOne({ email: payment.userEmail });
      if (user) {
        await Notification.create({
          user: user._id,
          title: "Payment successful",
          message: `${payment.plan} plan activated until ${payment.expiryDate.toDateString()}.`,
          type: "report"
        });
      }
    }

    res.send("OK");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get("/payhere/return", (req, res) => {
  res.send("LifeBuddy payment submitted. You can return to the app and refresh payment history.");
});

router.get("/payhere/cancel", async (req, res) => {
  if (req.query.order_id) {
    await Payment.findOneAndUpdate({ gatewayOrderId: req.query.order_id }, { paymentStatus: "Failed" });
  }
  res.send("LifeBuddy payment was cancelled. You can return to the app.");
});

router.post("/pay", protect, async (req, res) => {
  try {
    if (process.env.ALLOW_DEMO_PAYMENTS !== "true") {
      return res.status(403).json({ message: "Demo payments are disabled. Use secure gateway checkout." });
    }

    const { plan = "Premium" } = req.body;
    const payment = await Payment.create({
      userEmail: req.user.email,
      plan,
      amount: planAmount(plan),
      paymentStatus: "Paid",
      paymentDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      gateway: "Demo"
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
