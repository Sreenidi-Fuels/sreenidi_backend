const express = require("express");
const router = express.Router();
const {
  sendOtplessOtp,
  resendOtplessOtp,
  verifyOtplessOtp
} = require("../controllers/otpless.controller");

router.post("/sendotp", sendOtplessOtp);
router.post("/resendotp", resendOtplessOtp);
router.post("/verify", verifyOtplessOtp);

module.exports = router;
