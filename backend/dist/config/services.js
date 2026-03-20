"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resend = exports.twilioClient = exports.razorpay = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const twilio_1 = __importDefault(require("twilio"));
const resend_1 = require("resend");
const env_1 = require("./env");
// Razorpay client
exports.razorpay = env_1.env.razorpayKeyId && env_1.env.razorpayKeySecret
    ? new razorpay_1.default({ key_id: env_1.env.razorpayKeyId, key_secret: env_1.env.razorpayKeySecret })
    : null;
// Twilio client (optional)
exports.twilioClient = env_1.env.twilioAccountSid && env_1.env.twilioAuthToken
    ? (0, twilio_1.default)(env_1.env.twilioAccountSid, env_1.env.twilioAuthToken)
    : null;
// Resend client (optional)
exports.resend = env_1.env.resendApiKey ? new resend_1.Resend(env_1.env.resendApiKey) : null;
