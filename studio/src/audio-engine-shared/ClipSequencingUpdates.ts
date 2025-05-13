import {UUID} from "std"

export type ClipSequencingUpdates = {
    started: ReadonlyArray<UUID.Format>
    stopped: ReadonlyArray<UUID.Format>
    obsolete: ReadonlyArray<UUID.Format> // scheduled, but never started
}