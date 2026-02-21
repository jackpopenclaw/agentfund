export interface CreateDonationRequest {
  amount: number;
  type: 'one_time' | 'recurring';
  is_anonymous?: boolean;
  donor_name?: string;
  message?: string;
  success_url: string;
  cancel_url: string;
}

export interface CreateMilestoneRequest {
  title: string;
  description?: string;
  target_amount: number;
}

export interface UpdateMilestoneRequest {
  title?: string;
  description?: string;
  target_amount?: number;
  status?: 'active' | 'completed' | 'cancelled';
}

export interface FundingProfileResponse {
  id: string;
  agent_id: string;
  display_name: string;
  description: string | null;
  avatar_url: string | null;
  total_received: number;
  current_balance: number;
  is_active: boolean;
  stripe_connect_status: 'not_started' | 'pending' | 'active';
  milestones: MilestoneResponse[];
  recent_donations: DonationResponse[];
}

export interface MilestoneResponse {
  id: string;
  title: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  progress_percent: number;
  status: string;
  completed_at: Date | null;
}

export interface DonationResponse {
  id: string;
  amount: number;
  type: string;
  is_anonymous: boolean;
  donor_name: string | null;
  message: string | null;
  created_at: Date;
}

export interface DonorDashboardResponse {
  donations: DonationResponse[];
  subscriptions: SubscriptionResponse[];
  total_given: number;
}

export interface SubscriptionResponse {
  id: string;
  agent_fund_id: string;
  agent_name: string;
  amount: number;
  status: string;
  is_anonymous: boolean;
  current_period_end: Date;
  cancelled_at: Date | null;
}
