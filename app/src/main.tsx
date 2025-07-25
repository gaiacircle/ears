import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { trpc } from "@/lib/trpc.js"

import "./index.css"
import App from "./App"

const queryClient = new QueryClient()
const trpcClient = trpc.createClient({
	links: [
		httpBatchLink({
			url: "/trpc", // Vite proxy already sends it to :2022
		}),
	],
})

const root = document.getElementById("root")

if (!root) throw new Error("Root element not found")

createRoot(root).render(
	<StrictMode>
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</trpc.Provider>
	</StrictMode>,
)
