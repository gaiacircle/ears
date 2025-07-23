import { defineConfig } from "tsup"

export default defineConfig({
	entry: ["src/kokoro.ts"],
	format: ["esm"],
	splitting: false,
	sourcemap: true,
	clean: true,
	dts: true,
	outDir: "dist",
})
