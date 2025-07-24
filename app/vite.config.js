import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"
import { viteStaticCopy } from "vite-plugin-static-copy"

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		tailwindcss(),
		react(),
		wasm(),
		topLevelAwait({
			promiseExportName: "__tla",
			promiseImportName: (i) => `__tla_${i}`,
		}),
		viteStaticCopy({
			targets: [
				{
					src: "./node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs",
					dest: "wasm",
				},
				{
					src: "./node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm",
					dest: "wasm",
				},
			],
		}),
	],
	build: {
		target: "esnext",
	},
	worker: {
		format: "es",
		plugins: [wasm(), topLevelAwait()],
	},
	resolve: {
		// Only bundle a single instance of Transformers.js
		// (shared by "@huggingface/transformers" and "kokoro")
		dedupe: ["@huggingface/transformers"],
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
})
