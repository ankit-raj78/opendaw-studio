import { ClipSequencingUpdates } from "@/audio-engine-shared/ClipSequencingUpdates"
import { UUID } from "std"

export type ClipNotification = {
	type: "sequencing"
	changes: ClipSequencingUpdates
} | {
	type: "waiting"
	clips: ReadonlyArray<UUID.Format>
}