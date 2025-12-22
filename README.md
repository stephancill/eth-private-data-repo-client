# Private Data Client

A sample client app demonstrating Ethereum signature-based OAuth (EIP-4361/SIWE) to access private data from a protected API.

## Overview

This client implements the discoverable OAuth flow to fetch a user's private messages from the [Private Data Repo](https://github.com/stephancill/eth-private-data-repo).

### How it works

1. User connects their Ethereum wallet
2. Client requests the protected endpoint → receives 401 with `WWW-Authenticate` challenge
3. Client parses the challenge to discover auth requirements (scopes, token URI, chain ID)
4. Client builds a SIWE message with required scopes and requests user signature
5. Client exchanges the signed message for a bearer token
6. Client retries the request with the token

## Setup

```bash
# Install dependencies
bun install

# Start dev server
bun run dev
```

## Configuration

Set `VITE_API_BASE_URL` to point to your Private Data Repo instance:

```bash
VITE_API_BASE_URL=http://localhost:3000 bun run dev
```

Default: `http://localhost:3000`

## Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Lint and format with Biome

## Tech Stack

- React + Vite
- wagmi/viem for Ethereum wallet interactions
- TanStack Query for async state management

## Related

- [Private Data Repo](https://github.com/stephancill/eth-private-data-repo) - The server this client connects to
- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
