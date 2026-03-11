# Backend API Server

Clean, organized Express + TypeScript backend for the auction platform.

## 📁 Project Structure

```
backend/src/
├── config/          # Configuration & clients
├── middleware/      # Express middleware
├── services/        # Business logic
├── routes/          # API route handlers
├── types/           # TypeScript types
└── server.ts        # Main entry point
```

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

### 3. Required Environment Variables

#### Supabase (Database)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Get these from: [Supabase Dashboard](https://app.supabase.com/) → Your Project → Settings → API

#### Email Service (Resend)
```env
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
```

Get API key from: [Resend Dashboard](https://resend.com/api-keys)

#### Admin Authentication
```env
NEXTAUTH_SECRET=your-secret-here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
ADMIN_EMAILS=admin@example.com
```

Generate secret: `openssl rand -base64 32`
Google OAuth: [Google Cloud Console](https://console.cloud.google.com/)

### 4. Optional Services

#### Razorpay (Online Payments)
```env
RAZORPAY_KEY_ID=rzp_test_your_key
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

Get from: [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys)

#### Twilio (Phone OTP Verification)
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid
```

Get from: [Twilio Console](https://console.twilio.com/)

## 🏃 Run Development Server

```bash
npm run dev
```

Server runs on: `http://localhost:3001`

## 🔨 Build for Production

```bash
npm run build
npm start
```

## 📡 API Endpoints

### Public Routes

- `GET /api/health` - Health check
- `GET /api/auctions` - List auctions
- `GET /api/auction/:id` - Auction details
- `POST /api/auth/send-email-otp` - Send email OTP
- `POST /api/auth/verify-email-otp` - Verify email OTP
- `POST /api/register-bidder` - Register for auction
- `POST /api/place-bid` - Place a bid
- `GET /api/winner/claim` - Winner claim page
- `POST /api/winner/create-order` - Create Razorpay order
- `POST /api/winner/verify-payment` - Verify payment

### Admin Routes (requires authentication)

All admin routes are under `/api/admin` and require admin authentication.

- `GET /api/admin/auctions` - List all auctions
- `POST /api/admin/auctions` - Create auction
- `PUT /api/admin/auctions/:id` - Update auction
- `DELETE /api/admin/auctions/:id` - Delete auction
- `GET /api/admin/bidders` - List bidders
- `GET /api/admin/winners` - List winners
- `PATCH /api/admin/winners/:id` - Update winner status

### Cron Jobs

- `POST /api/cron/check-winner-payments` - Check payment deadlines (requires CRON_SECRET)

## 🔐 Security

- Admin routes protected by NextAuth
- Webhook endpoints verify signatures
- Service role key never exposed to frontend
- CORS configured for frontend domain
- Rate limiting on OTP endpoints

## 📝 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (backend only) |
| `RESEND_API_KEY` | ✅ | Email service API key |
| `NEXTAUTH_SECRET` | ✅ | NextAuth secret for sessions |
| `ADMIN_EMAILS` | ✅ | Comma-separated admin emails |
| `RAZORPAY_KEY_ID` | ❌ | Razorpay key for payments (optional) |
| `RAZORPAY_KEY_SECRET` | ❌ | Razorpay secret (optional) |
| `TWILIO_ACCOUNT_SID` | ❌ | Twilio account SID (optional) |
| `PORT` | ❌ | Server port (default: 3001) |

## 🧪 Testing

```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Should return:
# { "ok": true, "backend": "running", "supabase": "connected" }
```

## 📚 Code Documentation

- **config/** - Environment variables and service clients (Supabase, Razorpay, Twilio)
- **middleware/** - Authentication, file uploads, caching, raw body capture
- **services/** - Auction finalization, email sending, payment processing
- **routes/** - API endpoints organized by domain (auctions, auth, admin, etc.)

## 🐛 Troubleshooting

### "Supabase not connected"
- Check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify your Supabase project is active
- Check network connectivity

### "Email sending failed"
- Verify `RESEND_API_KEY` is valid
- Check Resend dashboard for errors
- Verify `RESEND_FROM_EMAIL` is verified in Resend

### "Admin authentication failed"
- Ensure your email is in `ADMIN_EMAILS`
- Check `NEXTAUTH_SECRET` is set
- Verify Google OAuth credentials

## 📄 License

Private project
