import {ppqn} from "dsp"
import {byte, int, Nullable, Terminable, unitValue, UUID} from "std"
import {ClipSequencingUpdates} from "@/audio-engine-shared/ClipSequencingUpdates"
import {AudioData} from "@/audio/AudioData"

export interface EngineCommands extends Terminable {
    setPlaying(value: boolean): void
    setRecording(value: boolean): void
    setPosition(position: ppqn): void
    setMetronomeEnabled(enabled: boolean): void
    stopAndReset(): void
    queryLoadingComplete(): Promise<boolean>
    panic(): void
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void
    noteOff(uuid: UUID.Format, pitch: byte): void
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void
}

export interface EngineToClient {
    log(message: string): void
    fetchAudio(uuid: UUID.Format): Promise<AudioData>
    notifyClipSequenceChanges(changes: ClipSequencingUpdates): void
    switchMarkerState(state: Nullable<[UUID.Format, int]>): void
    ready(): void
}