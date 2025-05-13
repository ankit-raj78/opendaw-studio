import {ExportStemConfiguration} from "@/audio-engine-shared/EngineProcessorOptions"

export type AudioUnitOptions = Omit<ExportStemConfiguration, "fileName">

export namespace AudioUnitOptions {
    export const Default: AudioUnitOptions = {includeAudioEffects: true, includeSends: true}
}