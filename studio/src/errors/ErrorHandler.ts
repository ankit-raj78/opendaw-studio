import {int, isDefined, Terminable, Terminator} from "std"
import {showErrorDialog} from "@/ui/components/dialogs.tsx"
import {Surface} from "@/ui/surface/Surface.tsx"
import {AnimationFrame, Events} from "dom"
import {StudioService} from "@/service/StudioService.ts"
import {BuildInfo} from "@/BuildInfo.ts"
import {LogBuffer} from "@/LogBuffer.ts"

export type ErrorInfo = {
    name: string
    message: string
    stack?: string
}

export type ErrorLog = {
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
            if (!isDefined(reason.stack)) {
                try {
                    // noinspection ExceptionCaughtLocallyJS
                    throw reason
                } catch (error) {
                    if (error instanceof Error) {
                        reason.stack = error.stack
                    }
                }
            }
            return {
                name: reason.name || "UnhandledRejection",
                message: reason.message,
                stack: reason.stack
            }
        } else {
            return {
                name: "UnhandledRejection",
                message: typeof reason === "string" ? reason : JSON.stringify(reason)
            }
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

export class ErrorHandler {
    readonly terminator = new Terminator()
    readonly #service: StudioService

    #errorThrown: boolean = false

    constructor(service: StudioService) {this.#service = service}

    processError(scope: string, event: Event) {
        if (this.#errorThrown) {return}
        this.#errorThrown = true
        AnimationFrame.terminate()
        const error = extractErrorInfo(event)
        const body = JSON.stringify({
            date: new Date().toISOString(),
            agent: navigator.userAgent,
            build: this.#service.buildInfo,
            scripts: document.scripts.length,
            error,
            logs: LogBuffer.get()
        } satisfies ErrorLog)
        if (import.meta.env.PROD) {
            fetch("https://logs.opendaw.studio/log.php", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body
            }).then(console.info, console.warn)
        }
        console.error(scope, error.name, error.message, error.stack)
        if (Surface.isAvailable()) {
            showErrorDialog(scope, error.name, error.message, this.#service.recovery.createBackupCommand())
        } else {
            alert(`Boot Error in '${scope}': ${error.name}`)
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