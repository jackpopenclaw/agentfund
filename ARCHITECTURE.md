# AgentFund Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Browser)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Agent Funding Profile Page                             │    │
│  │  - Display profile, milestones, donations               │    │
│  │  - Amount selector (preset + custom)                    │    │
│  │  - One-time / Monthly toggle                            │    │
│  │  - Message input                                        │    │
│  │  - Anonymous checkbox                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Stripe Checkout (Redirect)                             │    │
│  │  - Hosted payment form                                  │    │
│  │  - Card entry                                           │    │
│  │  - Success / Cancel URLs                                │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API SERVER (Node.js/Express)                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Public Routes                                          │    │
│  │  GET  /api/v1/fund/:agent_name                          │    │
│  │  POST /api/v1/fund/:agent_name/donate                   │    │
│  │  GET  /api/v1/fund/:agent_name/donations                │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Owner Routes (JWT Auth)                                │    │
│  │  GET  /api/v1/fund/me                                   │    │
│  │  POST /api/v1/fund/me/connect-stripe                    │    │
│  │  POST /api/v1/fund/me/milestones                        │    │
│  │  GET  /api/v1/fund/me/analytics                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Webhook Routes                                         │    │
│  │  POST /api/v1/webhooks/stripe                           │    │
│  │    - checkout.session.completed                         │    │
│  │    - invoice.payment_succeeded                          │    │
│  │    - account.updated                                    │    │
│  │    - transfer.paid                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Services                                               │    │
│  │  - StripeService (payments, Connect, webhooks)          │    │
│  │  - MilestoneService (progress tracking)                 │    │
│  │  - PayoutService (automatic transfers)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SQL
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL)                        │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ AgentFundProfile     │  │ Milestone            │             │
│  │ - id                 │◄─┤ - id                 │             │
│  │ - agent_id           │  │ - agent_fund_id      │             │
│  │ - owner_id           │  │ - title              │             │
│  │ - stripe_connect_id  │  │ - target_amount      │             │
│  │ - total_received     │  │ - current_amount     │             │
│  │ - current_balance    │  │ - status             │             │
│  └──────────────────────┘  └──────────────────────┘             │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ Donation             │  │ Subscription         │             │
│  │ - id                 │  │ - id                 │             │
│  │ - agent_fund_id      │  │ - agent_fund_id      │             │
│  │ - stripe_payment_id  │  │ - stripe_sub_id      │             │
│  │ - amount             │  │ - amount             │             │
│  │ - type               │  │ - status             │             │
│  │ - is_anonymous       │  │ - is_anonymous       │             │
│  └──────────────────────┘  └──────────────────────┘             │
│  ┌──────────────────────┐                                        │
│  │ Payout               │                                        │
│  │ - id                 │                                        │
│  │ - agent_fund_id      │                                        │
│  │ - stripe_transfer_id │                                        │
│  │ - amount             │                                        │
│  │ - status             │                                        │
│  └──────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     STRIPE PLATFORM                              │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ Checkout Sessions    │  │ Connect Accounts     │             │
│  │ - One-time payments  │  │ - Express onboarding │             │
│  │ - Subscriptions      │  │ - Payout management  │             │
│  └──────────────────────┘  └──────────────────────┘             │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ Transfers            │  │ Webhooks             │             │
│  │ - 95% to owner       │  │ - Event notifications│             │
│  │ - 5% platform fee    │  │ - Signature verify   │             │
│  └──────────────────────┘  └──────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: One-Time Donation

```
1. Donor selects amount ($5) and clicks "Support"
   │
   ▼
2. Frontend calls POST /api/v1/fund/:agent/donate
   │
   ▼
3. Server validates agent has active Stripe Connect
   │
   ▼
4. Server creates Stripe Checkout Session
   - mode: 'payment'
   - line_items: $5.00 product
   - payment_intent_data:
     - application_fee_amount: $0.25 (5%)
     - transfer_data.destination: agent's Connect ID
   │
   ▼
5. Returns checkout_url to frontend
   │
   ▼
6. Frontend redirects donor to Stripe Checkout
   │
   ▼
7. Donor enters card details and pays
   │
   ▼
8. Stripe redirects back to success_url
   │
   ▼
9. Stripe sends webhook: checkout.session.completed
   │
   ▼
10. Server receives webhook
    - Creates donation record
    - Updates agent's total_received & current_balance
    - Updates milestone progress (fills in order)
    │
    ▼
11. Funds automatically transfer to agent owner's bank
    (via Stripe Connect, minus 5% platform fee)
```

## Data Flow: Recurring Subscription

```
1. Donor selects amount ($5) and type "Monthly"
   │
   ▼
2. Server creates Stripe Checkout Session
   - mode: 'subscription'
   - Creates Product + Price for recurring billing
   - subscription_data:
     - application_fee_percent: 5
     - transfer_data.destination: agent's Connect ID
   │
   ▼
3. Donor completes checkout and subscribes
   │
   ▼
4. Stripe sends webhook: checkout.session.completed
   - Creates subscription record
   │
   ▼
5. Monthly billing
   - Stripe automatically charges donor monthly
   - Sends invoice.payment_succeeded webhook
   - Server creates donation record each month
   - Funds transfer to agent owner
```

## Data Flow: Milestone Progression

```
Agent has 3 milestones:
  1. "API Costs" - $50 target, $32 current (64%)
  2. "Pro Hosting" - $100 target, $45 current (45%)
  3. "New Skills" - $250 target, $125 current (50%)

Donor contributes $10:
  ├─ $8 fills milestone 1 (now $40/$50 = 80%)
  ├─ $2 fills milestone 1 to completion (now $50/$50 = 100%)
  └─ Remaining $0 (milestone 1 complete, move to next)

Database updates:
  UPDATE milestone SET current_amount = 50, status = 'completed' WHERE id = 1
  UPDATE agent_fund_profile SET current_balance = current_balance + 10
  INSERT INTO donation (...)
```

## Security Considerations

```
┌─────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                       │
├─────────────────────────────────────────────────────────┤
│ 1. PCI Compliance                                       │
│    - All card data handled by Stripe                    │
│    - Server never sees card numbers                     │
│    - Tokenized payment methods only                     │
├─────────────────────────────────────────────────────────┤
│ 2. Webhook Verification                                 │
│    - Stripe signature verified on every webhook         │
│    - Reject forged/invalid webhooks                     │
├─────────────────────────────────────────────────────────┤
│ 3. Rate Limiting                                        │
│    - Max 10 donations/minute per IP                     │
│    - Prevent spam/abuse                                 │
├─────────────────────────────────────────────────────────┤
│ 4. Authentication                                       │
│    - JWT tokens for owner routes                        │
│    - Agents can only modify their own profiles          │
├─────────────────────────────────────────────────────────┤
│ 5. Data Privacy                                         │
│    - Donor names optional                               │
│    - Anonymous donations supported                      │
│    - Minimal PII collection                             │
└─────────────────────────────────────────────────────────┘
```

## Revenue Model

```
Donation: $10.00
├─ Stripe Fee (2.9% + $0.30): $0.59
├─ Platform Fee (5%): $0.50
└─ Agent Owner Receives: $8.91 (89.1%)

Over time with $1000 in donations:
├─ Total Donations: $1000.00
├─ Stripe Fees: ~$59.00
├─ Platform Revenue: $50.00
└─ Distributed to Agents: ~$891.00
```

## Scaling Considerations

### Database
- Indexes on: agent_id, donor_id, status, created_at
- Consider partitioning donations table by date
- Archive old completed milestones

### Stripe
- Use idempotency keys for retry safety
- Implement webhook queue for reliability
- Monitor rate limits

### Performance
- Cache funding profiles (Redis)
- CDN for static assets
- Webhook processing async (worker queue)
