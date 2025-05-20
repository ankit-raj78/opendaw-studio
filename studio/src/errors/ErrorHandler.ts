import {Option, Terminable, Terminator, UUID} from "std"
import {showErrorDialog} from "@/ui/components/dialogs.tsx"
import {Surface} from "@/ui/surface/Surface.tsx"
import {OpfsAgent} from "@/service/agents.ts"
import {ProjectSession} from "@/project/ProjectSession.ts"
import {Project} from "../project/Project.ts"
import {StudioService} from "@/service/StudioService.ts"
import {ProjectMeta} from "@/project/ProjectMeta.ts"
import {AnimationFrame, Browser, Events} from "dom"
import {Promises} from "runtime"

export interface ErrorReporting {
    error(...args: any[]): void
    warning(...args: any[]): void
}

export namespace ErrorReporting {
    export const init = async (): Promise<ErrorReporting> => {
        if (import.meta.env.MODE === "production") {
            console.debug("loading rollbar...")
            return await import("rollbar").then(({default: Rollbar}) => new Rollbar({
                accessToken: "5f89b677914d49bab814e1261c292af9",
                environment: import.meta.env.MODE,
                logLevel: "debug",
                host: location.hostname,
                enabled: true,
                autoInstrument: Browser.isLocalHost() ? {
                    network: false,   // Disable network telemetry
                    log: false,       // Disable console log capture
                    dom: false,       // Disable UI events capture
                    navigation: false // Disable URL changes tracking
                } : undefined,
                payload: {
                    context: {
                        scripts: document.scripts.length
                    }
                }
            }))
        } else {
            return {
                error: (reason: any) => console.error(reason),
                warning: (reason: any) => console.warn(reason)
            }
        }
    }
}

export class ErrorHandler implements ErrorReporting {
    static readonly #RESTORE_FILE_PATH = ".backup" // TODO Extract Recovery into another class

    static #decodeToString(value: any): string {
        switch (true) {
            case typeof value === "string":
                return value
            case value === null:
                return "value is null"
            case "message" in value:
                return value.message
            case "error" in value:
                return value.error
            case "reason" in value:
                return String(value.reason)
            default:
                return "Unknown error"
        }
    }

    readonly terminator = new Terminator()
    readonly #reporting: ErrorReporting

    optSession: Option<ProjectSession> = Option.None

    #errorThrown: boolean = false

    constructor(reporting: ErrorReporting) {this.#reporting = reporting}

    error(...args: any[]): void {this.#reporting.error(...args)}
    warning(...args: any[]): void {this.#reporting.error(...args)}

    async processError(scope: string, reason: any) {
        if (this.#errorThrown) {return}
        this.#errorThrown = true
        AnimationFrame.terminate()
        const backup = await this.backupSession()
        const message = ErrorHandler.#decodeToString(reason)
        console.log(`project: ${this.optSession.unwrapOrNull()?.meta?.name}`)
        console.log(`scripts: ${document.scripts.length}`)
        console.error(scope, message)
        if (Surface.isAvailable()) {
            showErrorDialog(scope, message, backup)
        } else {
            alert(`Boot Error in '${scope}': ${message}`)
        }
        if (reason instanceof ErrorEvent && reason.error instanceof Error) {
            this.error(scope, reason.error)
        } else if (reason instanceof PromiseRejectionEvent) {
            this.error(scope, reason.reason)
        } else {
            this.error(scope, reason)
        }
    }

    install(owner: WindowProxy | Worker | AudioWorkletNode, scope: string): Terminable {
        if (this.#errorThrown) {return Terminable.Empty}
        const lifetime = this.terminator.own(new Terminator())
        lifetime.ownAll(
            Events.subscribe(owner, "error", event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event).then()
            }),
            Events.subscribe(owner, "unhandledrejection", event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event).then()
            }),
            Events.subscribe(owner, "messageerror", event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event).then()
            }),
            Events.subscribe(owner, "processorerror" as any, event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event).then()
            }),
            Events.subscribe(owner, "securitypolicyviolation", (event: SecurityPolicyViolationEvent) => {
                lifetime.terminate()
                console.debug(scope, event)
                if ("blockedURI" in event) {
                    this.processError(scope, `URL '${event.blockedURI}' is blocked`).then()
                }
            })
        )
        return lifetime
    }

    async restoreSession(service: StudioService): Promise<Option<ProjectSession>> {
        const backupResult = await Promises.tryCatch(OpfsAgent.list(ErrorHandler.#RESTORE_FILE_PATH))
        if (backupResult.status === "rejected" || backupResult.value.length === 0) {return Option.None}
        const readResult = await Promises.tryCatch(Promise.all([
            OpfsAgent.read(`${ErrorHandler.#RESTORE_FILE_PATH}/uuid`)
                .then(x => UUID.validate(x)),
            OpfsAgent.read(`${ErrorHandler.#RESTORE_FILE_PATH}/project.od`)
                .then(x => Project.load(service, x.buffer as ArrayBuffer)),
            OpfsAgent.read(`${ErrorHandler.#RESTORE_FILE_PATH}/meta.json`)
                .then(x => JSON.parse(new TextDecoder().decode(x.buffer as ArrayBuffer)) as ProjectMeta),
            OpfsAgent.read(`${ErrorHandler.#RESTORE_FILE_PATH}/saved`)
                .then(x => x.at(0) === 1)
        ]))
        const deleteResult = await Promises.tryCatch(OpfsAgent.delete(ErrorHandler.#RESTORE_FILE_PATH))
        console.debug(`delete backup: "${deleteResult.status}"`)
        if (readResult.status === "rejected") {return Option.None}
        const [uuid, project, meta, saved] = readResult.value
        const session = new ProjectSession(uuid, project, meta, Option.None, saved)
        console.debug(`restore ${session}, saved: ${saved}`)
        return Option.wrap(session)
    }

    async backupSession(): Promise<boolean> {
        return this.optSession.match({
            none: async () => false,
            some: async (session: ProjectSession) => {
                console.debug("temp storing project")
                const {project, meta, uuid} = session
                const {status, error} = await Promises.tryCatch(Promise.all([
                    OpfsAgent.write(`${ErrorHandler.#RESTORE_FILE_PATH}/uuid`, uuid),
                    OpfsAgent.write(`${ErrorHandler.#RESTORE_FILE_PATH}/project.od`, new Uint8Array(project.toArrayBuffer())),
                    OpfsAgent.write(`${ErrorHandler.#RESTORE_FILE_PATH}/meta.json`, new TextEncoder().encode(JSON.stringify(meta))),
                    OpfsAgent.write(`${ErrorHandler.#RESTORE_FILE_PATH}/saved`, new Uint8Array([session.saved() ? 1 : 0]))
                ]))
                if (status === "resolved") {
                    console.debug("done.")
                    return true
                } else {
                    console.warn(error)
                    return false
                }
            }
        })
    }
}