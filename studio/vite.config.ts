import { defineConfig } from "vite"
import { resolve } from "path"
import * as path from "node:path"
import { readFileSync, writeFileSync } from "fs"
import { UUID } from "std"
import { BuildInfo } from "./src/BuildInfo"
import viteCompression from "vite-plugin-compression"
import crossOriginIsolation from "vite-plugin-cross-origin-isolation"

export default defineConfig(({ mode }) => {
	const uuid = UUID.toString(UUID.generate())
	const env = process.env.NODE_ENV as BuildInfo["env"]
	const date = Date.now()
	return {
		base: "/",
		mode,
		plugins: [
			crossOriginIsolation(),
			{
				name: "generate-date-json",
				buildStart() {
					const outputPath = resolve(__dirname, "public", "build-info.json")
					writeFileSync(outputPath, JSON.stringify({ date, uuid, env } satisfies BuildInfo, null, 2))
					console.debug(`Build info written to: ${outputPath}`)
				}
			},
			{
				name: "spa",
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						const url: string | undefined = req.url
						if (url !== undefined && url.indexOf(".") === -1 && !url.startsWith("/@vite/")) {
							const indexPath = path.resolve(__dirname, "index.html")
							res.end(readFileSync(indexPath))
						} else {
							next()
						}
					})
				}
			},
			viteCompression({
				algorithm: "brotliCompress"
			})
		],
		resolve: {
			alias: { "@": resolve(__dirname, "./src") }
		},
		build: {
			target: "esnext",
			minify: true,
			sourcemap: true,
			rollupOptions: {
				output: {
					format: "es",
					treeshake: true,
					entryFileNames: `[name].${uuid}.js`,
					chunkFileNames: `[name].${uuid}.js`,
					assetFileNames: `[name].${uuid}.[ext]`
				}
			}
		},
		esbuild: {
			target: "esnext"
		},
		clearScreen: false,
		server: {
			port: 8080,
			strictPort: true,
			https: {
				key: readFileSync("localhost-key.pem"),
				cert: readFileSync("localhost.pem")
			},
			watch: {
				ignored: ["**/src-tauri/**"]
			}
		}
	}
})