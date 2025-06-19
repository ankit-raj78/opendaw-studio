import {int, Terminable, Terminator} from "std"
import {showErrorDialog} from "@/ui/components/dialogs.tsx"
import {Surface} from "@/ui/surface/Surface.tsx"
import {AnimationFrame, Browser, Events} from "dom"
import {StudioService} from "@/service/StudioService.ts"
import {BuildInfo} from "@/BuildInfo.ts"
import {LogBuffer} from "@/LogBuffer.ts"

export interface ErrorReporting {
    error(...args: any[]): void
    warning(...args: any[]): void
}

type ErrorInfo = {
    name: string
    message: string
    stack?: string
}

type ErrorLog = {
    date: string
    agent: string
    build: BuildInfo
    scripts: int
    error: ErrorInfo
    logs: Array<LogBuffer.Entry>
}

const extractErrorInfo = (event: Event): ErrorInfo => {
    if (event instanceof ErrorEvent && event.error instanceof Error) {
        return {name: event.error.name || "Error", message: event.error.message, stack: event.error.stack}
    } else if (event instanceof PromiseRejectionEvent) {
        const reason = event.reason
        if (reason instanceof Error) {
            return {name: reason.name || "UnhandledRejection", message: reason.message, stack: reason.stack}
        } else {
            return {name: "UnhandledRejection", message: typeof reason === "string" ? reason : JSON.stringify(reason)}
        }
    } else if (event instanceof MessageEvent) {
        return {name: "MessageError", message: typeof event.data === "string" ? event.data : JSON.stringify(event.data)}
    } else if (event.type === "processorerror") {
        return {name: "ProcessorError", message: "N/A"}
    } else if (event instanceof SecurityPolicyViolationEvent) {
        return {name: "SecurityPolicyViolation", message: `${event.violatedDirective} blocked ${event.blockedURI}`}
    } else {
        return {name: "UnknownError", message: "Unknown error"}
    }
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

    processError(scope: string, event: Event) {
        if (this.#errorThrown) {return}
        this.#errorThrown = true
        AnimationFrame.terminate()
        if (location.hash === "#admin") { // TODO This is for testing the output. Will be sent to the server...
            const data = JSON.stringify({
                date: new Date().toISOString(),
                agent: navigator.userAgent,
                build: this.#service.buildInfo,
                scripts: document.scripts.length,
                error: extractErrorInfo(event),
                logs: LogBuffer.get()
            } satisfies ErrorLog)
            console.debug(data)
            fetch("https://logs.opendaw.studio/log.php", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(data)
            }).then(console.info)
        }
        if (event instanceof ErrorEvent && event.error instanceof Error) {
            this.error(scope, event.error)
        } else if (event instanceof PromiseRejectionEvent) {
            this.error(scope, event.reason)
        } else {
            this.error(scope, event)
        }
        const message = ErrorHandler.#decodeToString(event)
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
                this.processError(scope, event)
            }),
            Events.subscribe(owner, "unhandledrejection", event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event)
            }),
            Events.subscribe(owner, "messageerror", event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event)
            }),
            Events.subscribe(owner, "processorerror" as any, event => {
                lifetime.terminate()
                console.debug(scope, event)
                this.processError(scope, event)
            }),
            Events.subscribe(owner, "securitypolicyviolation", (event: SecurityPolicyViolationEvent) => {
                lifetime.terminate()
                console.debug(scope, event)
                if ("blockedURI" in event) {
                    this.processError(scope, event)
                }
            })
        )
        return lifetime
    }
}