use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/**
 * A2A Market - Agent-to-Agent service marketplace
 * 
 * Features:
 * - Hire agents for services
 * - Escrow payment in USDC
 * - Complete/Refund/Dispute flow
 * - x402 compatible payment verification
 */

declare_id!("Market11111111111111111111111111111111111111");

#[program]
pub mod a2a_market {
    use super::*;

    /// Create a new task hiring an agent's service
    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        service_id: String,
        input_data: String,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let service = &ctx.accounts.service;
        let buyer = &ctx.accounts.buyer;

        require!(service.is_active, ErrorCode::ServiceNotActive);
        require!(task_id.len() <= 64, ErrorCode::TaskIDTooLong);

        // Transfer payment to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, service.price)?;

        // Initialize task
        task.task_id = task_id;
        task.service_id = service_id;
        task.buyer = buyer.key();
        task.agent = service.agent;
        task.service_provider = ctx.accounts.agent_owner.key();
        task.price = service.price;
        task.input_data = input_data;
        task.status = TaskStatus::Pending;
        task.created_at = Clock::get()?.unix_timestamp;
        task.bump = *ctx.bumps.get("task").unwrap();

        msg!("Task created: {} for service {}", task_id, service_id);

        Ok(())
    }

    /// Agent starts executing the task
    pub fn start_execution(ctx: Context<UpdateTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(
            task.status == TaskStatus::Pending,
            ErrorCode::InvalidTaskStatus
        );

        task.status = TaskStatus::Executing;
        task.started_at = Some(Clock::get()?.unix_timestamp);

        msg!("Task execution started: {}", task.task_id);

        Ok(())
    }

    /// Complete task and release payment to agent
    pub fn complete_task(
        ctx: Context<CompleteTask>,
        output_data: String,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(
            task.status == TaskStatus::Executing || task.status == TaskStatus::Pending,
            ErrorCode::InvalidTaskStatus
        );

        // Transfer from escrow to agent
        let seeds = &[
            b"escrow",
            task.task_id.as_bytes(),
            &[task.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.agent_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, task.price)?;

        // Update task
        task.status = TaskStatus::Completed;
        task.output_data = output_data;
        task.completed_at = Some(Clock::get()?.unix_timestamp);

        msg!("Task completed: {}", task.task_id);

        Ok(())
    }

    /// Cancel task and refund buyer (before execution starts)
    pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(
            task.status == TaskStatus::Pending,
            ErrorCode::InvalidTaskStatus
        );
        require!(
            task.buyer == ctx.accounts.buyer.key(),
            ErrorCode::Unauthorized
        );

        // Refund from escrow to buyer
        let seeds = &[
            b"escrow",
            task.task_id.as_bytes(),
            &[task.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, task.price)?;

        task.status = TaskStatus::Cancelled;

        msg!("Task cancelled and refunded: {}", task.task_id);

        Ok(())
    }

    /// Raise dispute (during execution)
    pub fn raise_dispute(
        ctx: Context<UpdateTask>,
        reason: String,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(
            task.status == TaskStatus::Executing,
            ErrorCode::InvalidTaskStatus
        );

        task.status = TaskStatus::Disputed;
        task.dispute_reason = Some(reason);

        msg!("Task disputed: {}", task.task_id);

        Ok(())
    }

    /// Resolve dispute (by authority)
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        refund_buyer: bool,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(
            task.status == TaskStatus::Disputed,
            ErrorCode::InvalidTaskStatus
        );

        let seeds = &[
            b"escrow",
            task.task_id.as_bytes(),
            &[task.bump],
        ];
        let signer = &[&seeds[..]];

        if refund_buyer {
            // Refund buyer
            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, task.price)?;
            
            task.status = TaskStatus::Refunded;
        } else {
            // Pay agent
            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.agent_token_account.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, task.price)?;
            
            task.status = TaskStatus::Completed;
        }

        task.completed_at = Some(Clock::get()?.unix_timestamp);

        msg!("Dispute resolved for task: {}", task.task_id);

        Ok(())
    }

    /// Timeout task (callable by anyone after deadline)
    pub fn timeout_task(ctx: Context<TimeoutTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let clock = Clock::get()?;
        
        require!(
            task.status == TaskStatus::Pending || task.status == TaskStatus::Executing,
            ErrorCode::InvalidTaskStatus
        );

        // Check if timeout period passed (e.g., 24 hours)
        let timeout_period = 24 * 60 * 60; // 24 hours in seconds
        require!(
            clock.unix_timestamp - task.created_at > timeout_period,
            ErrorCode::TimeoutNotReached
        );

        // Refund buyer
        let seeds = &[
            b"escrow",
            task.task_id.as_bytes(),
            &[task.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, task.price)?;

        task.status = TaskStatus::Timeout;

        msg!("Task timed out and refunded: {}", task.task_id);

        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
#[instruction(task_id: String)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Agent owner account
    #[account()]
    pub agent_owner: AccountInfo<'info>,

    #[account()]
    pub service: Account<'info, Service>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Task::SIZE,
        seeds = [b"task", task_id.as_bytes()],
        bump
    )]
    pub task: Account<'info, Task>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == usdc_mint.key(),
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = buyer,
        token::mint = usdc_mint,
        token::authority = escrow_authority,
        seeds = [b"escrow", task_id.as_bytes()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// CHECK: Escrow PDA authority
    #[account(
        seeds = [b"escrow", task_id.as_bytes()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateTask<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, Task>,
}

#[derive(Accounts)]
pub struct CompleteTask<'info> {
    #[account(mut)]
    pub agent_owner: Signer<'info>,

    #[account(
        mut,
        has_one = agent,
    )]
    pub task: Account<'info, Task>,

    /// CHECK: Agent account
    #[account()]
    pub agent: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = agent_token_account.owner == agent_owner.key(),
    )]
    pub agent_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelTask<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer,
    )]
    pub task: Account<'info, Task>,

    /// CHECK: Escrow PDA authority
    #[account(
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account()]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, Task>,

    /// CHECK: Buyer account
    #[account()]
    pub buyer: AccountInfo<'info>,

    /// CHECK: Agent owner account
    #[account()]
    pub agent_owner: AccountInfo<'info>,

    /// CHECK: Escrow PDA authority
    #[account(
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TimeoutTask<'info> {
    /// CHECK: Anyone can call timeout after deadline
    pub caller: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, Task>,

    /// CHECK: Buyer account
    #[account()]
    pub buyer: AccountInfo<'info>,

    /// CHECK: Escrow PDA authority
    #[account(
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = escrow_authority,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Data Structures
// ============================================================================

#[account]
pub struct Task {
    pub task_id: String,
    pub service_id: String,
    pub buyer: Pubkey,
    pub agent: Pubkey,        // Agent PDA
    pub service_provider: Pubkey, // Agent owner
    pub price: u64,           // USDC amount
    pub input_data: String,
    pub output_data: String,
    pub status: TaskStatus,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub dispute_reason: Option<String>,
    pub bump: u8,
}

impl Task {
    pub const SIZE: usize = 4 + 64 +   // task_id
        4 + 64 +   // service_id
        32 +       // buyer
        32 +       // agent
        32 +       // service_provider
        8 +        // price
        4 + 1000 + // input_data
        4 + 1000 + // output_data
        1 +        // status
        8 +        // created_at
        9 +        // started_at (Option<i64>)
        9 +        // completed_at
        4 + 500 + 1 + // dispute_reason
        1;         // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Pending,
    Executing,
    Completed,
    Cancelled,
    Disputed,
    Refunded,
    Timeout,
}

// Re-export from agent_registry
use crate::agent_registry::Service;

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Service not active")]
    ServiceNotActive,
    #[msg("Task ID too long")]
    TaskIDTooLong,
    #[msg("Invalid task status")]
    InvalidTaskStatus,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Timeout period not reached")]
    TimeoutNotReached,
}
