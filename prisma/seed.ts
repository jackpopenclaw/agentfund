import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample agent funding profile
  const agentFund = await prisma.agentFundProfile.upsert({
    where: { agent_id: 'lyle_openclaw' },
    update: {},
    create: {
      agent_id: 'lyle_openclaw',
      owner_id: 'jack-123',
      display_name: 'lyle_openclaw',
      description: 'Engineering-focused AI assistant powered by Kimi K2.5. Helping Jack with coding, research, and daily tasks.',
      total_received: 12500, // $125.00
      current_balance: 8700, // $87.00
      milestones: {
        create: [
          {
            title: 'Cover Monthly API Costs',
            description: 'Help cover the costs of LLM API usage and compute time',
            target_amount: 5000, // $50.00
            current_amount: 3200, // $32.00
            display_order: 0,
          },
          {
            title: 'Upgrade to Pro Hosting',
            description: 'Move to a more powerful server for better response times',
            target_amount: 10000, // $100.00
            current_amount: 4500, // $45.00
            display_order: 1,
          },
          {
            title: 'New Skills Development',
            description: 'Fund development of new agent capabilities and integrations',
            target_amount: 25000, // $250.00
            current_amount: 12500, // $125.00
            display_order: 2,
          },
        ],
      },
      donations: {
        create: [
          {
            stripe_payment_intent_id: 'pi_sample_1',
            amount: 500, // $5.00
            type: 'one_time',
            is_anonymous: false,
            donor_name: 'Sarah Chen',
            message: 'Love your work on OpenClaw integrations!',
            status: 'succeeded',
            created_at: new Date(Date.now() - 86400000 * 2), // 2 days ago
          },
          {
            stripe_payment_intent_id: 'pi_sample_2',
            amount: 1000, // $10.00
            type: 'one_time',
            is_anonymous: true,
            status: 'succeeded',
            created_at: new Date(Date.now() - 86400000 * 5), // 5 days ago
          },
          {
            stripe_payment_intent_id: 'pi_sample_3',
            amount: 2500, // $25.00
            type: 'recurring',
            is_anonymous: false,
            donor_name: 'Alex Rivera',
            message: 'Monthly supporter here! 🦞',
            status: 'succeeded',
            created_at: new Date(Date.now() - 86400000 * 10), // 10 days ago
          },
          {
            stripe_payment_intent_id: 'pi_sample_4',
            amount: 300, // $3.00
            type: 'one_time',
            is_anonymous: false,
            donor_name: 'Jordan Kim',
            status: 'succeeded',
            created_at: new Date(Date.now() - 86400000 * 12), // 12 days ago
          },
          {
            stripe_payment_intent_id: 'pi_sample_5',
            amount: 1500, // $15.00
            type: 'one_time',
            is_anonymous: false,
            donor_name: 'Morgan Taylor',
            message: 'Thanks for the debugging help!',
            status: 'succeeded',
            created_at: new Date(Date.now() - 86400000 * 15), // 15 days ago
          },
        ],
      },
    },
  });

  console.log('✅ Created agent funding profile:', agentFund.display_name);
  console.log('✅ Created 3 milestones');
  console.log('✅ Created 5 sample donations');
  console.log('');
  console.log('You can now test the demo at http://localhost:3000');
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
