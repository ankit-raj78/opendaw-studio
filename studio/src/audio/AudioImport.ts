import {AudioSample} from "@/audio/AudioSample"
import {AudioData} from "@/audio/AudioData"
import {AudioPeaks} from "@/audio/AudioPeaks"
import {AudioMetaData} from "@/audio/AudioMetaData"
import {AudioStorage} from "@/audio/AudioStorage"
import {Arrays, ProgressHandler, UUID} from "std"
import {Promises} from "runtime"
import {estimateBpm} from "dsp"

export namespace AudioImporter {
    export type Creation = {
        uuid?: UUID.Format,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler: ProgressHandler
    }

    export const run = async (context: AudioContext,
                              {uuid, name, arrayBuffer, progressHandler}: Creation): Promise<AudioSample> => {
        uuid ??= await UUID.sha256(arrayBuffer) // Must run before decodeAudioData, because it will detach the ArrayBuffer
        const audioResult = await Promises.tryCatch(context.decodeAudioData(arrayBuffer))
        if (audioResult.status === "rejected") {return Promise.reject(name)}
        const {value: audioBuffer} = audioResult
        const audioData: AudioData = {
            sampleRate: audioBuffer.sampleRate,
            numberOfFrames: audioBuffer.length,
            numberOfChannels: audioBuffer.numberOfChannels,
            frames: Arrays.create(index => audioBuffer.getChannelData(index), audioBuffer.numberOfChannels)
        }
        const peaks = await AudioPeaks.generate(audioData, progressHandler)
        // Clean and process the sample name safely
        let cleanName = name || 'Unknown Sample'
        
        // Remove file extension if present
        const lastDotIndex = cleanName.lastIndexOf(".")
        if (lastDotIndex > 0) {
            cleanName = cleanName.substring(0, lastDotIndex)
        }
        
        // Ensure we have a non-empty name
        if (!cleanName || cleanName.trim() === '') {
            cleanName = 'Imported Sample'
        }
        
        console.log('🔍 AudioImporter: Processing name:', name, '→', cleanName)
        
        const meta: AudioMetaData = {
            bpm: estimateBpm(audioBuffer.duration),
            name: cleanName,
            duration: audioBuffer.duration,
            sample_rate: audioBuffer.sampleRate
        }
        await AudioStorage.store(uuid, audioData, peaks, meta)
        return {uuid: UUID.toString(uuid), ...meta}
    }
}