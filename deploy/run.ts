import SftpClient from "ssh2-sftp-client"
import * as fs from "fs"
import * as path from "path"
import {execSync} from "child_process"

const config = {
    host: process.env.SFTP_HOST,
    port: Number(process.env.SFTP_PORT ?? 22),
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD
} as const
const webhookUrl = process.env.DISCORD_WEBHOOK!
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry")

if (dryRun) {
    // ✅ verify all env vars are present but **do not** contact the server
    const missing = Object.entries({
        SFTP_HOST: process.env.SFTP_HOST,
        SFTP_PORT: process.env.SFTP_PORT ?? "22",
        SFTP_USERNAME: process.env.SFTP_USERNAME,
        SFTP_PASSWORD: process.env.SFTP_PASSWORD,
        DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK
    }).filter(([, v]) => !v).map(([k]) => k)
    if (missing.length > 0) {
        throw new Error(`Missing secrets/vars: ${missing.join(", ")}`)
    }
    console.log("✅ All secrets & variables are set. Nothing was uploaded (dry-run).")
    process.exit(0)
}

const sftp = new SftpClient()

const staticFolders = [""]
const readLastDeployTime = (): string => {
    try {
        return new Date(
            JSON.parse(
                fs.readFileSync("public/build-info.json", "utf-8")
            ).date
        ).toISOString()
    } catch {
        return "1970-01-01"
    }
}
const readCommitsSinceLastDeploy = (): string[] =>
    execSync(`git log --since=${readLastDeployTime()} --pretty=format:"%s"`)
        .toString()
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .reverse()
        .map(s => `• ${s}`)
// ---------------------------------------------------------------------------

async function deleteDirectory(remoteDir: string) {
    const items = await sftp.list(remoteDir)
    for (const item of items) {
        const remotePath = path.posix.join(remoteDir, item.name)
        if (staticFolders.includes(remotePath)) continue
        if (item.type === "d") {
            await deleteDirectory(remotePath)
            await sftp.rmdir(remotePath, true)
        } else {
            await sftp.delete(remotePath)
        }
    }
}

async function uploadDirectory(localDir: string, remoteDir: string) {
    for (const file of fs.readdirSync(localDir)) {
        const localPath = path.join(localDir, file)
        const remotePath = path.posix.join(remoteDir, file)
        if (fs.lstatSync(localPath).isDirectory()) {
            await sftp.mkdir(remotePath, true).catch(() => {/* exists */})
            if (staticFolders.includes(remotePath)) continue
            await uploadDirectory(localPath, remotePath)
        } else {
            await sftp.put(localPath, remotePath)
        }
    }
}

// --------------------- main -------------------------------------------------
(async () => {
    const commits = readCommitsSinceLastDeploy()
    console.log(`⏩ build…`)
    execSync("npm run build", {stdio: "inherit"})

    console.log(`⏩ upload…`)
    await sftp.connect(config)
    await deleteDirectory("/")
    await uploadDirectory("dist", "/")
    await sftp.end()

    console.log(`✅ deploy complete (${commits.length} commits)`)
    if (webhookUrl) {
        await fetch(webhookUrl, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                content: [
                    "🚀 **openDAW** has been deployed to <https://opendaw.studio>.",
                    "",
                    ...commits
                ].join("\n")
            })
        })
    }
})()
