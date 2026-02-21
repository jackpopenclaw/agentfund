import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { StripeService } from '../services/stripe';
import type { CreateMilestoneRequest, UpdateMilestoneRequest } from '../types';

const router = Router();

// Mock auth middleware - replace with real JWT validation
const requireAuth = (req: any, res: any, next: any) => {
  // In production, verify JWT token here
  req.user = { id: 'mock-user-id', agent_id: req.headers['x-agent-id'] };
  next();
};

// Get my funding profile
router.get('/me', requireAuth, async (req: any, res) => {
  try {
    const agent_id = req.user.agent_id;
    
    const profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
      include: {
        milestones: {
          orderBy: [
            { status: 'asc' },
            { display_order: 'asc' }
          ],
        },
        _count: {
          select: {
            donations: { where: { status: 'succeeded' } },
            subscriptions: { where: { status: 'active' } },
          },
        },
      },
    });

    if (!profile) {
      return res.json({ profile: null });
    }

    let connectStatus: 'not_started' | 'pending' | 'active' = 'not_started';
    if (profile.stripe_connect_id) {
      try {
        const account = await StripeService.getAccount(profile.stripe_connect_id);
        connectStatus = account.charges_enabled ? 'active' : 'pending';
      } catch (e) {
        connectStatus = 'pending';
      }
    }

    res.json({
      success: true,
      profile: {
        ...profile,
        stripe_connect_status: connectStatus,
        donation_count: profile._count.donations,
        subscriber_count: profile._count.subscriptions,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Create or update funding profile
router.post('/me', requireAuth, async (req: any, res) => {
  try {
    const agent_id = req.user.agent_id;
    const owner_id = req.user.id;
    const { display_name, description, avatar_url, is_active } = req.body;

    const profile = await prisma.agentFundProfile.upsert({
      where: { agent_id },
      update: {
        display_name,
        description,
        avatar_url,
        is_active: is_active ?? true,
      },
      create: {
        agent_id,
        owner_id,
        display_name,
        description,
        avatar_url,
        is_active: true,
      },
    });

    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Start Stripe Connect onboarding
router.post('/me/connect-stripe', requireAuth, async (req: any, res) => {
  try {
    const agent_id = req.user.agent_id;
    const { email, refresh_url, return_url } = req.body;

    let profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
    });

    // Create profile if doesn't exist
    if (!profile) {
      profile = await prisma.agentFundProfile.create({
        data: {
          agent_id,
          owner_id: req.user.id,
          display_name: req.user.agent_name || agent_id,
          is_active: true,
        },
      });
    }

    // Create or reuse Stripe Connect account
    let accountId = profile.stripe_connect_id;
    if (!accountId) {
      accountId = await StripeService.createConnectAccount(email);
      await prisma.agentFundProfile.update({
        where: { id: profile.id },
        data: { stripe_connect_id: accountId },
      });
    }

    const link = await StripeService.createConnectOnboardingLink(
      accountId,
      refresh_url,
      return_url
    );

    res.json({ success: true, onboarding_url: link.url });
  } catch (error) {
    console.error('Error creating Connect onboarding:', error);
    res.status(500).json({ error: 'Failed to create onboarding link' });
  }
});

// Milestones
router.post('/me/milestones', requireAuth, async (req: any, res) => {
  try {
    const agent_id = req.user.agent_id;
    const { title, description, target_amount }: CreateMilestoneRequest = req.body;

    const profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Count active milestones
    const activeCount = await prisma.milestone.count({
      where: { 
        agent_fund_id: profile.id,
        status: 'active'
      },
    });

    if (activeCount >= 3) {
      return res.status(400).json({ error: 'Maximum 3 active milestones allowed' });
    }

    const milestone = await prisma.milestone.create({
      data: {
        agent_fund_id: profile.id,
        title,
        description,
        target_amount: Math.round(target_amount * 100), // Convert to cents
        display_order: activeCount,
      },
    });

    res.json({ success: true, milestone });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

router.patch('/me/milestones/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agent_id = req.user.agent_id;
    const updates: UpdateMilestoneRequest = req.body;

    const profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const milestone = await prisma.milestone.updateMany({
      where: { 
        id,
        agent_fund_id: profile.id 
      },
      data: {
        ...updates,
        target_amount: updates.target_amount 
          ? Math.round(updates.target_amount * 100)
          : undefined,
        completed_at: updates.status === 'completed' ? new Date() : undefined,
      },
    });

    if (milestone.count === 0) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

router.delete('/me/milestones/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agent_id = req.user.agent_id;

    const profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    await prisma.milestone.updateMany({
      where: { 
        id,
        agent_fund_id: profile.id 
      },
      data: { status: 'cancelled' },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});

// Payouts
router.get('/me/payouts', requireAuth, async (req: any, res) => {
  try {
    const agent_id = req.user.agent_id;

    const profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const payouts = await prisma.payout.findMany({
      where: { agent_fund_id: profile.id },
      orderBy: { created_at: 'desc' },
    });

    res.json({ success: true, payouts });
  } catch (error) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// Analytics
router.get('/me/analytics', requireAuth, async (req: any, res) => {
  try {
    const agent_id = req.user.agent_id;

    const profile = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
      include: {
        donations: {
          where: { status: 'succeeded' },
          orderBy: { created_at: 'asc' },
        },
        subscriptions: {
          where: { status: 'active' },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Calculate stats
    const oneTimeDonations = profile.donations.filter(d => d.type === 'one_time');
    const recurringDonations = profile.donations.filter(d => d.type === 'recurring');
    
    const totalOneTime = oneTimeDonations.reduce((sum, d) => sum + d.amount, 0);
    const totalRecurring = recurringDonations.reduce((sum, d) => sum + d.amount, 0);

    // Monthly revenue (from subscriptions)
    const monthlyRecurring = profile.subscriptions.reduce((sum, s) => sum + s.amount, 0);

    res.json({
      success: true,
      analytics: {
        total_received: profile.total_received,
        total_one_time: totalOneTime,
        total_recurring: totalRecurring,
        monthly_recurring_revenue: monthlyRecurring,
        donation_count: profile.donations.length,
        one_time_count: oneTimeDonations.length,
        recurring_count: recurringDonations.length,
        active_subscriber_count: profile.subscriptions.length,
        average_donation: profile.donations.length > 0 
          ? Math.round(profile.total_received / profile.donations.length)
          : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
