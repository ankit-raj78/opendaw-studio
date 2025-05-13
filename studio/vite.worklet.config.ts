import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
	build: {
		rollupOptions: {
			input: "src/worklet/EngineProcessor.ts",
			external: ["jsx", "sass"]
		},
		outDir: "dist/worklet"
	},
	resolve: {
		alias: { "@": resolve(__dirname, "./src") }
	}
})
