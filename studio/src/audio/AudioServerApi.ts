import {AudioData} from "@/audio/AudioData"
import {ProgressHandler, UUID} from "std"
import {AudioMetaData} from "@/audio/AudioMetaData"

export interface AudioServerApi {
    fetch(uuid: UUID.Format, progress: ProgressHandler): Promise<[AudioData, AudioMetaData]>
}