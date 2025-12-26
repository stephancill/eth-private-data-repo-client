# SIWE Auth Fetch Specification

A fetch wrapper that automatically handles SIWE (Sign-In with Ethereum) OAuth challenges for accessing protected resources.

## Overview

This package provides a `fetch`-compatible function that:
1. Makes HTTP requests normally
2. On 401 responses with a `WWW-Authenticate` challenge, automatically performs the SIWE OAuth flow
3. Retries the original request with the obtained access token

## Authentication Flow

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Client  │          │  Server  │          │  Wallet  │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │
     │  GET /user/0x.../key                      │
     │────────────────────>│                     │
     │                     │                     │
     │  401 + WWW-Authenticate                   │
     │<────────────────────│                     │
     │                     │                     │
     │  GET /api/auth/nonce                      │
     │────────────────────>│                     │
     │                     │                     │
     │  { nonce: "abc123" }                      │
     │<────────────────────│                     │
     │                     │                     │
     │  Build SIWE message                       │
     │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ >│
     │                     │                     │
     │  signMessage(siwe)                        │
     │─────────────────────────────────────────>│
     │                     │                     │
     │  signature: 0x...                         │
     │<─────────────────────────────────────────│
     │                     │                     │
     │  POST /api/auth/token                     │
     │  { message, signature, scope }            │
     │────────────────────>│                     │
     │                     │                     │
     │  { access_token, expires_in, scope }      │
     │<────────────────────│                     │
     │                     │                     │
     │  GET /user/0x.../key                      │
     │  Authorization: Bearer <token>            │
     │────────────────────>│                     │
     │                     │                     │
     │  200 { data }                             │
     │<────────────────────│                     │
     └                     └                     └
```

## WWW-Authenticate Challenge Format

When a protected resource returns 401, it includes a `WWW-Authenticate` header:

```
WWW-Authenticate: Bearer, realm="kv-profile", scope="profile:read", token_uri="https://api.example.com/api/auth/token", chain_id="1", signing_scheme="eip4361"
```

### Challenge Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `realm` | Yes | Identifier for the protected resource |
| `scope` | Yes | Space-separated OAuth scopes required (e.g., `profile:read settings:read`) |
| `token_uri` | Yes | URL to exchange signature for token |
| `chain_id` | No | Ethereum chain ID (default: 1) |
| `signing_scheme` | No | Must be `eip4361` for SIWE (default: `eip4361`) |

### Parsing

```typescript
function parseWWWAuthenticateChallenge(header: string): OAuthChallenge | null {
  // Match key="value" pairs
  const regex = /(\w+)="([^"]+)"/g;
  // Extract: realm, scope, token_uri, chain_id, signing_scheme
}
```

## SIWE Message Construction

The SIWE message follows [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) format:

```
api.example.com wants you to sign in with your Ethereum account:
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

Authorize access to your private data.

URI: https://api.example.com/user/0x.../profile
Version: 1
Chain ID: 1
Nonce: abc123XYZ
Issued At: 2024-01-01T00:00:00.000Z
Resources:
- urn:oauth:scope:profile:read
```

### Message Fields

| Field | Source | Description |
|-------|--------|-------------|
| `domain` | Extracted from request URL | The host making the request |
| `address` | Provided by caller | User's Ethereum address |
| `statement` | Static | `"Authorize access to your private data."` |
| `uri` | Request URL | The resource being accessed |
| `version` | Static | `"1"` |
| `chainId` | Challenge or default | From `chain_id` param or default 1 |
| `nonce` | Fetched from server | Fresh nonce from `/api/auth/nonce` |
| `resources` | Challenge scope | Scopes as `urn:oauth:scope:{scope}` URNs |

### Nonce Endpoint

The nonce endpoint is derived from `token_uri` by replacing `/token` with `/nonce`:

```
token_uri: https://api.example.com/api/auth/token
nonce_url: https://api.example.com/api/auth/nonce
```

Response:
```json
{ "nonce": "abc123XYZ" }
```

## Token Exchange

After signing, exchange the message and signature for an access token:

### Request

```
POST /api/auth/token
Content-Type: application/json

{
  "grant_type": "eth_signature",
  "message": "<full SIWE message>",
  "signature": "0x...",
  "scope": "profile:read"
}
```

### Response

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "profile:read"
}
```

### Error Response

```json
{
  "error": "invalid_signature"
}
```

## API Design

### `authFetch(input, init)`

Authenticated fetch with auth options inline alongside standard fetch options.

```typescript
interface AuthFetchOptions {
  // Required: Ethereum address for signing
  address: Address;
  
  // Required: Sign message function (viem-compatible)
  signMessage: (args: { message: string }) => Promise<`0x${string}`>;
  
  // Optional: Chain ID for SIWE (default: 1)
  chainId?: number;
  
  // Optional: Pre-existing token to use
  token?: string;
  
  // Optional: Callback when new token obtained
  onToken?: (token: string, scope: string) => void;
}

type AuthRequestInit = RequestInit & AuthFetchOptions;
```

### Usage

```typescript
const response = await authFetch('https://api.example.com/user/0x.../profile', {
  // Auth options
  address: '0x...',
  signMessage: walletClient.signMessage,
  token: savedToken,
  onToken: (token) => localStorage.setItem('token', token),
  // Standard fetch options
  method: 'POST',
  body: JSON.stringify(data),
});

const data = await response.json();
```

The function:
- Conforms to the standard `fetch` API signature
- Returns a standard `Response` object
- Automatically handles 401 challenges
- Calls `onToken` when a new token is obtained

## Error Handling

| Scenario | Behavior |
|----------|----------|
| 401 without `WWW-Authenticate` | Return response as-is |
| Unparseable challenge | Return response as-is |
| Unsupported `signing_scheme` | Throw error |
| Nonce fetch fails | Throw error |
| User rejects signature | Throw error (from `signMessage`) |
| Token exchange fails | Throw error |
| Retry fails after auth | Return response (caller handles) |

## Token Caching

- Token state is managed externally by the caller
- Use `onToken` callback to persist tokens (e.g., localStorage, React state)
- Pass `token` option to use a previously obtained token
- This design gives full control over token lifecycle to the application

## Compatibility

### signMessage Function

Must be compatible with viem's `WalletClient.signMessage`:

```typescript
signMessage: (args: { message: string }) => Promise<`0x${string}`>
```

Works with:
- `walletClient.signMessage` from viem
- `signMessageAsync` from wagmi's `useSignMessage`
- Any function with the same signature

### Browser/Node

- Uses standard `fetch` API
- No Node.js-specific dependencies
- Works in browsers and Node.js 18+

## Security Considerations

1. **Nonce freshness**: Nonces should expire quickly on the server (e.g., 5 minutes)
2. **Scope validation**: Server should validate requested scopes
3. **Token expiry**: Tokens should have reasonable expiry (e.g., 1 hour)
4. **HTTPS**: Always use HTTPS in production
5. **Domain binding**: SIWE message binds to the domain, preventing token reuse across domains

