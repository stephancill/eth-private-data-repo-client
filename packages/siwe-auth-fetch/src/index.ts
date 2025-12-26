import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";

export interface OAuthChallenge {
  realm: string;
  scope: string;
  tokenUri: string;
  chainId: number;
  signingScheme: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface AuthFetchOptions {
  /** Ethereum address for signing */
  address: Address;
  /** Function to sign messages (compatible with viem's walletClient.signMessage) */
  signMessage: (args: { message: string }) => Promise<`0x${string}`>;
  /** Chain ID for SIWE message (default: 1) */
  chainId?: number;
  /** Existing access token to use */
  token?: string;
  /** Callback when a new token is obtained */
  onToken?: (token: string, scope: string) => void;
}

export type AuthRequestInit = RequestInit & AuthFetchOptions;

/**
 * Parse WWW-Authenticate header into structured challenge
 */
export function parseWWWAuthenticateChallenge(
  header: string
): OAuthChallenge | null {
  const params: Record<string, string> = {};
  const regex = /(\w+)="([^"]+)"/g;

  for (const match of header.matchAll(regex)) {
    params[match[1]] = match[2];
  }

  if (!params.realm || !params.scope || !params.token_uri) {
    return null;
  }

  return {
    realm: params.realm,
    scope: params.scope,
    tokenUri: params.token_uri,
    chainId: params.chain_id ? parseInt(params.chain_id, 10) : 1,
    signingScheme: params.signing_scheme || "eip4361",
  };
}

/**
 * Fetch nonce from the authorization server
 */
async function fetchNonce(tokenUri: string): Promise<string> {
  const nonceUrl = tokenUri.replace("/token", "/nonce");
  const response = await fetch(nonceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch nonce: ${response.status}`);
  }
  const data = await response.json();
  return data.nonce;
}

/**
 * Build a SIWE message for OAuth token exchange
 */
function buildSiweMessage(
  address: Address,
  nonce: string,
  scopes: string[],
  uri: string,
  chainId: number
): string {
  const domain = new URL(uri).host;
  const resources = scopes.map((scope) => `urn:oauth:scope:${scope}`);

  return createSiweMessage({
    address,
    chainId,
    domain,
    nonce,
    uri,
    version: "1",
    statement: "Authorize access to your private data.",
    resources,
  });
}

/**
 * Exchange a signed SIWE message for an access token
 */
async function exchangeToken(
  tokenUri: string,
  message: string,
  signature: `0x${string}`,
  scope: string
): Promise<TokenResponse> {
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "eth_signature",
      message,
      signature,
      scope,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Token exchange failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Authenticated fetch that handles SIWE OAuth challenges.
 * Auth options are passed inline with standard fetch options.
 *
 * @example
 * ```ts
 * const response = await authFetch('https://api.example.com/user/0x.../profile', {
 *   address: '0x...',
 *   signMessage: walletClient.signMessage,
 *   token: savedToken,
 *   onToken: (token) => localStorage.setItem('token', token),
 * });
 * const data = await response.json();
 * ```
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: AuthRequestInit
): Promise<Response> {
  const {
    address,
    signMessage,
    chainId = 1,
    token,
    onToken,
    ...fetchInit
  } = init;

  const url = typeof input === "string" ? input : input.toString();

  // Build headers with existing token if available
  const headers = new Headers(fetchInit.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // First attempt
  let response = await fetch(input, { ...fetchInit, headers });

  // Handle 401 with OAuth challenge
  if (response.status === 401) {
    const wwwAuthenticate = response.headers.get("WWW-Authenticate");

    if (!wwwAuthenticate) {
      return response; // No challenge, return as-is
    }

    const challenge = parseWWWAuthenticateChallenge(wwwAuthenticate);

    if (!challenge) {
      return response; // Couldn't parse, return as-is
    }

    if (challenge.signingScheme !== "eip4361") {
      throw new Error(`Unsupported signing scheme: ${challenge.signingScheme}`);
    }

    // Get nonce
    const nonce = await fetchNonce(challenge.tokenUri);

    // Build and sign SIWE message
    const scopes = challenge.scope.split(" ");
    const siweMessage = buildSiweMessage(
      address,
      nonce,
      scopes,
      url,
      challenge.chainId || chainId
    );

    const signature = await signMessage({ message: siweMessage });

    // Exchange for token
    const tokenResponse = await exchangeToken(
      challenge.tokenUri,
      siweMessage,
      signature,
      challenge.scope
    );

    onToken?.(tokenResponse.access_token, tokenResponse.scope);

    // Retry with new token
    const retryHeaders = new Headers(fetchInit.headers);
    retryHeaders.set("Authorization", `Bearer ${tokenResponse.access_token}`);

    response = await fetch(input, { ...fetchInit, headers: retryHeaders });
  }

  return response;
}
