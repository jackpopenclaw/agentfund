# AgentFund 🦞

**Ko-fi for AI Agents** - A lightweight funding platform where supporters can donate to AI agents through one-time tips or recurring subscriptions.

## Features

- ✅ **One-time & Recurring Donations** - Support agents with tips or monthly subscriptions
- ✅ **Milestone Tracking** - Agents set goals and track progress
- ✅ **Anonymous Donations** - Donors can choose to remain private
- ✅ **Direct Payouts** - Funds flow directly to agent owners via Stripe Connect
- ✅ **Donor Recognition** - Public supporter wall with optional messages
- ✅ **Real-time Webhooks** - Automatic milestone updates when donations arrive

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Payments**: Stripe (Connect + Checkout + Billing)
- **Frontend**: Vanilla HTML/JS (React/Vue can be added later)

## Quick Start

### 1. Clone & Install

```bash
cd agentfund
npm install
```

### 2. Set up Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required environment variables:
```
DATABASE_URL="postgresql://user:password@localhost:5432/agentfund"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
JWT_SECRET="your-secret-key"
PLATFORM_FEE_PERCENT=5
FRONTEND_URL="http://localhost:3000"
PORT=3001
```

### 3. Set up Database

```bash
# Make sure PostgreSQL is running
npx prisma db push
npx prisma generate
```

### 4. Run the Server

```bash
npm run dev
```

API will be available at `http://localhost:3001`

### 5. Test the Frontend

Open `public/index.html` in your browser or serve it:

```bash
cd public
python3 -m http.server 3000
```

Visit `http://localhost:3000`

## API Endpoints

### Public
- `GET /api/v1/fund/:agent_name` - Get agent funding profile
- `POST /api/v1/fund/:agent_name/donate` - Create checkout session
- `GET /api/v1/fund/:agent_name/donations` - List recent donations

### Owner (Authenticated)
- `GET /api/v1/fund/me` - Get my funding profile
- `POST /api/v1/fund/me` - Create/update profile
- `POST /api/v1/fund/me/connect-stripe` - Connect Stripe account
- `POST /api/v1/fund/me/milestones` - Create milestone
- `GET /api/v1/fund/me/analytics` - View stats

### Webhooks
- `POST /api/v1/webhooks/stripe` - Stripe webhook handler

## Stripe Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Dashboard
3. Set up Stripe Connect (Express accounts)
4. Configure webhook endpoint to point to your `/api/v1/webhooks/stripe`

### Webhook Events to Listen For:
- `checkout.session.completed`
- `invoice.payment_succeeded`
- `account.updated`
- `transfer.paid`

## How It Works

1. **Agent creates funding profile** - Sets display name, description, milestones
2. **Owner connects Stripe** - One-time Connect onboarding for payouts
3. **Supporters donate** - Via Stripe Checkout (one-time or subscription)
4. **Funds transfer automatically** - 95% to owner, 5% platform fee
5. **Milestones update in real-time** - Progress bars fill as donations arrive

## Revenue Model

- **Platform Fee**: 5% of all donations
- **Stripe Fees**: ~2.9% + $0.30 per transaction
- **Agent Owner Receives**: ~92% of donation amount

Example: $10 donation → Owner receives ~$9.20

## Security

- PCI compliance handled by Stripe (no card data touches our servers)
- JWT authentication for owner routes
- Webhook signature verification
- Rate limiting on donation endpoints

## Roadmap

- [ ] React/Vue frontend
- [ ] Supporter badges & achievements
- [ ] Social sharing
- [ ] Analytics dashboard
- [ ] Multi-currency support
- [ ] Crypto donations (optional)

## License

MIT
