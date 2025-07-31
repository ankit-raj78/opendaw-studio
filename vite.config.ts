import {defineConfig, UserConfig} from "vite"
import {resolve} from "path"
import * as path from "node:path"
import {readFileSync, writeFileSync, mkdirSync} from "fs"
import {randomUUID} from "crypto"
import {BuildInfo} from "./src/BuildInfo"
import viteCompression from "vite-plugin-compression"
import crossOriginIsolation from "vite-plugin-cross-origin-isolation"

export default defineConfig(({mode, command}) => {
    const uuid = randomUUID()
    const env = process.env.NODE_ENV as BuildInfo["env"]
    const date = Date.now()
    const config: UserConfig = {
        base: "/",
        mode,
        plugins: [
            crossOriginIsolation(),
            {
                name: "generate-date-json",
                buildStart() {
                    const publicDir = resolve(__dirname, "studio", "public")
                    const outputPath = resolve(publicDir, "build-info.json")
                    
                    // Ensure the directory exists
                    mkdirSync(publicDir, { recursive: true })
                    
                    writeFileSync(outputPath, JSON.stringify({date, uuid, env} satisfies BuildInfo, null, 2))
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
            alias: {"@": resolve(__dirname, "./src")}
        },
        build: {
            target: "esnext",
            minify: true,
            sourcemap: true,
            rollupOptions: {
                output: {
                    format: "es",
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
        preview: {
            port: 8080,
            host: '0.0.0.0',
            https: {
                key: readFileSync(resolve(__dirname, "../localhost-key.pem")),
                cert: readFileSync(resolve(__dirname, "../localhost.pem"))
            },
            headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp'
            }
        }
    }
    if (command === "serve") {
        config.server = {
            port: 8080,
            strictPort: true,
            https: {
                key: readFileSync(resolve(__dirname, "../localhost-key.pem")),
                cert: readFileSync(resolve(__dirname, "../localhost.pem"))
            },
            headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp'
            },
            watch: {
                ignored: ["**/src-tauri/**"]
            }
        }
    }
    return config
})
