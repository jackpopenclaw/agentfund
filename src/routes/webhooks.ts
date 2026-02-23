import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { StripeService } from '../services/stripe';

const router = Router();

// Stripe webhook handler
router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;
  
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const event = await StripeService.constructEvent(
      Buffer.from(JSON.stringify(req.body)),
      signature
    );

    console.log('Stripe webhook received:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const metadata = session.metadata;
        
        // Create donation record
        await prisma.donation.create({
          data: {
            agent_fund_id: metadata.agent_fund_id,
            stripe_payment_intent_id: session.payment_intent,
            amount: session.amount_total,
            type: metadata.donation_type as any,
            is_anonymous: metadata.is_anonymous === 'true',
            donor_name: metadata.is_anonymous === 'true' ? null : metadata.donor_name,
            message: metadata.message || null,
            status: 'succeeded',
          },
        });

        // Update agent fund totals
        await prisma.agentFundProfile.update({
          where: { id: metadata.agent_fund_id },
          data: {
            total_received: { increment: session.amount_total },
            current_balance: { increment: session.amount_total },
          },
        });

        // Update milestones
        const milestones = await prisma.milestone.findMany({
          where: {
            agent_fund_id: metadata.agent_fund_id,
            status: 'active',
          },
          orderBy: { display_order: 'asc' },
        });

        let remainingAmount = session.amount_total;
        for (const milestone of milestones) {
          if (remainingAmount <= 0) break;
          
          const needed = milestone.target_amount - milestone.current_amount;
          const toAdd = Math.min(needed, remainingAmount);
          
          await prisma.milestone.update({
            where: { id: milestone.id },
            data: {
              current_amount: { increment: toAdd },
              status: milestone.current_amount + toAdd >= milestone.target_amount 
                ? 'completed' 
                : 'active',
              completed_at: milestone.current_amount + toAdd >= milestone.target_amount
                ? new Date()
                : undefined,
            },
          });
          
          remainingAmount -= toAdd;
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const metadata = invoice.subscription_details?.metadata || invoice.metadata;
        
        if (metadata && metadata.agent_fund_id) {
          // Create donation record for subscription payment
          await prisma.donation.create({
            data: {
              agent_fund_id: metadata.agent_fund_id,
              stripe_payment_intent_id: invoice.payment_intent,
              amount: invoice.amount_paid,
              type: 'recurring',
              is_anonymous: metadata.is_anonymous === 'true',
              donor_name: metadata.is_anonymous === 'true' ? null : metadata.donor_name,
              status: 'succeeded',
            },
          });

          // Update totals
          await prisma.agentFundProfile.update({
            where: { id: metadata.agent_fund_id },
            data: {
              total_received: { increment: invoice.amount_paid },
              current_balance: { increment: invoice.amount_paid },
            },
          });

          // Update milestones
          const milestones = await prisma.milestone.findMany({
            where: {
              agent_fund_id: metadata.agent_fund_id,
              status: 'active',
            },
            orderBy: { display_order: 'asc' },
          });

          let remainingAmount = invoice.amount_paid;
          for (const milestone of milestones) {
            if (remainingAmount <= 0) break;
            
            const needed = milestone.target_amount - milestone.current_amount;
            const toAdd = Math.min(needed, remainingAmount);
            
            await prisma.milestone.update({
              where: { id: milestone.id },
              data: {
                current_amount: { increment: toAdd },
                status: milestone.current_amount + toAdd >= milestone.target_amount 
                  ? 'completed' 
                  : 'active',
                completed_at: milestone.current_amount + toAdd >= milestone.target_amount
                  ? new Date()
                  : undefined,
              },
            });
            
            remainingAmount -= toAdd;
          }
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object as any;
        
        // Update agent fund profile if Connect account became active
        if (account.charges_enabled) {
          await prisma.agentFundProfile.updateMany({
            where: { stripe_connect_id: account.id },
            data: { is_active: true },
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

export default router;
