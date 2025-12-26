import { useState } from "react";
import { authFetch } from "siwe-auth-fetch";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import "./index.css";

interface FetchResult {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: string;
}

function App() {
	const { address, isConnected } = useAccount();
	const { connect, connectors } = useConnect();
	const { disconnect } = useDisconnect();
	const { signMessageAsync } = useSignMessage();

	const [url, setUrl] = useState("");
	const [result, setResult] = useState<FetchResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [token, setToken] = useState<string | null>(null);

	const handleFetch = async (withAuth: boolean) => {
		if (!url) return;

		setLoading(true);
		setError(null);
		setResult(null);

		try {
			let response: Response;

			if (withAuth && address) {
				response = await authFetch(url, {
					address,
					signMessage: signMessageAsync,
					token: token ?? undefined,
					onToken: (newToken) => setToken(newToken),
				});
			} else {
				response = await fetch(url);
			}

			const headers: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				headers[key] = value;
			});

			const text = await response.text();
			let body: string;
			try {
				body = JSON.stringify(JSON.parse(text), null, 2);
			} catch {
				body = text;
			}

			setResult({
				status: response.status,
				statusText: response.statusText,
				headers,
				body,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Fetch failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
			<h1>SIWE Auth Fetch</h1>

			<div style={{ marginBottom: 16 }}>
				{isConnected && address ? (
					<p>
						Connected: <code>{address}</code>{" "}
						<button type="button" onClick={() => disconnect()}>
							Disconnect
						</button>
					</p>
				) : (
					<div>
						<span style={{ opacity: 0.6 }}>Not connected</span>{" "}
						{connectors.map((connector) => (
							<button
								key={connector.uid}
								onClick={() => connect({ connector })}
								type="button"
								style={{ marginLeft: 8 }}
							>
								{connector.name}
							</button>
						))}
					</div>
				)}
			</div>

			{token && (
				<p style={{ fontSize: "0.85em", opacity: 0.6 }}>
					Token cached{" "}
					<button type="button" onClick={() => setToken(null)}>
						Clear
					</button>
				</p>
			)}

			<div style={{ marginBottom: 8 }}>
				<input
					type="text"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="Enter URL"
					style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
				/>
			</div>

			<div style={{ marginBottom: 16 }}>
				<button
					type="button"
					onClick={() => handleFetch(false)}
					disabled={loading || !url}
				>
					{loading ? "Fetching..." : "Fetch"}
				</button>
				{isConnected && (
					<button
						type="button"
						onClick={() => handleFetch(true)}
						disabled={loading || !url}
						style={{ marginLeft: 8 }}
					>
						{loading ? "Fetching..." : "Fetch with Auth"}
					</button>
				)}
			</div>

			{error && <p style={{ color: "red" }}>{error}</p>}

			{result && (
				<div>
					<h3>
						Response: {result.status} {result.statusText}
					</h3>

					<details open={Object.keys(result.headers).length < 10}>
						<summary>Headers ({Object.keys(result.headers).length})</summary>
						<pre style={{ fontSize: "0.85em" }}>
							{Object.entries(result.headers)
								.map(([k, v]) => `${k}: ${v}`)
								.join("\n")}
						</pre>
					</details>

					<h4>Body</h4>
					<pre>{result.body || "(empty)"}</pre>
				</div>
			)}
		</div>
	);
}

export default App;
