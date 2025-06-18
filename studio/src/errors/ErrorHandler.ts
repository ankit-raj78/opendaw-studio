import {Terminable, Terminator} from "std"
import {showErrorDialog} from "@/ui/components/dialogs.tsx"
import {Surface} from "@/ui/surface/Surface.tsx"
import {AnimationFrame, Browser, Events} from "dom"
import {StudioService} from "@/service/StudioService.ts"

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
    readonly #service: StudioService
    readonly #reporting: ErrorReporting

    #errorThrown: boolean = false

    constructor(service: StudioService, reporting: ErrorReporting) {
        this.#service = service
        this.#reporting = reporting
    }

    error(...args: any[]): void {this.#reporting.error(...args)}
    warning(...args: any[]): void {this.#reporting.error(...args)}

    async processError(scope: string, reason: any) {
        if (this.#errorThrown) {return}
        this.#errorThrown = true
        AnimationFrame.terminate()
        if (reason instanceof ErrorEvent && reason.error instanceof Error) {
            this.error(scope, reason.error)
        } else if (reason instanceof PromiseRejectionEvent) {
            this.error(scope, reason.reason)
        } else {
            this.error(scope, reason)
        }
        const message = ErrorHandler.#decodeToString(reason)
        console.log(`project: ${this.#service.sessionService.getValue().unwrapOrNull()?.meta?.name}`)
        console.log(`scripts: ${document.scripts.length}`)
        console.error(scope, message)
        if (Surface.isAvailable()) {
            showErrorDialog(scope, message, this.#service.recovery.createBackupCommand())
        } else {
            alert(`Boot Error in '${scope}': ${message}`)
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
}