/** EIP-1193 wallets throw plain objects ({ code, message, data }), not Error instances. */
type ProviderError = { code?: unknown; message?: unknown; data?: { originalError?: { code?: unknown; message?: unknown }; message?: unknown }; cause?: unknown };

/** The innermost provider error code, including codes wrapped in a -32603 internal error. */
export function walletErrorCode(error: unknown): number | undefined {
  const e = error as ProviderError | undefined;
  const inner = e?.data?.originalError?.code ?? (e?.cause as ProviderError | undefined)?.code;
  if (typeof inner === "number") return inner;
  return typeof e?.code === "number" ? e.code : undefined;
}

/** The wallet does not know this chain yet; it must be added before switching. */
export function isUnknownChain(error: unknown) {
  if (walletErrorCode(error) === 4902) return true;
  const text = walletErrorText(error).toLowerCase();
  return /unrecognized chain|unknown chain|chain .*not (been )?added|try adding the chain/.test(text);
}

/** Readable text for any thrown value: never "[object Object]". */
export function walletErrorText(error: unknown): string {
  const code = walletErrorCode(error);
  if (code === 4001) return "The request was rejected in the wallet. Nothing was sent.";
  if (code === -32002) return "The wallet already has a request waiting. Open the wallet extension and answer it, then try again.";
  if (error instanceof Error) return error.message;
  const e = error as ProviderError | undefined;
  const message = [e?.data?.originalError?.message, e?.data?.message, e?.message].find(m => typeof m === "string" && m.length > 0) as string | undefined;
  if (message) return code === undefined ? message : `${message} (wallet error ${code})`;
  if (typeof error === "string") return error;
  try { return `Wallet error: ${JSON.stringify(error)}`; } catch { return "Unknown wallet error."; }
}
