import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { fetchWithOAuth, getAuthorMessagesUrl } from "./oauth";

export interface Message {
	id: number;
	content: string;
	author: string;
	created_at: string;
	updated_at: string;
}

export interface AuthorMessagesResponse {
	author: string;
	messages: Message[];
}

interface UseAuthorMessagesOptions {
	/** Whether to automatically fetch on mount (requires prior authorization) */
	autoFetch?: boolean;
}

export function useAuthorMessages(options: UseAuthorMessagesOptions = {}) {
	const { autoFetch = false } = options;
	const { address, isConnected } = useAccount();
	const { signMessageAsync } = useSignMessage();
	const queryClient = useQueryClient();

	// Store the access token in state (could also use localStorage for persistence)
	const [accessToken, setAccessToken] = useState<string | undefined>();
	const [authError, setAuthError] = useState<string | undefined>();

	// Sign message callback for OAuth flow
	const signMessage = useCallback(
		async (message: string): Promise<`0x${string}`> => {
			return signMessageAsync({ message });
		},
		[signMessageAsync],
	);

	// Query for fetching messages (only runs when we have a token or autoFetch is true)
	const messagesQuery = useQuery({
		queryKey: ["authorMessages", address],
		queryFn: async () => {
			if (!address) throw new Error("No address connected");

			const url = getAuthorMessagesUrl(address);
			const result = await fetchWithOAuth<AuthorMessagesResponse>(
				url,
				signMessage,
				address,
				accessToken,
			);

			// Store the token for future requests
			if (result.token) {
				setAccessToken(result.token);
			}

			return result.data;
		},
		enabled: isConnected && !!address && (autoFetch || !!accessToken),
		retry: false,
		staleTime: 30000, // 30 seconds
	});

	// Mutation for triggering the OAuth flow manually
	const authorizeMutation = useMutation({
		mutationFn: async () => {
			if (!address) throw new Error("No address connected");

			setAuthError(undefined);
			const url = getAuthorMessagesUrl(address);

			const result = await fetchWithOAuth<AuthorMessagesResponse>(
				url,
				signMessage,
				address,
			);

			// Store the token
			setAccessToken(result.token);

			return result.data;
		},
		onSuccess: (data) => {
			// Update the query cache with the fetched data
			queryClient.setQueryData(["authorMessages", address], data);
		},
		onError: (error) => {
			setAuthError(
				error instanceof Error ? error.message : "Authorization failed",
			);
		},
	});

	// Function to trigger authorization and fetch
	const authorize = useCallback(() => {
		authorizeMutation.mutate();
	}, [authorizeMutation]);

	// Function to refresh data (uses existing token)
	const refresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ["authorMessages", address] });
	}, [queryClient, address]);

	// Clear authorization
	const clearAuth = useCallback(() => {
		setAccessToken(undefined);
		setAuthError(undefined);
		queryClient.removeQueries({ queryKey: ["authorMessages", address] });
	}, [queryClient, address]);

	return {
		// Data
		messages: messagesQuery.data?.messages ?? [],
		author: messagesQuery.data?.author,

		// Auth state
		isAuthorized: !!accessToken,
		isAuthorizing: authorizeMutation.isPending,
		authError,

		// Query state
		isLoading: messagesQuery.isLoading,
		isFetching: messagesQuery.isFetching,
		error: messagesQuery.error,

		// Actions
		authorize,
		refresh,
		clearAuth,
	};
}
