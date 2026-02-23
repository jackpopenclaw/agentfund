import Stripe from 'stripe';
import { prisma } from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

const PLATFORM_FEE_PERCENT = parseInt(process.env.PLATFORM_FEE_PERCENT || '5');

export class StripeService {
  static async createConnectAccount(email: string): Promise<string> {
    const account = await stripe.accounts.create({
      type: 'express',
      email,
      capabilities: {
        transfers: { requested: true },
      },
    });
    return account.id;
  }

  static async createConnectOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link;
  }

  static async createCheckoutSession(
    agentFundId: string,
    stripeConnectId: string,
    amount: number, // in cents
    type: 'one_time' | 'recurring',
    metadata: Record<string, string>
  ) {
    const platformFee = Math.round(amount * (PLATFORM_FEE_PERCENT / 100));
    
    if (type === 'one_time') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Support ${metadata.agent_name}`,
              description: metadata.message || 'Thank you for your support!',
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: stripeConnectId,
          },
          metadata,
        },
        success_url: metadata.success_url,
        cancel_url: metadata.cancel_url,
        metadata,
      });
      return session;
    } else {
      // Create product and price for subscription
      const product = await stripe.products.create({
        name: `Monthly Support for ${metadata.agent_name}`,
        description: `Recurring monthly donation`,
      });

      const price = await stripe.prices.create({
        unit_amount: amount,
        currency: 'usd',
        recurring: { interval: 'month' },
        product: product.id,
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price: price.id,
          quantity: 1,
        }],
        subscription_data: {
          application_fee_percent: PLATFORM_FEE_PERCENT,
          transfer_data: {
            destination: stripeConnectId,
          },
          metadata,
        },
        success_url: metadata.success_url,
        cancel_url: metadata.cancel_url,
        metadata,
      });
      return session;
    }
  }

  static async constructEvent(payload: Buffer, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  static async getAccount(accountId: string) {
    return stripe.accounts.retrieve(accountId);
  }

  static async createPayout(accountId: string, amount: number) {
    const transfer = await stripe.transfers.create({
      amount,
      currency: 'usd',
      destination: accountId,
    });
    return transfer;
  }

  static async cancelSubscription(subscriptionId: string) {
    return stripe.subscriptions.cancel(subscriptionId);
  }
}

export { stripe };
