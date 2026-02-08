# Auction System - Admin Panel + API Testing

Next.js auction management system with Supabase backend and real-time bidding.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Access the admin panel:**
   ```
   http://localhost:3000
   ```
   (Automatically redirects to `/admin/auctions`)

4. **Test APIs with Postman:**
   - See [POSTMAN_API_TESTING.md](POSTMAN_API_TESTING.md) for complete guide

---

## Architecture Overview

### Admin Panel (UI)
- **URL:** `/admin/auctions`
- **Features:**
  - ✅ Create new auctions
  - ✅ View all auctions (draft, live, ended)
  - ✅ Manage individual auctions
  - ✅ Register bidders through UI
  - ✅ Place bids through UI
  - ✅ Real-time bid updates

### API Testing (Postman)
- **Register bidders:** `POST /api/register-bidder`
- **Place bids:** `POST /api/place-bid`
- **Get auction details:** `GET /api/auction/product/[product_id]`
- **List live auctions:** `GET /api/auctions`

**No end-user frontend** - Use Postman for API testing only.

---

## Project Structure

```
app/
  page.tsx                          # ← Redirects to admin
  admin/
    layout.tsx                      # Admin header
    auctions/
      page.tsx                      # List + create auctions
      [id]/page.tsx                 # Manage auction
  api/
    admin/auctions/                 # Admin APIs
    register-bidder/route.ts        # Register bidder
    place-bid/route.ts              # Place bid
    auction/product/[product_id]/route.ts   # Get auction
    auctions/route.ts               # List live auctions
lib/
  supabase/
    admin.ts                        # Admin client (service role)
    client.ts                       # Public client (anon key)
```

---

## Testing Workflow

1. **Create Auction** (Admin UI)
   - Go to `http://localhost:3000/admin/auctions`
   - Click "Create New Auction"
   - Fill form and set status to "live"

2. **Register Bidders** (Postman or Admin UI)
   - Option A: Use admin management page
   - Option B: `POST /api/register-bidder` via Postman

3. **Place Bids** (Postman or Admin UI)
   - Option A: Use admin management page
   - Option B: `POST /api/place-bid` via Postman

4. **Watch Real-time Updates** (Admin UI)
   - Open admin management page for an auction
   - Place bids via Postman
   - See bids appear instantly! 🔴 LIVE

---

## API Endpoints

### Register Bidder
```http
POST /api/register-bidder
Content-Type: application/json

{
  "auction_id": 1,
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com"
}
```

### Place Bid
```http
POST /api/place-bid
Content-Type: application/json

{
  "auction_id": 1,
  "bidder_id": 1,
  "amount": 150.00
}
```

**Full documentation:** [POSTMAN_API_TESTING.md](POSTMAN_API_TESTING.md)

---

## Tech Stack

- **Next.js 14.1.0** (App Router)
- **Supabase** (PostgreSQL + Realtime)
- **TypeScript**
- **React 18.2.0**

---

## Key Features

✅ **Server-side Validation** - All validation in API routes  
✅ **Real-time Updates** - WebSocket-based bid notifications  
✅ **UTC Time Handling** - Consistent timezone logic  
✅ **Admin Panel** - Full auction management  
✅ **API Testing Ready** - Postman-friendly endpoints  

---

## Documentation

- 📖 [POSTMAN_API_TESTING.md](POSTMAN_API_TESTING.md) - API testing guide
- 📖 [SHOPIFY_INTEGRATION.md](SHOPIFY_INTEGRATION.md) - Shopify setup
- 📖 [QUICKSTART.md](QUICKSTART.md) - Step-by-step tutorial

---

## Environment Variables

Already configured in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://cdngdscyhbwnukeducqo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```
