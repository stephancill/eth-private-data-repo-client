import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { baseAccount } from "wagmi/connectors";

export const config = createConfig({
	chains: [mainnet],
	connectors: [baseAccount()],
	transports: {
		[mainnet.id]: http(),
	},
});
