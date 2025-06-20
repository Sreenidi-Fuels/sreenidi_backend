const User = require("../models/User.model");
const { sendOTP, resendOTP, verifyOTP } = require("otpless-node-js-auth-sdk");
const jwt = require("jsonwebtoken");
require("dotenv").config();

exports.sendOtplessOtp = async (req, res) => {
  const phoneNumber = req.body.phoneNumber;
//   console.log(phoneNumber)
  if (!phoneNumber) return res.status(400).json({ error: "phoneNumber is required" });

  try {
    let user = await User.findOne({ phoneNumber });
    if (!user) return res.status(404).json({ error: "User with this phone number does not exist" });

    const response = await sendOTP(
      phoneNumber,
      null,
      process.env.OTPLESS_CHANNEL,
      null,
      null,
      process.env.OTPLESS_EXPIRE_OTP_TIME,
      process.env.OTPLESS_OTP_LENGTH,
      process.env.OTPLESS_CLIENT_ID,
      process.env.OTPLESS_CLIENT_SECRET
    );

    user.otpOrderId = response.orderId;
    await user.save();

    res.status(200).json({ message: "OTP sent successfully", orderId: response.orderId });
  } catch (error) {
    console.log("Error sending OTP", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.resendOtplessOtp = async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  try {
    const response = await resendOTP(
      orderId,
      process.env.OTPLESS_CLIENT_ID,
      process.env.OTPLESS_CLIENT_SECRET
    );
    res.status(200).json({ message: "OTP resent successfully" });
  } catch (error) {
    console.log("Error resending OTP", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.verifyOtplessOtp = async (req, res) => {
  const { phoneNumber, orderId, otp } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "phoneNumber is required" });
  if (!otp) return res.status(400).json({ error: "OTP is required" });

  try {
    let user = await User.findOne({ phoneNumber });
    if (!user) return res.status(404).json({ error: "User with this phone number does not exist" });

    const response = await verifyOTP(
      null,
      phoneNumber,
      orderId,
      otp,
      process.env.OTPLESS_CLIENT_ID,
      process.env.OTPLESS_CLIENT_SECRET
    );

    if (response.isOTPVerified) {
      user.isVerified = true;
      user.otpOrderId = undefined;
      await user.save();

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
      return res.status(200).json({ message: "User verified successfully", token });
    } else {
      return res.status(400).json({
        error: "Wrong OTP",
        isOTPVerified: response.isOTPVerified,
        reason: response.reason,
      });
    }
  } catch (error) {
    console.log("Error verifying OTP", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
