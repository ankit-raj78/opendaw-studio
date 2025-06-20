import {Terminable, Terminator} from "std"
import {showErrorDialog} from "@/ui/components/dialogs.tsx"
import {Surface} from "@/ui/surface/Surface.tsx"
import {AnimationFrame, Browser, Events} from "dom"
import {StudioService} from "@/service/StudioService.ts"
import {LogBuffer} from "@/errors/LogBuffer.ts"
import {ErrorLog} from "@/errors/ErrorLog.ts"

export type ErrorInfo = {
    name: string
    message: string
    stack?: string
}

export class ErrorHandler {
    readonly terminator = new Terminator()
    readonly #service: StudioService

    #errorThrown: boolean = false

    constructor(service: StudioService) {this.#service = service}

    processError(scope: string, event: Event) {
        console.debug("Processing error in", scope, ":", event)
        if (this.#errorThrown) {return}
        this.#errorThrown = true
        AnimationFrame.terminate()
        const error = ErrorLog.extract(event)
        const body = JSON.stringify({
            date: new Date().toISOString(),
            agent: Browser.userAgent,
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