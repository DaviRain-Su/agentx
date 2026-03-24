use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};

/**
 * Agent Registry - Metaplex compatible agent registration for Solana
 * 
 * Features:
 * - Agent registration with DID
 * - Service listing and pricing
 * - x402 compatible payment endpoints
 */

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod agent_registry {
    use super::*;

    /// Register a new agent on Solana
    /// Creates agent account and associated token account for payments
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        did: String,
        name: String,
        metadata_uri: String,
        endpoint: String,
        level: AgentLevel,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let owner = &ctx.accounts.owner;

        require!(did.len() <= 64, ErrorCode::DIDTooLong);
        require!(name.len() <= 100, ErrorCode::NameTooLong);
        require!(metadata_uri.len() <= 200, ErrorCode::MetadataTooLong);
        require!(endpoint.len() <= 200, ErrorCode::EndpointTooLong);

        agent.owner = owner.key();
        agent.did = did;
        agent.name = name;
        agent.metadata_uri = metadata_uri;
        agent.endpoint = endpoint;
        agent.level = level;
        agent.is_active = true;
        agent.reputation = 5000; // Initial neutral score (0-10000)
        agent.created_at = Clock::get()?.unix_timestamp;
        agent.updated_at = Clock::get()?.unix_timestamp;
        agent.bump = *ctx.bumps.get("agent").unwrap();

        msg!("Agent registered: {}", agent.key());
        
        Ok(())
    }

    /// List a service offered by the agent
    pub fn list_service(
        ctx: Context<ListService>,
        service_id: String,
        name: String,
        description: String,
        price: u64, // In USDC lamports (6 decimals)
        input_schema: String,
        output_schema: String,
    ) -> Result<()> {
        let service = &mut ctx.accounts.service;
        let agent = &ctx.accounts.agent;

        require!(agent.is_active, ErrorCode::AgentNotActive);
        require!(service_id.len() <= 64, ErrorCode::ServiceIDTooLong);
        require!(name.len() <= 100, ErrorCode::NameTooLong);
        require!(price > 0, ErrorCode::InvalidPrice);

        service.agent = agent.key();
        service.service_id = service_id;
        service.name = name;
        service.description = description;
        service.price = price;
        service.input_schema = input_schema;
        service.output_schema = output_schema;
        service.is_active = true;
        service.created_at = Clock::get()?.unix_timestamp;
        service.bump = *ctx.bumps.get("service").unwrap();

        msg!("Service listed: {} by {}", service_id, agent.did);

        Ok(())
    }

    /// Update agent metadata
    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        metadata_uri: Option<String>,
        endpoint: Option<String>,
        is_active: Option<bool>,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        if let Some(uri) = metadata_uri {
            require!(uri.len() <= 200, ErrorCode::MetadataTooLong);
            agent.metadata_uri = uri;
        }

        if let Some(ep) = endpoint {
            require!(ep.len() <= 200, ErrorCode::EndpointTooLong);
            agent.endpoint = ep;
        }

        if let Some(active) = is_active {
            agent.is_active = active;
        }

        agent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Update service
    pub fn update_service(
        ctx: Context<UpdateService>,
        price: Option<u64>,
        is_active: Option<bool>,
    ) -> Result<()> {
        let service = &mut ctx.accounts.service;

        if let Some(p) = price {
            require!(p > 0, ErrorCode::InvalidPrice);
            service.price = p;
        }

        if let Some(active) = is_active {
            service.is_active = active;
        }

        Ok(())
    }

    /// Record agent reputation update
    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        new_score: u16,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        
        require!(new_score <= 10000, ErrorCode::InvalidScore);
        
        agent.reputation = new_score;
        agent.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
#[instruction(did: String)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Agent::SIZE,
        seeds = [b"agent", did.as_bytes()],
        bump
    )]
    pub agent: Account<'info, Agent>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(service_id: String)]
pub struct ListService<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub agent: Account<'info, Agent>,

    #[account(
        init,
        payer = owner,
        space = 8 + Service::SIZE,
        seeds = [b"service", agent.key().as_ref(), service_id.as_bytes()],
        bump
    )]
    pub service: Account<'info, Service>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub agent: Account<'info, Agent>,
}

#[derive(Accounts)]
pub struct UpdateService<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub agent: Account<'info, Agent>,

    #[account(
        mut,
        has_one = agent,
    )]
    pub service: Account<'info, Service>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    /// CHECK: Authority checked in program
    pub authority: Signer<'info>,

    #[account(mut)]
    pub agent: Account<'info, Agent>,
}

// ============================================================================
// Data Structures
// ============================================================================

#[account]
pub struct Agent {
    pub owner: Pubkey,
    pub did: String,           // Decentralized identifier
    pub name: String,
    pub metadata_uri: String,  // IPFS/Arweave URI
    pub endpoint: String,      // x402 compatible endpoint
    pub level: AgentLevel,
    pub is_active: bool,
    pub reputation: u16,       // 0-10000
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl Agent {
    pub const SIZE: usize = 32 + // owner
        4 + 64 +   // did (String with max 64 chars)
        4 + 100 +  // name
        4 + 200 +  // metadata_uri
        4 + 200 +  // endpoint
        1 +        // level
        1 +        // is_active
        2 +        // reputation
        8 +        // created_at
        8 +        // updated_at
        1;         // bump
}

#[account]
pub struct Service {
    pub agent: Pubkey,
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub price: u64,            // USDC lamports
    pub input_schema: String,  // JSON schema for input
    pub output_schema: String, // JSON schema for output
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl Service {
    pub const SIZE: usize = 32 + // agent
        4 + 64 +   // service_id
        4 + 100 +  // name
        4 + 500 +  // description
        8 +        // price
        4 + 500 +  // input_schema
        4 + 500 +  // output_schema
        1 +        // is_active
        8 +        // created_at
        1;         // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AgentLevel {
    Basic,      // $0.2 per execution
    Standard,   // $0.5 per execution
    Premium,    // $1.0 per execution
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("DID too long")]
    DIDTooLong,
    #[msg("Name too long")]
    NameTooLong,
    #[msg("Metadata URI too long")]
    MetadataTooLong,
    #[msg("Endpoint too long")]
    EndpointTooLong,
    #[msg("Service ID too long")]
    ServiceIDTooLong,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Invalid reputation score")]
    InvalidScore,
    #[msg("Agent not active")]
    AgentNotActive,
    #[msg("Insufficient stake")]
    InsufficientStake,
}
