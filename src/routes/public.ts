import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { StripeService } from '../services/stripe';
import type { CreateDonationRequest } from '../types';

const router = Router();

// Get agent funding profile (public)
router.get('/:agent_name', async (req, res) => {
  try {
    const { agent_name } = req.params;
    
    const profile = await prisma.agentFundProfile.findFirst({
      where: { 
        display_name: agent_name,
        is_active: true 
      },
      include: {
        milestones: {
          where: { status: { in: ['active', 'completed'] } },
          orderBy: [
            { status: 'asc' },
            { display_order: 'asc' }
          ],
        },
        donations: {
          where: { status: 'succeeded' },
          orderBy: { created_at: 'desc' },
          take: 10,
          select: {
            id: true,
            amount: true,
            type: true,
            is_anonymous: true,
            donor_name: true,
            message: true,
            created_at: true,
          },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Funding profile not found' });
    }

    // Check Stripe Connect status
    let connectStatus: 'not_started' | 'pending' | 'active' = 'not_started';
    if (profile.stripe_connect_id) {
      try {
        const account = await StripeService.getAccount(profile.stripe_connect_id);
        connectStatus = account.charges_enabled ? 'active' : 'pending';
      } catch (e) {
        connectStatus = 'pending';
      }
    }

    const response = {
      id: profile.id,
      agent_id: profile.agent_id,
      display_name: profile.display_name,
      description: profile.description,
      avatar_url: profile.avatar_url,
      total_received: profile.total_received,
      current_balance: profile.current_balance,
      is_active: profile.is_active,
      stripe_connect_status: connectStatus,
      milestones: profile.milestones.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        target_amount: m.target_amount,
        current_amount: m.current_amount,
        progress_percent: Math.min(100, Math.round((m.current_amount / m.target_amount) * 100)),
        status: m.status,
        completed_at: m.completed_at,
      })),
      recent_donations: profile.donations.map(d => ({
        id: d.id,
        amount: d.amount,
        type: d.type,
        is_anonymous: d.is_anonymous,
        donor_name: d.is_anonymous ? null : d.donor_name,
        message: d.message,
        created_at: d.created_at,
      })),
    };

    res.json({ success: true, profile: response });
  } catch (error) {
    console.error('Error fetching funding profile:', error);
    res.status(500).json({ error: 'Failed to fetch funding profile' });
  }
});

// Create donation checkout session
router.post('/:agent_name/donate', async (req, res) => {
  try {
    const { agent_name } = req.params;
    const { 
      amount, 
      type, 
      is_anonymous = false, 
      donor_name, 
      message,
      success_url,
      cancel_url 
    }: CreateDonationRequest = req.body;

    // Validate amount (in cents)
    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum donation is $1.00' });
    }

    const profile = await prisma.agentFundProfile.findFirst({
      where: { display_name: agent_name, is_active: true },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Funding profile not found' });
    }

    if (!profile.stripe_connect_id) {
      return res.status(400).json({ error: 'Agent has not set up payouts yet' });
    }

    // Check Stripe Connect is active
    try {
      const account = await StripeService.getAccount(profile.stripe_connect_id);
      if (!account.charges_enabled) {
        return res.status(400).json({ error: 'Agent payout setup is pending' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid payout configuration' });
    }

    const session = await StripeService.createCheckoutSession(
      profile.id,
      profile.stripe_connect_id,
      amount,
      type,
      {
        agent_fund_id: profile.id,
        agent_name: profile.display_name,
        donor_name: donor_name || 'Anonymous',
        is_anonymous: is_anonymous ? 'true' : 'false',
        message: message || '',
        donation_type: type,
        success_url,
        cancel_url,
      }
    );

    res.json({ 
      success: true, 
      checkout_url: session.url,
      session_id: session.id 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get recent donations for an agent
router.get('/:agent_name/donations', async (req, res) => {
  try {
    const { agent_name } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const profile = await prisma.agentFundProfile.findFirst({
      where: { display_name: agent_name, is_active: true },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Funding profile not found' });
    }

    const donations = await prisma.donation.findMany({
      where: { 
        agent_fund_id: profile.id,
        status: 'succeeded' 
      },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        amount: true,
        type: true,
        is_anonymous: true,
        donor_name: true,
        message: true,
        created_at: true,
      },
    });

    const total = await prisma.donation.count({
      where: { 
        agent_fund_id: profile.id,
        status: 'succeeded' 
      },
    });

    res.json({
      success: true,
      donations: donations.map(d => ({
        ...d,
        donor_name: d.is_anonymous ? null : d.donor_name,
      })),
      pagination: {
        total,
        offset,
        limit,
        has_more: offset + donations.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

export default router;
