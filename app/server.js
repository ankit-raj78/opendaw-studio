import express from "express"
import path from "path"
import fs from "fs"
import https from "https"

const app = express()

// Set COOP/COEP
app.use((req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
	next()
})

// Serve static files
app.use(express.static("dist"))

// SPA fallback
app.use((req, res) => {
	res.sendFile(path.join(__dirname, "dist", "index.html"))
})

// HTTPS with your local cert
https
	.createServer(
		{
			key: fs.readFileSync("localhost-key.pem"),
			cert: fs.readFileSync("localhost.pem")
		},
		app
	)
	.listen(8080, () => {
		console.log("Production build running at https://localhost:8080")
	})
