import Rollbar from "rollbar"
import { Option, Terminable, Terminator, UUID } from "std"
import { showErrorDialog } from "@/ui/components/dialogs.tsx"
import { Surface } from "@/ui/surface/Surface.tsx"
import { OpfsAgent } from "@/service/agents"
import { ProjectSession } from "@/project/ProjectSession"
import { Project } from "./project/Project"
import { StudioService } from "@/service/StudioService"
import { ProjectMeta } from "@/project/ProjectMeta"
import { AnimationFrame, Browser, Events } from "dom"
import { Promises } from "runtime"

export namespace ErrorHandler {
	export const RESTORE_FILE_PATH = ".backup"

	export let optSession: Option<ProjectSession> = Option.None

	let processed: boolean = false

	console.debug("meta.env.MODE", import.meta.env.MODE)

	export const rollbar = new Rollbar({
		accessToken: "5f89b677914d49bab814e1261c292af9",
		environment: import.meta.env.MODE,
		logLevel: "debug",
		host: location.hostname,
		enabled: import.meta.env.MODE === "production",
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
	})

	const processError = async (scope: string, reason: any) => {
		if (processed) {return}
		processed = true
		AnimationFrame.terminate()
		const backup = await backupSession()
		const message = readValue(reason)
		console.log(`project: ${optSession.unwrapOrNull()?.meta?.name}`)
		console.log(`scripts: ${document.scripts.length}`)
		console.error(scope, message)
		if (Surface.isAvailable()) {
			showErrorDialog(scope, message, backup)
		} else {
			alert(`Boot Error in '${scope}': ${message}`)
		}
		if (reason instanceof ErrorEvent && reason.error instanceof Error) {
			console.log("rollbar result for event:", rollbar.error(scope, reason.error))
		} else if (reason instanceof PromiseRejectionEvent) {
			console.log("rollbar result for error:", rollbar.error(scope, reason.reason))
		} else {
			console.log("rollbar result for error:", rollbar.error(scope, reason))
		}
	}

	const readValue = (value: any) => {
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

	const appLifetime = new Terminator()

	export const thrown = (scope: string, reason: any): void => {
		appLifetime.terminate()
		processError(scope, reason)
	}

	export const install = (owner: WindowProxy | Worker | AudioWorkletNode, scope: string): Terminable => {
		if (processed) {return Terminable.Empty}
		const lifetime = appLifetime.own(new Terminator())
		lifetime.ownAll(
			Events.subscribe(owner, "error", event => {
				lifetime.terminate()
				console.debug(scope, event)
				processError(scope, event)
			}),
			Events.subscribe(owner, "unhandledrejection", event => {
				lifetime.terminate()
				console.debug(scope, event)
				processError(scope, event)
			}),
			Events.subscribe(owner, "messageerror", event => {
				lifetime.terminate()
				console.debug(scope, event)
				processError(scope, event)
			}),
			Events.subscribe(owner, "processorerror" as any, event => {
				lifetime.terminate()
				console.debug(scope, event)
				processError(scope, event)
			}),
			Events.subscribe(owner, "securitypolicyviolation", (event: SecurityPolicyViolationEvent) => {
				lifetime.terminate()
				console.debug(scope, event)
				if ("blockedURI" in event) {
					processError(scope, `URL '${event.blockedURI}' is blocked`)
				}
			})
		)
		return lifetime
	}

	export const restoreSession = async (service: StudioService): Promise<Option<ProjectSession>> => {
		const backupResult = await Promises.tryCatch(OpfsAgent.list(RESTORE_FILE_PATH))
		if (backupResult.status === "rejected" || backupResult.value.length === 0) {return Option.None}
		const readResult = await Promises.tryCatch(Promise.all([
			OpfsAgent.read(`${RESTORE_FILE_PATH}/uuid`)
				.then(x => UUID.validate(x)),
			OpfsAgent.read(`${RESTORE_FILE_PATH}/project.od`)
				.then(x => Project.load(service, x.buffer as ArrayBuffer)),
			OpfsAgent.read(`${RESTORE_FILE_PATH}/meta.json`)
				.then(x => JSON.parse(new TextDecoder().decode(x.buffer as ArrayBuffer)) as ProjectMeta),
			OpfsAgent.read(`${RESTORE_FILE_PATH}/saved`)
				.then(x => x.at(0) === 1)
		]))
		const deleteResult = await Promises.tryCatch(OpfsAgent.delete(RESTORE_FILE_PATH))
		console.debug(`delete backup: "${deleteResult.status}"`)
		if (readResult.status === "rejected") {return Option.None}
		const [uuid, project, meta, saved] = readResult.value
		const session = new ProjectSession(uuid, project, meta, Option.None, saved)
		console.debug(`restore ${session}, saved: ${saved}`)
		return Option.wrap(session)
	}

	const backupSession = async (): Promise<boolean> => {
		return optSession.match({
			none: async () => false,
			some: async (session: ProjectSession) => {
				console.debug("temp storing project")
				const { project, meta, uuid } = session
				const { status, error } = await Promises.tryCatch(Promise.all([
					OpfsAgent.write(`${RESTORE_FILE_PATH}/uuid`, uuid),
					OpfsAgent.write(`${RESTORE_FILE_PATH}/project.od`, new Uint8Array(project.toArrayBuffer())),
					OpfsAgent.write(`${RESTORE_FILE_PATH}/meta.json`, new TextEncoder().encode(JSON.stringify(meta))),
					OpfsAgent.write(`${RESTORE_FILE_PATH}/saved`, new Uint8Array([session.saved() ? 1 : 0]))
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