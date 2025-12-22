import {
	useAccount,
	useConnect,
	useConnectors,
	useDisconnect,
} from "wagmi";
import { useAuthorMessages } from "./useAuthorMessages";

function WalletConnection() {
	const { address, isConnected } = useAccount();
	const { connect, status, error } = useConnect();
	const connectors = useConnectors();
	const { disconnect } = useDisconnect();

	if (isConnected && address) {
		return (
			<div>
				<div>
					<span className="status-dot" />
					Connected
				</div>
				<div className="wallet-address">{formatAddress(address)}</div>
				<button type="button" onClick={() => disconnect()}>
					Disconnect
				</button>
			</div>
		);
	}

	return (
		<div>
			<h2>Connect Wallet</h2>
			<div>
				{connectors.map((connector) => (
					<button
						key={connector.uid}
						onClick={() => connect({ connector })}
						type="button"
						disabled={status === "pending"}
					>
						{connector.name}
					</button>
				))}
			</div>
			{status === "pending" && <p>Connecting...</p>}
			{error && <p className="error">{error.message}</p>}
		</div>
	);
}

function PrivateMessages() {
	const { address, isConnected } = useAccount();
	const {
		messages,
		isAuthorized,
		isAuthorizing,
		authError,
		isLoading,
		isFetching,
		error,
		authorize,
		refresh,
		clearAuth,
	} = useAuthorMessages();

	if (!isConnected || !address) {
		return null;
	}

	if (!isAuthorized) {
		return (
			<div>
				<h2>Your Private Messages</h2>
				<p>Authorize access to view your messages from the private data server.</p>

				<button type="button" onClick={authorize} disabled={isAuthorizing}>
					{isAuthorizing ? "Waiting for signature..." : "Authorize & Fetch Messages"}
				</button>

				{authError && <p className="error">{authError}</p>}
			</div>
		);
	}

	return (
		<div>
			<h2>Your Private Messages</h2>
			<div>
				<button type="button" onClick={refresh} disabled={isFetching}>
					{isFetching ? "Refreshing..." : "Refresh"}
				</button>
				<button type="button" onClick={clearAuth}>
					Clear Auth
				</button>
			</div>

			{isLoading && <p>Loading messages...</p>}
			{error && <p className="error">{error.message}</p>}

			{!isLoading && messages.length === 0 && (
				<p>No messages found.</p>
			)}

			{messages.length > 0 && (
				<ul className="messages-list">
					{messages.map((message) => (
						<li key={message.id} className="message-item">
							<p>{message.content}</p>
							<div className="message-meta">
								{formatDate(message.created_at)}
								{message.updated_at !== message.created_at && " (edited)"}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function App() {
	return (
		<div className="app">
			<header>
				<h1>Private Data Client</h1>
			</header>

			<main>
				<WalletConnection />
				<PrivateMessages />
			</main>

			<footer className="footer">
				<p>
					Using{" "}
					<a href="https://eips.ethereum.org/EIPS/eip-4361" target="_blank" rel="noopener noreferrer">
						Sign-In with Ethereum (EIP-4361)
					</a>{" "}
					for authentication
				</p>
			</footer>
		</div>
	);
}

function formatAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleString();
}

export default App;
