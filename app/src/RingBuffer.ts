import { RenderQuantum } from "@/worklet/constants"
import { Arrays, assert, int, panic, Procedure } from "std"

export namespace RingBuffer {
	export interface Config {
		sab: SharedArrayBuffer
		numChunks: int
		numChannels: int
	}

	export interface Writer {write(channels: ReadonlyArray<Float32Array>): void}

	export interface Reader {stop(): void}

	export const reader = ({ sab, numChunks, numChannels }: Config, append: Procedure<Array<Float32Array>>): Reader => {
		let running = true
		const pointers = new Int32Array(sab, 0, 2)
		const audio = new Float32Array(sab, 8)
		const planarChunk = new Float32Array(numChannels * RenderQuantum)
		const canBlock = typeof document === "undefined" // for usage in workers
		const step = () => {
			if (!running) {return}
			let readPtr = Atomics.load(pointers, 1)
			let writePtr = Atomics.load(pointers, 0)
			if (readPtr === writePtr) {
				if (canBlock) {
					Atomics.wait(pointers, 0, writePtr)
				} else {
					setTimeout(step, 1)   // non‑blocking poll fallback
					return
				}
				writePtr = Atomics.load(pointers, 0)
			}
			while (readPtr !== writePtr) {
				const offset = readPtr * numChannels * RenderQuantum
				planarChunk.set(audio.subarray(offset, offset + numChannels * RenderQuantum))
				const channels: Array<Float32Array> = []
				for (let channel = 0; channel < numChannels; channel++) {
					const start = channel * RenderQuantum
					const end = start + RenderQuantum
					channels.push(planarChunk.slice(start, end))
				}
				readPtr = (readPtr + 1) % numChunks
				Atomics.store(pointers, 1, readPtr)
				if (!running) {return}
				append(channels)
			}
			step()
		}
		step()
		return { stop: () => running = false }
	}

	export const writer = ({ sab, numChunks, numChannels }: Config): Writer => {
		const pointers = new Int32Array(sab, 0, 2)
		const audio = new Float32Array(sab, 8)
		return Object.freeze({
			write: (channels: ReadonlyArray<Float32Array>): void => {
				if (channels.length !== numChannels) {
					// We ignore this. This can happen in the worklet setup phase.
					return
				}
				for (const channel of channels) {
					if (channel.length !== RenderQuantum) {
						return panic("Each channel buffer must contain 'RenderQuantum' samples")
					}
				}
				const writePtr = Atomics.load(pointers, 0)
				const offset = writePtr * numChannels * RenderQuantum
				channels.forEach((channel, index) => audio.set(channel, offset + index * RenderQuantum))
				Atomics.store(pointers, 0, (writePtr + 1) % numChunks)
				Atomics.notify(pointers, 0)
			}
		})
	}
}

export const mergeChunkPlanes = (chunks: ReadonlyArray<ReadonlyArray<Float32Array>>,
																 maxFrames: int = Number.MAX_SAFE_INTEGER): ReadonlyArray<Float32Array> => {
	if (chunks.length === 0) {return Arrays.empty()}
	const numChannels = chunks[0].length
	const numFrames = Math.min(RenderQuantum * chunks.length, maxFrames)
	return Arrays.create(channelIndex => {
		const outChannel = new Float32Array(numFrames)
		chunks.forEach((recordedChannels, chunkIndex) => {
			if (recordedChannels.length !== numChannels) {return panic()}
			const recordedChannel = recordedChannels[channelIndex]
			assert(recordedChannel.length === RenderQuantum, "Invalid length")
			const remaining = numFrames - chunkIndex * RenderQuantum
			assert(remaining > 0, "Invalid remaining")
			outChannel.set(remaining < RenderQuantum
				? recordedChannel.slice(0, remaining)
				: recordedChannel, chunkIndex * RenderQuantum)
		})
		return outChannel
	}, numChannels)
}