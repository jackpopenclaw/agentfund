import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { CreateProfileSchema, CreateMilestoneSchema } from '../validation/schemas';
import { StripeService } from '../services/stripe';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get my funding profile
router.get('/', async (req, res) => {
  try {
    const profile = await prisma.agentFundProfile.findUnique({
      where: { user_id: req.user!.id },
      include: {
        milestones: {
          orderBy: [
            { status: 'asc' },
            { display_order: 'asc' }
          ],
        },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Create/update profile
router.post('/', validate(CreateProfileSchema), async (req, res) => {
  try {
    const { agent_id, display_name, description, avatar_url } = req.body;

    // Check if agent_id is already taken by another user
    const existing = await prisma.agentFundProfile.findUnique({
      where: { agent_id },
    });

    if (existing && existing.user_id !== req.user!.id) {
      return res.status(400).json({ error: 'Agent ID already taken' });
    }

    const profile = await prisma.agentFundProfile.upsert({
      where: { user_id: req.user!.id },
      update: {
        agent_id,
        display_name,
        description,
        avatar_url,
      },
      create: {
        user_id: req.user!.id,
        agent_id,
        display_name,
        description,
        avatar_url,
      },
    });

    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// Create Stripe Connect onboarding link
router.post('/connect-stripe', async (req, res) => {
  try {
    const profile = await prisma.agentFundProfile.findUnique({
      where: { user_id: req.user!.id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Create Connect account if not exists
    let connectId = profile.stripe_connect_id;
    if (!connectId) {
      connectId = await StripeService.createConnectAccount(req.user!.email);
      await prisma.agentFundProfile.update({
        where: { id: profile.id },
        data: { stripe_connect_id: connectId },
      });
    }

    // Create onboarding link
    const refreshUrl = `${process.env.FRONTEND_URL}/dashboard?stripe=refresh`;
    const returnUrl = `${process.env.FRONTEND_URL}/dashboard?stripe=success`;
    
    const link = await StripeService.createConnectOnboardingLink(connectId, refreshUrl, returnUrl);

    res.json({ success: true, url: link.url });
  } catch (error) {
    console.error('Error creating Connect link:', error);
    res.status(500).json({ error: 'Failed to create onboarding link' });
  }
});

// Create milestone
router.post('/milestones', validate(CreateMilestoneSchema), async (req, res) => {
  try {
    const profile = await prisma.agentFundProfile.findUnique({
      where: { user_id: req.user!.id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get next display order
    const lastMilestone = await prisma.milestone.findFirst({
      where: { agent_fund_id: profile.id },
      orderBy: { display_order: 'desc' },
    });

    const milestone = await prisma.milestone.create({
      data: {
        agent_fund_id: profile.id,
        title: req.body.title,
        description: req.body.description,
        target_amount: req.body.target_amount,
        display_order: (lastMilestone?.display_order ?? 0) + 1,
      },
    });

    res.json({ success: true, milestone });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

// Get analytics
router.get('/analytics', async (req, res) => {
  try {
    const profile = await prisma.agentFundProfile.findUnique({
      where: { user_id: req.user!.id },
      include: {
        donations: {
          where: { status: 'succeeded' },
          orderBy: { created_at: 'desc' },
        },
        subscriptions: {
          where: { status: 'active' },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Calculate monthly revenue
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const monthlyDonations = profile.donations.filter(
      d => d.created_at >= thirtyDaysAgo
    );

    const monthlyRevenue = monthlyDonations.reduce((sum, d) => sum + d.amount, 0);
    
    // Calculate active monthly recurring
    const monthlyRecurring = profile.subscriptions.reduce((sum, s) => sum + s.amount, 0);

    res.json({
      success: true,
      analytics: {
        total_received: profile.total_received,
        current_balance: profile.current_balance,
        total_donations: profile.donations.length,
        monthly_revenue: monthlyRevenue,
        monthly_recurring: monthlyRecurring,
        active_subscriptions: profile.subscriptions.length,
        recent_donations: profile.donations.slice(0, 10),
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
