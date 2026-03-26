"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI, PAYMENT_HUB_ABI, USDC_ABI } from "@/lib/contracts";

export type WalletType = "okx" | "metamask" | "walletconnect" | null;

export interface WalletInfo {
  id: WalletType;
  name: string;
  icon: string;
  isInstalled: boolean;
  downloadUrl: string;
}

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
  activeWallet: WalletType;
  wallets: WalletInfo[];
  showWalletModal: boolean;
  connect: (walletType?: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  openWalletModal: () => void;
  closeWalletModal: () => void;
}

const Web3Context = createContext<Web3ContextType | null>(null);

const SUPPORTED_NETWORK = {
  chainId: 195,
  name: "X Layer Testnet",
  nativeToken: "OKB",
} as const;

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isOKXWallet?: boolean;
  providers?: InjectedProvider[];
};

declare global {
  interface Window {
    okxwallet?: InjectedProvider;
    ethereum?: InjectedProvider;
  }
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [activeWallet, setActiveWallet] = useState<WalletType>(null);
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

  // Check which wallets are installed
  const checkWallets = useCallback((): WalletInfo[] => {
    if (typeof window === "undefined") return [];
    
    const wallets: WalletInfo[] = [];
    
    // Check OKX Wallet
    const hasOKX = !!window.okxwallet || !!(window.ethereum?.isOKXWallet);
    wallets.push({
      id: "okx",
      name: "OKX Wallet",
      icon: "🔵",
      isInstalled: hasOKX,
      downloadUrl: "https://www.okx.com/web3",
    });
    
    // Check MetaMask
    const hasMetaMask = !!window.ethereum?.isMetaMask;
    wallets.push({
      id: "metamask",
      name: "MetaMask",
      icon: "🦊",
      isInstalled: hasMetaMask,
      downloadUrl: "https://metamask.io/download/",
    });
    
    return wallets;
  }, []);

  const [wallets, setWallets] = useState<WalletInfo[]>([]);

  // Update wallet list on mount
  useEffect(() => {
    setWallets(checkWallets());
    
    // Re-check when window gains focus (user might have installed wallet)
    const handleFocus = () => setWallets(checkWallets());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checkWallets]);

  const safeContract = useCallback((address: string, abi: any, signer: ethers.JsonRpcSigner): ethers.Contract | null => {
    try {
      if (!ethers.isAddress(address) || address === ethers.ZeroAddress) return null;
      return new ethers.Contract(address, abi, signer);
    } catch (error) {
      console.error("Failed to create contract instance:", error);
      return null;
    }
  }, []);

  const getProvider = useCallback((walletType: WalletType): InjectedProvider | null => {
    if (typeof window === "undefined") return null;
    
    switch (walletType) {
      case "okx":
        // OKX Wallet can be in window.okxwallet or window.ethereum (if OKX is the default)
        return window.okxwallet || (window.ethereum?.isOKXWallet ? window.ethereum : null);
      case "metamask":
        // MetaMask can be in window.ethereum or in providers array
        if (window.ethereum?.providers) {
          return window.ethereum.providers.find((p) => p.isMetaMask) || window.ethereum;
        }
        return window.ethereum?.isMetaMask ? window.ethereum : null;
      default:
        // Auto-detect: prefer OKX, then MetaMask
        if (window.okxwallet || window.ethereum?.isOKXWallet) {
          return window.okxwallet || window.ethereum || null;
        }
        if (window.ethereum?.isMetaMask) {
          return window.ethereum;
        }
        return window.ethereum || null;
    }
  }, []);

  const clearConnection = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setTaskManager(null);
    setPaymentHub(null);
    setUsdc(null);
    setActiveWallet(null);
  }, []);

  const setupConnection = useCallback(async (ethProvider: ethers.BrowserProvider, walletType: WalletType, account?: string) => {
    const ethSigner = account ? await ethProvider.getSigner(account) : await ethProvider.getSigner();
    const userAddress = await ethSigner.getAddress();
    const network = await ethProvider.getNetwork();

    setProvider(ethProvider);
    setSigner(ethSigner);
    setAddress(userAddress);
    setChainId(Number(network.chainId));
    setActiveWallet(walletType);

    // Initialize contracts
    const tm = safeContract(CONTRACTS.taskManager, TASK_MANAGER_ABI, ethSigner);
    const ph = safeContract(CONTRACTS.paymentHub, PAYMENT_HUB_ABI, ethSigner);
    const usdcContract = safeContract(CONTRACTS.usdc, USDC_ABI, ethSigner);

    setTaskManager(tm);
    setPaymentHub(ph);
    setUsdc(usdcContract);
  }, [safeContract]);

  const connect = useCallback(async (walletType?: WalletType) => {
    setIsConnecting(true);
    setShowWalletModal(false);
    
    try {
      // If no wallet type specified and we have multiple options, show modal
      if (!walletType) {
        const availableWallets = checkWallets().filter(w => w.isInstalled);
        if (availableWallets.length === 0) {
          throw new Error("No wallet found. Please install OKX Wallet or MetaMask.");
        }
        if (availableWallets.length === 1) {
          walletType = availableWallets[0].id;
        } else {
          // Multiple wallets available, show selection modal
          setShowWalletModal(true);
          setIsConnecting(false);
          return;
        }
      }

      const injectedProvider = getProvider(walletType);
      if (!injectedProvider) {
        const walletName = walletType === "okx" ? "OKX Wallet" : "MetaMask";
        throw new Error(`${walletName} not found. Please install it first.`);
      }

      const ethProvider = new ethers.BrowserProvider(injectedProvider as any);
      const accounts = await ethProvider.send("eth_requestAccounts", []) as string[];
      
      setManuallyDisconnected(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("web3_manual_disconnect");
        window.localStorage.setItem("web3_last_wallet", walletType || "");
      }
      
      await setupConnection(ethProvider, walletType || "metamask", accounts?.[0]);
    } catch (error) {
      console.error("Failed to connect:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [checkWallets, getProvider, setupConnection]);

  // Check if already connected on mount
  useEffect(() => {
    if (manuallyDisconnected) return;
    
    const checkConnection = async () => {
      // Try to restore last used wallet
      const lastWallet = typeof window !== "undefined" 
        ? window.localStorage.getItem("web3_last_wallet") as WalletType 
        : null;
      
      const injectedProvider = getProvider(lastWallet);
      if (!injectedProvider) return;
      
      try {
        const ethProvider = new ethers.BrowserProvider(injectedProvider as any);
        const accounts = await injectedProvider.request({ method: "eth_accounts" }) as string[];
        if (accounts && accounts.length > 0) {
          await setupConnection(ethProvider, lastWallet || "metamask", accounts[0]);
        }
      } catch (error) {
        console.error("Failed to restore connection:", error);
      }
    };
    
    void checkConnection();
  }, [manuallyDisconnected, getProvider, setupConnection]);

  // Listen for wallet events
  useEffect(() => {
    if (manuallyDisconnected || !activeWallet) return;
    
    const injectedProvider = getProvider(activeWallet);
    if (!injectedProvider?.on) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        clearConnection();
        return;
      }
      try {
        const ethProvider = new ethers.BrowserProvider(injectedProvider as any);
        await setupConnection(ethProvider, activeWallet, accounts[0]);
      } catch (error) {
        console.error("Failed to handle account switch:", error);
        clearConnection();
      }
    };

    const handleChainChanged = async () => {
      try {
        const ethProvider = new ethers.BrowserProvider(injectedProvider as any);
        const accounts = await injectedProvider.request({ method: "eth_accounts" }) as string[];
        if (accounts && accounts.length > 0) {
          await setupConnection(ethProvider, activeWallet, accounts[0]);
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

    injectedProvider.on("accountsChanged", handleAccountsChanged);
    injectedProvider.on("chainChanged", handleChainChanged);
    injectedProvider.on("disconnect", handleDisconnect);

    return () => {
      injectedProvider.removeListener?.("accountsChanged", handleAccountsChanged);
      injectedProvider.removeListener?.("chainChanged", handleChainChanged);
      injectedProvider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [activeWallet, clearConnection, getProvider, manuallyDisconnected, setupConnection]);

  const disconnect = useCallback(async () => {
    const injectedProvider = activeWallet ? getProvider(activeWallet) : null;
    try {
      await injectedProvider?.request?.({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Some wallets do not support revokePermissions
    }
    setManuallyDisconnected(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("web3_manual_disconnect", "1");
      window.localStorage.removeItem("web3_last_wallet");
    }
    clearConnection();
  }, [activeWallet, clearConnection, getProvider]);

  const openWalletModal = useCallback(() => {
    setShowWalletModal(true);
  }, []);

  const closeWalletModal = useCallback(() => {
    setShowWalletModal(false);
    setIsConnecting(false);
  }, []);

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
        activeWallet,
        wallets,
        showWalletModal,
        connect,
        disconnect,
        openWalletModal,
        closeWalletModal,
      }}
    >
      {children}
      {showWalletModal && <WalletSelectorModal />}
    </Web3Context.Provider>
  );
}

// Wallet Selector Modal Component
function WalletSelectorModal() {
  const { wallets, connect, closeWalletModal, isConnecting } = useWeb3();
  const [pendingWallet, setPendingWallet] = useState<WalletType>(null);

  const handleSelect = async (walletId: WalletType) => {
    if (!walletId) return;
    setPendingWallet(walletId);
    try {
      await connect(walletId);
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setPendingWallet(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWalletModal();
      }}
    >
      <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-light text-white">Connect Wallet</h2>
            <p className="text-xs text-white/40 mt-1">Select a wallet to connect to X Layer</p>
          </div>
          <button 
            onClick={closeWalletModal}
            className="text-white/40 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Wallet Options */}
        <div className="p-6 space-y-3">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => wallet.isInstalled && handleSelect(wallet.id)}
              disabled={!wallet.isInstalled || isConnecting}
              className={`w-full flex items-center gap-4 p-4 border transition-all ${
                wallet.isInstalled
                  ? "border-white/20 hover:border-white/40 hover:bg-white/5 cursor-pointer"
                  : "border-white/10 opacity-50 cursor-not-allowed"
              }`}
            >
              <span className="text-2xl">{wallet.icon}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-medium">{wallet.name}</p>
                <p className="text-xs text-white/40">
                  {wallet.isInstalled 
                    ? "Click to connect" 
                    : `Not installed • `}
                  {!wallet.isInstalled && (
                    <a 
                      href={wallet.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Download
                    </a>
                  )}
                </p>
              </div>
              {pendingWallet === wallet.id ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : wallet.isInstalled ? (
                <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          ))}

          {wallets.length === 0 && (
            <div className="text-center py-8 text-white/40">
              <p className="mb-4">No wallets detected</p>
              <div className="space-y-2">
                <a
                  href="https://www.okx.com/web3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition"
                >
                  Install OKX Wallet
                </a>
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30 transition"
                >
                  Install MetaMask
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <p className="text-xs text-white/30 text-center">
            By connecting, you agree to the terms of service
          </p>
        </div>
      </div>
    </div>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within Web3Provider");
  }
  return context;
}
