export namespace LogBuffer {
    export type Entry = {
        time: number
        level: "debug" | "info" | "warn"
        args: string
    }
    let estimatedSize = 0
    const MAX_ARGS_SIZE = 100_000
    const logBuffer: Entry[] = []
    const pushLog = (level: Entry["level"], args: unknown[]) => {
        const entry: Entry = {time: Date.now(), level, args: args.map(String).join(" ")}
        const argLength = entry.args.length
        logBuffer.push(entry)
        estimatedSize += argLength
        while (estimatedSize > MAX_ARGS_SIZE && logBuffer.length > 1) {
            const removed = logBuffer.shift()!
            estimatedSize -= removed.args.length
        }
    }
    const original = {debug: console.debug, info: console.info, warn: console.warn} as const
    console.debug = (...args) => {
        pushLog("debug", args)
        original.debug.apply(console, args)
    }
    console.info = (...args) => {
        pushLog("info", args)
        original.info.apply(console, args)
    }
    console.warn = (...args) => {
        pushLog("warn", args)
        original.warn.apply(console, args)
    }
    export const get = () => logBuffer
}