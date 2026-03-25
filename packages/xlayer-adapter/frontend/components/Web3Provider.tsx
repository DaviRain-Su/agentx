"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI, PAYMENT_HUB_ABI, USDC_ABI } from "@/lib/contracts";

interface Web3ContextType {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  supportedChainId: number;
  supportedNetworkName: string;
  supportedNativeToken: string;
  isSupportedNetwork: boolean;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  taskManager: ethers.Contract | null;
  paymentHub: ethers.Contract | null;
  usdc: ethers.Contract | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | null>(null);
const SUPPORTED_NETWORK = {
  chainId: 1952,
  name: "X Layer Testnet",
  nativeToken: "OKB",
} as const;

type InjectedEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  providers?: InjectedEthereum[];
};

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);
  const [manuallyDisconnected, setManuallyDisconnected] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("web3_manual_disconnect") === "1";
  });
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [taskManager, setTaskManager] = useState<ethers.Contract | null>(null);
  const [paymentHub, setPaymentHub] = useState<ethers.Contract | null>(null);
  const [usdc, setUsdc] = useState<ethers.Contract | null>(null);

  const safeContract = useCallback((address: string, abi: any, signer: ethers.JsonRpcSigner): ethers.Contract | null => {
    try {
      if (!ethers.isAddress(address) || address === ethers.ZeroAddress) return null;
      return new ethers.Contract(address, abi, signer);
    } catch (error) {
      console.error("Failed to create contract instance:", error);
      return null;
    }
  }, []);

  const getInjectedEthereum = useCallback((): InjectedEthereum | null => {
    if (typeof window === "undefined") return null;
    const ethereum = (window as any).ethereum as InjectedEthereum | undefined;
    if (!ethereum) return null;
    const providers = ethereum.providers;
    if (providers && providers.length > 0) {
      const metamask = providers.find((p) => p?.isMetaMask);
      return metamask || providers[0] || ethereum;
    }
    return ethereum;
  }, []);

  const clearConnection = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setTaskManager(null);
    setPaymentHub(null);
    setUsdc(null);
  }, []);

  const setupConnection = useCallback(async (ethProvider: ethers.BrowserProvider, account?: string) => {
    const ethSigner = account ? await ethProvider.getSigner(account) : await ethProvider.getSigner();
    const userAddress = await ethSigner.getAddress();
    const network = await ethProvider.getNetwork();

    setProvider(ethProvider);
    setSigner(ethSigner);
    setAddress(userAddress);
    setChainId(Number(network.chainId));

    // Initialize contracts (best-effort; wallet address should still update even if a contract address is invalid)
    const tm = safeContract(CONTRACTS.taskManager, TASK_MANAGER_ABI, ethSigner);
    const ph = safeContract(CONTRACTS.paymentHub, PAYMENT_HUB_ABI, ethSigner);
    const usdcContract = safeContract(CONTRACTS.usdc, USDC_ABI, ethSigner);

    setTaskManager(tm);
    setPaymentHub(ph);
    setUsdc(usdcContract);
  }, [safeContract]);

  // Check if already connected
  useEffect(() => {
    if (manuallyDisconnected) return;
    const checkConnection = async () => {
      const ethereum = getInjectedEthereum();
      if (!ethereum) return;
      try {
        const ethProvider = new ethers.BrowserProvider(ethereum as any);
        const accounts = await ethereum.request({ method: "eth_accounts" }) as string[];
        if (accounts && accounts.length > 0) {
          await setupConnection(ethProvider, accounts[0]);
        } else {
          clearConnection();
        }
      } catch (error) {
        console.error("Failed to check connection:", error);
      }
    };
    void checkConnection();
  }, [clearConnection, getInjectedEthereum, manuallyDisconnected, setupConnection]);

  // React to wallet/account/network changes in MetaMask/OKX Wallet.
  useEffect(() => {
    if (manuallyDisconnected) return;
    const ethereum = getInjectedEthereum();
    if (!ethereum?.on) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        clearConnection();
        return;
      }
      try {
        const ethProvider = new ethers.BrowserProvider(ethereum as any);
        await setupConnection(ethProvider, accounts[0]);
      } catch (error) {
        console.error("Failed to handle account switch:", error);
        clearConnection();
      }
    };

    const handleChainChanged = async () => {
      try {
        const ethProvider = new ethers.BrowserProvider(ethereum as any);
        const accounts = await ethereum.request({ method: "eth_accounts" }) as string[];
        if (accounts && accounts.length > 0) {
          await setupConnection(ethProvider, accounts[0]);
        } else {
          clearConnection();
        }
      } catch (error) {
        console.error("Failed to handle chain switch:", error);
        clearConnection();
      }
    };

    const handleDisconnect = () => {
      clearConnection();
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    ethereum.on("disconnect", handleDisconnect);

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
      ethereum.removeListener?.("disconnect", handleDisconnect);
    };
  }, [clearConnection, getInjectedEthereum, manuallyDisconnected, setupConnection]);

  // Extra guard: poll connected accounts so wallet UI changes are reflected even if provider events are flaky.
  useEffect(() => {
    if (manuallyDisconnected) return;
    const ethereum = getInjectedEthereum();
    if (!ethereum) return;

    let cancelled = false;
    const syncAccount = async () => {
      if (cancelled) return;
      try {
        const accounts = await ethereum.request({ method: "eth_accounts" }) as string[];
        if (!accounts || accounts.length === 0) {
          if (address) clearConnection();
          return;
        }
        const next = accounts[0].toLowerCase();
        const current = address?.toLowerCase();
        if (next !== current) {
          const ethProvider = new ethers.BrowserProvider(ethereum as any);
          await setupConnection(ethProvider, accounts[0]);
        }
      } catch (error) {
        console.error("Failed to sync wallet account:", error);
      }
    };

    const id = window.setInterval(() => { void syncAccount(); }, 1500);
    void syncAccount();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [address, clearConnection, getInjectedEthereum, manuallyDisconnected, setupConnection]);

  const connect = async () => {
    setIsConnecting(true);
    try {
      const ethereum = getInjectedEthereum();
      if (ethereum) {
        const ethProvider = new ethers.BrowserProvider(ethereum as any);
        const accounts = await ethProvider.send("eth_requestAccounts", []) as string[];
        setManuallyDisconnected(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("web3_manual_disconnect");
        }
        await setupConnection(ethProvider, accounts?.[0]);
      } else {
        throw new Error("No wallet found. Please install MetaMask or OKX Wallet.");
      }
    } catch (error) {
      console.error("Failed to connect:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    const ethereum = getInjectedEthereum();
    try {
      await ethereum?.request?.({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Some wallets do not support revokePermissions; local app disconnect still applies.
    }
    setManuallyDisconnected(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("web3_manual_disconnect", "1");
    }
    clearConnection();
  };

  return (
    <Web3Context.Provider
      value={{
        address,
        isConnected: !!address,
        isConnecting,
        chainId,
        supportedChainId: SUPPORTED_NETWORK.chainId,
        supportedNetworkName: SUPPORTED_NETWORK.name,
        supportedNativeToken: SUPPORTED_NETWORK.nativeToken,
        isSupportedNetwork: chainId === SUPPORTED_NETWORK.chainId,
        provider,
        signer,
        taskManager,
        paymentHub,
        usdc,
        connect,
        disconnect,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within Web3Provider");
  }
  return context;
}
