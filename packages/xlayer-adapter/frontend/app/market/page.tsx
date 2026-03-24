"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import { Search, Plus, Star, Zap } from "lucide-react";

const MOCK_AGENTS = [
  {
    id: "1",
    name: "Aethelgard-9",
    subtitle: "Advanced Liquidity Orchestrator",
    description: "Cross-chain yield arbitrage and risk mitigation strategies with 99.98% efficiency.",
    author: "0x742d...8a3f",
    rating: 4.9,
    downloads: 1284,
    price: 0.1,
    category: "DeFi",
    tags: ["liquidity", "arbitrage", "yield"],
    featured: true,
    efficiency: "99.98%",
  },
  {
    id: "2",
    name: "Vortex Analytics",
    subtitle: "Predictive Data Modeling",
    description: "Real-time market analysis with ML-powered predictions.",
    author: "0x991a...2b7c",
    rating: 4.8,
    downloads: 892,
    price: 0.5,
    category: "Analytics",
    tags: ["ml", "prediction", "data"],
    featured: false,
  },
  {
    id: "3",
    name: "Sentinel-X",
    subtitle: "Security Guardian",
    description: "MEV protection and sandwich attack prevention for high-value trades.",
    author: "0x3f21...9d1e",
    rating: 4.7,
    downloads: 2156,
    price: 0.3,
    category: "Security",
    tags: ["mev", "protection", "security"],
    featured: false,
  },
  {
    id: "4",
    name: "YieldSensei",
    subtitle: "Auto-Compounding Vault",
    description: "Automated yield farming with impermanent loss hedging.",
    author: "0x8c44...5a2b",
    rating: 4.6,
    downloads: 567,
    price: 0.2,
    category: "DeFi",
    tags: ["yield", "farming", "automation"],
    featured: false,
  },
  {
    id: "5",
    name: "TrendHunter",
    subtitle: "Social Sentiment AI",
    description: "Twitter and Discord sentiment analysis for token trends.",
    author: "0x2a91...7e4c",
    rating: 4.5,
    downloads: 943,
    price: 0.15,
    category: "AI",
    tags: ["sentiment", "social", "trends"],
    featured: false,
  },
  {
    id: "6",
    name: "GasOracle",
    subtitle: "Transaction Optimizer",
    description: "Predict optimal gas prices and transaction timing.",
    author: "0x5d33...1f8a",
    rating: 4.4,
    downloads: 1523,
    price: 0.08,
    category: "Trading",
    tags: ["gas", "optimization", "timing"],
    featured: false,
  },
];

const CATEGORIES = ["All", "DeFi", "AI", "Security", "Analytics", "Trading"];

export default function MarketPage() {
  const { lang } = useLangStore();
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublish, setShowPublish] = useState(false);

  const filteredAgents = MOCK_AGENTS.filter((agent) => {
    const matchesCategory = activeCategory === "All" || agent.category === activeCategory;
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredAgent = MOCK_AGENTS.find(a => a.featured);
  const regularAgents = filteredAgents.filter(a => !a.featured);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <span style={{ 
              color: "#53ddfc", 
              fontSize: "12px", 
              textTransform: "uppercase", 
              letterSpacing: "0.2em",
              display: "block",
              marginBottom: "8px"
            }}>
              Elite Nodes
            </span>
            <h1 style={{ 
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "36px", 
              fontWeight: 700, 
              color: "#dee5ff",
              letterSpacing: "-0.02em"
            }}>
              {t("navMarket", lang)}
            </h1>
          </div>
          <button
            onClick={() => setShowPublish(true)}
            style={{
              background: "linear-gradient(135deg, #8455ef, #ba9eff)",
              color: "#39008c",
              padding: "12px 24px",
              borderRadius: "12px",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Plus style={{ width: "20px", height: "20px" }} />
            Publish Agent
          </button>
        </div>

        {/* Featured Section - Bento Grid */}
        {featuredAgent && (
          <section style={{ marginBottom: "48px" }}>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(12, 1fr)", 
              gap: "24px" 
            }}>
              {/* Large Featured Card */}
              <div style={{ 
                gridColumn: "span 8",
                position: "relative",
                overflow: "hidden",
                borderRadius: "24px",
                padding: "32px",
                minHeight: "400px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                background: "rgba(25, 37, 64, 0.6)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}>
                {/* Background gradient */}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(135deg, rgba(186, 158, 255, 0.2), rgba(83, 221, 252, 0.2))",
                  zIndex: 0
                }} />
                <div style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: "50%",
                  height: "100%",
                  background: "linear-gradient(to left, rgba(186, 158, 255, 0.1), transparent)",
                  zIndex: 0
                }} />
                
                <div style={{ position: "relative", zIndex: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <span style={{
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      background: "rgba(186, 158, 255, 0.2)",
                      color: "#ba9eff",
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em"
                    }}>
                      Protocol Sovereign
                    </span>
                    <div className="agent-pulse" />
                  </div>
                  <h2 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: "48px",
                    fontWeight: 800,
                    color: "#dee5ff",
                    marginBottom: "16px",
                    lineHeight: 1
                  }}>
                    {featuredAgent.name}
                  </h2>
                  <p style={{
                    color: "#a3aac4",
                    maxWidth: "500px",
                    marginBottom: "32px",
                    lineHeight: 1.6
                  }}>
                    {featuredAgent.description}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                    <button style={{
                      background: "linear-gradient(135deg, #8455ef, #ba9eff)",
                      color: "#39008c",
                      padding: "12px 24px",
                      borderRadius: "12px",
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <Zap style={{ width: "16px", height: "16px" }} />
                      Deploy Agent
                    </button>
                    <div>
                      <span style={{
                        fontSize: "10px",
                        color: "#a3aac4",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        display: "block"
                      }}>Efficiency</span>
                      <span style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        color: "#53ddfc",
                        fontWeight: 700
                      }}>{featuredAgent.efficiency}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secondary Trending Card */}
              <div style={{
                gridColumn: "span 4",
                borderRadius: "24px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                background: "#0f1930",
                border: "1px solid rgba(255, 255, 255, 0.05)"
              }}>
                <div style={{
                  height: "192px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #192540, #0f1930)",
                  marginBottom: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <span style={{ fontSize: "48px" }}>🤖</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <h3 style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "#dee5ff"
                    }}>Vortex Analytics</h3>
                    <p style={{ color: "#a3aac4", fontSize: "14px" }}>Predictive Data Modeling</p>
                  </div>
                  <Star style={{ width: "20px", height: "20px", color: "#53ddfc", fill: "#53ddfc" }} />
                </div>
                <div style={{
                  marginTop: "auto",
                  paddingTop: "24px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: "#ba9eff",
                    fontWeight: 700
                  }}>From 12 USDC</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Star style={{ width: "16px", height: "16px", color: "#eab308", fill: "#eab308" }} />
                    <span style={{ color: "#dee5ff", fontWeight: 700 }}>4.9</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Search and Filter */}
        <section style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ position: "relative", width: "100%" }}>
              <Search style={{ 
                position: "absolute", 
                left: "16px", 
                top: "50%", 
                transform: "translateY(-50%)",
                width: "20px",
                height: "20px",
                color: "#6d758c"
              }} />
              <input
                type="text"
                placeholder="Search neural agents by name or capability..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  background: "#060e20",
                  border: "1px solid #40485d",
                  borderRadius: "12px",
                  padding: "14px 16px 14px 48px",
                  color: "#dee5ff",
                  fontSize: "14px",
                  outline: "none"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    whiteSpace: "nowrap",
                    padding: "12px 24px",
                    borderRadius: "12px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 500,
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    transition: "all 0.2s",
                    background: activeCategory === cat ? "#53ddfc" : "#0f1930",
                    color: activeCategory === cat ? "#004b58" : "#a3aac4",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Agent Grid */}
        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "24px"
        }}>
          {regularAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </section>
      </div>

      {/* Publish Modal */}
      {showPublish && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          padding: "16px"
        }}>
          <div style={{
            background: "#0f1930",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "16px",
            padding: "32px",
            width: "100%",
            maxWidth: "512px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "20px",
                fontWeight: 700,
                color: "#dee5ff"
              }}>Publish Agent</h3>
              <button 
                onClick={() => setShowPublish(false)}
                style={{ color: "#6d758c", background: "none", border: "none", cursor: "pointer", fontSize: "24px" }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", color: "#a3aac4", marginBottom: "8px" }}>Agent Name</label>
                <input type="text" style={{
                  width: "100%",
                  background: "#060e20",
                  border: "1px solid #40485d",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  color: "#dee5ff",
                  outline: "none"
                }} placeholder="My Agent" />
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                <button 
                  onClick={() => setShowPublish(false)}
                  style={{
                    flex: 1,
                    background: "#192540",
                    color: "#53ddfc",
                    padding: "12px 24px",
                    borderRadius: "12px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function AgentCard({ agent }: { agent: typeof MOCK_AGENTS[0] }) {
  return (
    <div style={{
      background: "#0f1930",
      borderRadius: "16px",
      padding: "20px",
      border: "1px solid rgba(255, 255, 255, 0.05)",
      transition: "all 0.2s",
      cursor: "pointer"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        <div style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: "#192540",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <span style={{ fontSize: "24px" }}>🤖</span>
        </div>
        <div>
          <h4 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#dee5ff",
            fontWeight: 700,
            fontSize: "16px"
          }}>{agent.name}</h4>
          <p style={{ color: "#a3aac4", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{agent.category}</p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" }}>
          <span style={{ color: "#a3aac4" }}>Reputation</span>
          <div style={{ display: "flex", color: "#eab308" }}>
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                style={{ width: "14px", height: "14px", fill: i < Math.floor(agent.rating) ? "#eab308" : "none" }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" }}>
          <span style={{ color: "#a3aac4" }}>Downloads</span>
          <span style={{ color: "#dee5ff", fontFamily: "monospace" }}>{agent.downloads.toLocaleString()}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          color: "#ba9eff",
          fontWeight: 700
        }}>From {agent.price} USDC</span>
        <button style={{
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          background: "#192540",
          color: "#53ddfc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer"
        }}>
          <Plus style={{ width: "20px", height: "20px" }} />
        </button>
      </div>
    </div>
  );
}
