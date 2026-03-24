"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI, PAYMENT_HUB_ABI, USDC_ABI } from "@/lib/contracts";

interface Web3ContextType {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  taskManager: ethers.Contract | null;
  paymentHub: ethers.Contract | null;
  usdc: ethers.Contract | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const Web3Context = createContext<Web3ContextType | null>(null);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [taskManager, setTaskManager] = useState<ethers.Contract | null>(null);
  const [paymentHub, setPaymentHub] = useState<ethers.Contract | null>(null);
  const [usdc, setUsdc] = useState<ethers.Contract | null>(null);

  // Check if already connected
  useEffect(() => {
    const checkConnection = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const ethProvider = new ethers.BrowserProvider((window as any).ethereum);
          // Use eth_accounts instead of listAccounts for better compatibility
          const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            await setupConnection(ethProvider);
          }
        } catch (error) {
          console.error("Failed to check connection:", error);
        }
      }
    };
    checkConnection();
  }, []);

  const setupConnection = async (ethProvider: ethers.BrowserProvider) => {
    const ethSigner = await ethProvider.getSigner();
    const userAddress = await ethSigner.getAddress();
    
    setProvider(ethProvider);
    setSigner(ethSigner);
    setAddress(userAddress);

    // Initialize contracts
    const tm = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI, ethSigner);
    const ph = new ethers.Contract(CONTRACTS.paymentHub, PAYMENT_HUB_ABI, ethSigner);
    const usdcContract = new ethers.Contract(CONTRACTS.usdc, USDC_ABI, ethSigner);

    setTaskManager(tm);
    setPaymentHub(ph);
    setUsdc(usdcContract);
  };

  const connect = async () => {
    setIsConnecting(true);
    try {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const ethProvider = new ethers.BrowserProvider((window as any).ethereum);
        await ethProvider.send("eth_requestAccounts", []);
        await setupConnection(ethProvider);
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

  const disconnect = () => {
    setAddress(null);
    setProvider(null);
    setSigner(null);
    setTaskManager(null);
    setPaymentHub(null);
    setUsdc(null);
  };

  return (
    <Web3Context.Provider
      value={{
        address,
        isConnected: !!address,
        isConnecting,
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
