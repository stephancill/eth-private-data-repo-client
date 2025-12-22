import { createSiweMessage } from "viem/siwe";
import type { Address } from "viem";

// Configuration
const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const CHAIN_ID = 1; // Mainnet

/**
 * Parsed WWW-Authenticate challenge from a 401 response
 */
export interface OAuthChallenge {
	realm: string;
	scope: string;
	tokenUri: string;
	chainId: number;
	signingScheme: string;
}

/**
 * Token response from the authorization server
 */
export interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
}

/**
 * Parse WWW-Authenticate header into structured challenge
 */
export function parseWWWAuthenticateChallenge(
	header: string,
): OAuthChallenge | null {
	// Parse Bearer scheme with parameters
	// Format: Bearer, realm="...", scope="...", token_uri="...", chain_id="...", signing_scheme="..."
	const params: Record<string, string> = {};

	// Match key="value" pairs
	const regex = /(\w+)="([^"]+)"/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(header)) !== null) {
		params[match[1]] = match[2];
	}

	if (!params.realm || !params.scope || !params.token_uri) {
		return null;
	}

	return {
		realm: params.realm,
		scope: params.scope,
		tokenUri: params.token_uri,
		chainId: params.chain_id ? parseInt(params.chain_id, 10) : CHAIN_ID,
		signingScheme: params.signing_scheme || "eip4361",
	};
}

/**
 * Build a SIWE message for OAuth token exchange
 */
export function buildSiweMessage(
	address: Address,
	nonce: string,
	scopes: string[],
	uri: string,
): string {
	const domain = new URL(uri).host;

	// Build resources array with OAuth scope URNs
	const resources = scopes.map((scope) => `urn:oauth:scope:${scope}`);

	const message = createSiweMessage({
		address,
		chainId: CHAIN_ID,
		domain,
		nonce,
		uri,
		version: "1",
		statement: "Authorize access to your private data.",
		resources,
	});

	return message;
}

/**
 * Fetch a nonce from the authorization server
 */
export async function fetchNonce(tokenUri: string): Promise<string> {
	// Derive nonce endpoint from token_uri (same base path)
	const baseUrl = tokenUri.replace("/token", "");
	const nonceUrl = `${baseUrl}/nonce`;

	const response = await fetch(nonceUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch nonce: ${response.status}`);
	}

	const data = await response.json();
	return data.nonce;
}

/**
 * Exchange a signed SIWE message for an access token
 */
export async function exchangeToken(
	tokenUri: string,
	message: string,
	signature: `0x${string}`,
	scope: string,
): Promise<TokenResponse> {
	const response = await fetch(tokenUri, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			grant_type: "eth_signature",
			message,
			signature,
			scope,
		}),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `Token exchange failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Make an authenticated request, handling 401 challenges automatically
 */
export async function fetchWithOAuth<T>(
	url: string,
	signMessage: (message: string) => Promise<`0x${string}`>,
	address: Address,
	existingToken?: string,
): Promise<{ data: T; token: string }> {
	const headers: Record<string, string> = {};

	if (existingToken) {
		headers.Authorization = `Bearer ${existingToken}`;
	}

	// First attempt
	let response = await fetch(url, { headers });

	// If we get a 401, handle the OAuth challenge
	if (response.status === 401) {
		const wwwAuthenticate = response.headers.get("WWW-Authenticate");

		if (!wwwAuthenticate) {
			throw new Error("Missing WWW-Authenticate header in 401 response");
		}

		const challenge = parseWWWAuthenticateChallenge(wwwAuthenticate);

		if (!challenge) {
			throw new Error("Failed to parse WWW-Authenticate challenge");
		}

		if (challenge.signingScheme !== "eip4361") {
			throw new Error(
				`Unsupported signing scheme: ${challenge.signingScheme}`,
			);
		}

		// Get a fresh nonce
		const nonce = await fetchNonce(challenge.tokenUri);

		// Build the SIWE message with required scopes
		const scopes = challenge.scope.split(" ");
		const siweMessage = buildSiweMessage(address, nonce, scopes, url);

		// Request user signature
		const signature = await signMessage(siweMessage);

		// Exchange for token
		const tokenResponse = await exchangeToken(
			challenge.tokenUri,
			siweMessage,
			signature,
			challenge.scope,
		);

		// Retry with the new token
		response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${tokenResponse.access_token}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Request failed after auth: ${response.status}`);
		}

		const data = await response.json();
		return { data, token: tokenResponse.access_token };
	}

	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}

	const data = await response.json();
	return { data, token: existingToken || "" };
}

/**
 * Build the URL for fetching an author's messages
 */
export function getAuthorMessagesUrl(address: Address): string {
	return `${API_BASE_URL}/api/authors/${address.toLowerCase()}/messages`;
}

