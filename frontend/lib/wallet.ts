"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";

const network = (process.env.NEXT_PUBLIC_NETWORK || "mainnet").toLowerCase() === "testnet" ? "testnet" : "mainnet";
const mainnetRpcUrls = ["https://rpc1mainnet.qie.digital", "https://rpc2mainnet.qie.digital", "https://rpc3mainnet.qie.digital", "https://rpc4mainnet.qie.digital", "https://rpc5mainnet.qie.digital"] as const;
const testnetRpcUrls = ["https://rpc2testnet.qie.digital"] as const;
export const qieMainnet = { id: 1990, name: "QIE Blockchain Mainnet", nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 }, rpcUrls: { default: { http: mainnetRpcUrls }, public: { http: mainnetRpcUrls } }, blockExplorers: { default: { name: "QIE Explorer", url: "https://mainnet.qie.digital" } } } as const;
export const qieTestnet = { id: 1983, name: "QIE Blockchain Testnet", nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 }, rpcUrls: { default: { http: testnetRpcUrls }, public: { http: testnetRpcUrls } }, blockExplorers: { default: { name: "QIE Testnet Explorer", url: "https://testnet.qie.digital" } } } as const;
export const qieChain = network === "testnet" ? qieTestnet : qieMainnet;
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || qieChain.rpcUrls.default.http[0];
export const publicClient = createPublicClient({ chain: qieChain, transport: http(rpcUrl) });
export const shortAddress = (address?: string) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

declare global { interface Window { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } } }

type WalletError = { code?: number | string; message?: string; data?: { message?: string } };
export function walletErrorMessage(error: unknown) {
  const cause = error as WalletError | undefined;
  const raw = cause?.data?.message || cause?.message || (typeof error === "string" ? error : "");
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (/user rejected|user denied|rejected the request/i.test(message)) return "Wallet request was rejected. Approve the QIE Mainnet connection in QIE Wallet to continue.";
  if (/already pending/i.test(message)) return "A wallet request is already pending. Open QIE Wallet and finish or reject it before trying again.";
  return message || "QIE Wallet could not complete the request. Check that the wallet is unlocked and QIE Mainnet is enabled.";
}

function shouldAddNetwork(error: unknown) {
  const cause = error as WalletError | undefined;
  const message = `${cause?.message || ""} ${cause?.data?.message || ""}`.toLowerCase();
  return cause?.code === 4902 || cause?.code === -32603 && /chain|network|unknown|not found|unsupported|unrecognized/.test(message);
}

async function ensureQieNetwork(chainId: string) {
  if (!window.ethereum) throw new Error("Install or open QIE Wallet to continue.");
  const parsedChainId = Number.parseInt(chainId, 16);
  const isExpectedNetwork = parsedChainId === qieChain.id;
  if (isExpectedNetwork) return;
  const targetChainId = `0x${qieChain.id.toString(16)}`;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: targetChainId }] });
  } catch (error) {
    if (!shouldAddNetwork(error)) throw new Error(`Please switch QIE Wallet to ${qieChain.name} (chain ID ${qieChain.id}), then try again. ${walletErrorMessage(error)}`);
    try {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: targetChainId, chainName: qieChain.name, nativeCurrency: qieChain.nativeCurrency, rpcUrls: [...qieChain.rpcUrls.default.http], blockExplorerUrls: [qieChain.blockExplorers.default.url] }] });
    } catch (addError) {
      throw new Error(`QIE ${network === "testnet" ? "Testnet" : "Mainnet"} could not be added automatically. Add chain ID ${qieChain.id} manually in QIE Wallet and try again. ${walletErrorMessage(addError)}`);
    }
  }
}

export function useQieWallet() {
  const [address, setAddress] = useState<Address>(); const [chainId, setChainId] = useState<number>(); const [connecting, setConnecting] = useState(false);
  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error("Install or open QIE Wallet to continue.");
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.[0]) throw new Error("QIE Wallet did not return an account. Unlock the wallet and approve the connection.");
      const chain = await window.ethereum.request({ method: "eth_chainId" }) as string;
      await ensureQieNetwork(chain);
      const finalChain = await window.ethereum.request({ method: "eth_chainId" }) as string;
      const finalChainId = Number.parseInt(finalChain, 16);
      if (finalChainId !== qieChain.id) throw new Error(`Wrong network selected. Choose ${qieChain.name} (chain ID ${qieChain.id}) in QIE Wallet.`);
      setAddress(accounts[0] as Address); setChainId(finalChainId);
    } catch (error) { throw new Error(walletErrorMessage(error), { cause: error }); }
    finally { setConnecting(false); }
  }, []);
  useEffect(() => { if (!window.ethereum) return; window.ethereum.request({ method: "eth_accounts" }).then((a) => { const accounts = a as string[]; if (accounts[0]) setAddress(accounts[0] as Address); }).catch(() => undefined); }, []);
  const walletClient = address && window.ethereum ? createWalletClient({ account: address, chain: qieChain, transport: custom(window.ethereum) }) : undefined;
  return { address, chainId, connecting, connect, walletClient, isWrongNetwork: Boolean(chainId && chainId !== qieChain.id) };
}
