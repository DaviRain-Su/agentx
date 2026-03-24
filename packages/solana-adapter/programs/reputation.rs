use anchor_lang::prelude::*;

/**
 * Reputation System - Solana A2A Market Reputation
 * 
 * Features:
 * - Task completion tracking
 * - Rating submission (1-5 stars)
 * - Reputation score calculation
 * - Dispute resolution history
 */

declare_id!("Rep1111111111111111111111111111111111111111");

#[program]
pub mod reputation {
    use super::*;

    /// Initialize reputation account for an agent
    pub fn initialize_reputation(
        ctx: Context<InitializeReputation>,
    ) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation_account;
        let agent = &ctx.accounts.agent;

        reputation.agent = agent.key();
        reputation.total_tasks = 0;
        reputation.completed_tasks = 0;
        reputation.failed_tasks = 0;
        reputation.total_rating_sum = 0;
        reputation.total_ratings = 0;
        reputation.reputation_score = 5000; // Start at neutral (0-10000)
        reputation.dispute_count = 0;
        reputation.dispute_won = 0;
        reputation.created_at = Clock::get()?.unix_timestamp;
        reputation.updated_at = Clock::get()?.unix_timestamp;
        reputation.bump = *ctx.bumps.get("reputation_account").unwrap();

        msg!("Reputation account initialized for agent: {}", agent.key());

        Ok(())
    }

    /// Record task completion (called by A2A Market)
    pub fn record_task_completion(
        ctx: Context<UpdateReputation>,
        success: bool,
    ) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation_account;

        reputation.total_tasks += 1;
        
        if success {
            reputation.completed_tasks += 1;
        } else {
            reputation.failed_tasks += 1;
        }

        // Recalculate reputation score
        reputation.reputation_score = calculate_reputation_score(reputation);
        reputation.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Task recorded. Total: {}, Success: {}, Failed: {}, Score: {}",
            reputation.total_tasks,
            reputation.completed_tasks,
            reputation.failed_tasks,
            reputation.reputation_score
        );

        Ok(())
    }

    /// Submit rating for an agent (called by task requester)
    pub fn submit_rating(
        ctx: Context<SubmitRating>,
        task_id: String,
        rating: u8, // 1-5 stars
        review: String,
    ) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation_account;
        let rating_account = &mut ctx.accounts.rating_account;
        let reviewer = &ctx.accounts.reviewer;

        require!(rating >= 1 && rating <= 5, ErrorCode::InvalidRating);
        require!(task_id.len() <= 64, ErrorCode::TaskIDTooLong);
        require!(review.len() <= 1000, ErrorCode::ReviewTooLong);

        // Initialize rating account
        rating_account.task_id = task_id.clone();
        rating_account.reviewer = reviewer.key();
        rating_account.agent = reputation.agent;
        rating_account.rating = rating;
        rating_account.review = review;
        rating_account.created_at = Clock::get()?.unix_timestamp;
        rating_account.bump = *ctx.bumps.get("rating_account").unwrap();

        // Update reputation
        reputation.total_ratings += 1;
        reputation.total_rating_sum += rating as u32;
        reputation.reputation_score = calculate_reputation_score(reputation);
        reputation.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Rating submitted: {} stars for agent {}. New score: {}",
            rating,
            reputation.agent,
            reputation.reputation_score
        );

        Ok(())
    }

    /// Record dispute (called by A2A Market)
    pub fn record_dispute(
        ctx: Context<UpdateReputation>,
        won: bool,
    ) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation_account;

        reputation.dispute_count += 1;
        
        if won {
            reputation.dispute_won += 1;
        }

        // Recalculate reputation
        reputation.reputation_score = calculate_reputation_score(reputation);
        reputation.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Dispute recorded. Total: {}, Won: {}, Score: {}",
            reputation.dispute_count,
            reputation.dispute_won,
            reputation.reputation_score
        );

        Ok(())
    }

    /// Calculate reputation score (0-10000)
    fn calculate_reputation_score(reputation: &ReputationAccount) -> u16 {
        if reputation.total_tasks == 0 {
            return 5000; // Neutral score for new agents
        }

        // Base score from completion rate (50% weight)
        let completion_rate = (reputation.completed_tasks as f64) / (reputation.total_tasks as f64);
        let completion_score = (completion_rate * 5000.0) as u16;

        // Rating score (30% weight)
        let rating_score = if reputation.total_ratings > 0 {
            let avg_rating = (reputation.total_rating_sum as f64) / (reputation.total_ratings as f64);
            // Convert 1-5 scale to 0-3000
            ((avg_rating - 1.0) / 4.0 * 3000.0) as u16
        } else {
            1500 // Neutral if no ratings
        };

        // Dispute score (20% weight)
        let dispute_score = if reputation.dispute_count > 0 {
            let dispute_win_rate = (reputation.dispute_won as f64) / (reputation.dispute_count as f64);
            (dispute_win_rate * 2000.0) as u16
        } else {
            1000 // Neutral if no disputes
        };

        completion_score + rating_score + dispute_score
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeReputation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Agent account (from agent_registry)
    #[account()]
    pub agent: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ReputationAccount::SIZE,
        seeds = [b"reputation", agent.key().as_ref()],
        bump
    )]
    pub reputation_account: Account<'info, ReputationAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    /// CHECK: Authority (A2A Market program)
    pub authority: Signer<'info>,

    #[account(mut)]
    pub reputation_account: Account<'info, ReputationAccount>,
}

#[derive(Accounts)]
#[instruction(task_id: String)]
pub struct SubmitRating<'info> {
    #[account(mut)]
    pub reviewer: Signer<'info>,

    /// CHECK: Agent account
    #[account()]
    pub agent: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = reputation_account.bump,
    )]
    pub reputation_account: Account<'info, ReputationAccount>,

    #[account(
        init,
        payer = reviewer,
        space = 8 + RatingAccount::SIZE,
        seeds = [b"rating", agent.key().as_ref(), task_id.as_bytes()],
        bump
    )]
    pub rating_account: Account<'info, RatingAccount>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// Data Structures
// ============================================================================

#[account]
pub struct ReputationAccount {
    pub agent: Pubkey,
    pub total_tasks: u32,
    pub completed_tasks: u32,
    pub failed_tasks: u32,
    pub total_rating_sum: u32, // Sum of all ratings (1-5)
    pub total_ratings: u32,
    pub reputation_score: u16, // 0-10000
    pub dispute_count: u16,
    pub dispute_won: u16,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl ReputationAccount {
    pub const SIZE: usize = 32 + // agent
        4 +  // total_tasks
        4 +  // completed_tasks
        4 +  // failed_tasks
        4 +  // total_rating_sum
        4 +  // total_ratings
        2 +  // reputation_score
        2 +  // dispute_count
        2 +  // dispute_won
        8 +  // created_at
        8 +  // updated_at
        1;   // bump
}

#[account]
pub struct RatingAccount {
    pub task_id: String,
    pub reviewer: Pubkey,
    pub agent: Pubkey,
    pub rating: u8, // 1-5 stars
    pub review: String,
    pub created_at: i64,
    pub bump: u8,
}

impl RatingAccount {
    pub const SIZE: usize = 4 + 64 +  // task_id
        32 +  // reviewer
        32 +  // agent
        1 +   // rating
        4 + 1000 + // review
        8 +   // created_at
        1;    // bump
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid rating, must be 1-5")]
    InvalidRating,
    #[msg("Task ID too long")]
    TaskIDTooLong,
    #[msg("Review too long")]
    ReviewTooLong,
}
