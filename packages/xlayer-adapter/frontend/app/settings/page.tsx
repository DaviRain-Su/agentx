"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWeb3 } from "@/components/Web3Provider";
import { useLangStore } from "@/store/lang";
import { DEFAULT_SETTINGS, useAppSettingsStore } from "@/store/settings";
import { ethers } from "ethers";

const RPC_OPTIONS = [
  "https://testrpc.xlayer.tech/terigon",
  "https://xlayertestrpc.okx.com/terigon",
];

const MODEL_OPTIONS = [
  "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "workers-ai/@cf/qwen/qwen2.5-coder-32b-instruct",
  "workers-ai/@cf/deepseek/deepseek-r1-distill-qwen-32b",
];

export default function SettingsPage() {
  const { address, chainId, supportedChainId, supportedNetworkName, isSupportedNetwork, usdc } = useWeb3();
  const { lang, setLang } = useLangStore();
  const {
    rpcEndpoint,
    agentModel,
    defaultBudgetUsdc,
    workerUrl,
    setRpcEndpoint,
    setAgentModel,
    setDefaultBudgetUsdc,
    setWorkerUrl,
    reset,
  } = useAppSettingsStore();

  const [rpcInput, setRpcInput] = useState(rpcEndpoint);
  const [modelInput, setModelInput] = useState(agentModel);
  const [budgetInput, setBudgetInput] = useState(defaultBudgetUsdc);
  const [workerInput, setWorkerInput] = useState(workerUrl);
  const [usdcBalance, setUsdcBalance] = useState<string>("--");
  const [saveHint, setSaveHint] = useState<string>("");

  useEffect(() => {
    setRpcInput(rpcEndpoint);
    setModelInput(agentModel);
    setBudgetInput(defaultBudgetUsdc);
    setWorkerInput(workerUrl);
  }, [agentModel, defaultBudgetUsdc, rpcEndpoint, workerUrl]);

  useEffect(() => {
    const loadBalance = async () => {
      if (!address || !usdc) {
        setUsdcBalance("--");
        return;
      }
      try {
        const [raw, decimals] = await Promise.all([usdc.balanceOf(address), usdc.decimals()]);
        const formatted = Number.parseFloat(ethers.formatUnits(raw, Number(decimals)));
        setUsdcBalance(Number.isFinite(formatted) ? formatted.toFixed(6) : "--");
      } catch {
        setUsdcBalance("--");
      }
    };
    void loadBalance();
  }, [address, usdc]);

  const applySettings = () => {
    setRpcEndpoint(rpcInput);
    setAgentModel(modelInput);
    setDefaultBudgetUsdc(budgetInput);
    setWorkerUrl(workerInput.replace(/\/+$/, ""));
    setSaveHint("Saved");
    setTimeout(() => setSaveHint(""), 1500);
  };

  const resetSettings = () => {
    reset();
    setRpcInput(DEFAULT_SETTINGS.rpcEndpoint);
    setModelInput(DEFAULT_SETTINGS.agentModel);
    setBudgetInput(DEFAULT_SETTINGS.defaultBudgetUsdc);
    setWorkerInput(DEFAULT_SETTINGS.workerUrl);
  };

  const addOrSwitchNetwork = async () => {
    const ethereum = (typeof window !== "undefined" ? (window as any).ethereum : undefined);
    if (!ethereum?.request) return;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x7a0",
        chainName: "X Layer testnet",
        nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
        rpcUrls: RPC_OPTIONS,
        blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"],
      }],
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Configuration</span>
          <h1 className="text-4xl font-light text-white">Settings</h1>
        </div>

        <div className="grid gap-4">
          <div className="border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/50 mb-2">RPC Endpoint</div>
            <select value={rpcInput} onChange={(e) => setRpcInput(e.target.value)} className="w-full bg-black/40 border border-white/20 p-3 text-white">
              {RPC_OPTIONS.map((rpc) => <option key={rpc} value={rpc}>{rpc}</option>)}
            </select>
          </div>

          <div className="border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/50 mb-2">Agent Model</div>
            <select value={modelInput} onChange={(e) => setModelInput(e.target.value)} className="w-full bg-black/40 border border-white/20 p-3 text-white mb-2">
              {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input value={modelInput} onChange={(e) => setModelInput(e.target.value)} className="w-full bg-black/40 border border-white/20 p-3 text-white" />
          </div>

          <div className="border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/50 mb-2">Default Budget (USDC)</div>
            <input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="w-full bg-black/40 border border-white/20 p-3 text-white" />
          </div>

          <div className="border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/50 mb-2">Language</div>
            <select value={lang} onChange={(e) => setLang(e.target.value as "en" | "zh")} className="w-full bg-black/40 border border-white/20 p-3 text-white">
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>

          <div className="border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/50 mb-2">Worker URL (Advanced)</div>
            <input value={workerInput} onChange={(e) => setWorkerInput(e.target.value)} className="w-full bg-black/40 border border-white/20 p-3 text-white" />
          </div>

          <div className="border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/50 mb-3">Wallet Info</div>
            <div className="space-y-2 text-sm">
              <div className="text-white/80">Address: <span className="font-mono">{address || "Not connected"}</span></div>
              <div className="text-white/80">USDC Balance: <span className="font-mono">{usdcBalance}</span></div>
              <div className="text-white/80">Network: <span className={`font-mono ${isSupportedNetwork ? "text-emerald-300" : "text-amber-300"}`}>{chainId || "-"} / {supportedChainId} ({supportedNetworkName})</span></div>
            </div>
            <button onClick={() => void addOrSwitchNetwork()} className="mt-4 px-4 py-2 border border-white/30 text-white/90 hover:bg-white/10 transition">
              Add / Switch to X Layer Testnet
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={applySettings} className="px-5 py-2 bg-white text-black hover:bg-white/90 transition">Save Settings</button>
          <button onClick={resetSettings} className="px-5 py-2 border border-white/20 text-white hover:bg-white/10 transition">Reset</button>
          {saveHint && <span className="text-emerald-300 text-sm">{saveHint}</span>}
        </div>
      </div>
    </DashboardLayout>
  );
}
