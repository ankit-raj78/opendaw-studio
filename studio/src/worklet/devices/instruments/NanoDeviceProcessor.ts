import {NanoDeviceBoxAdapter} from "@/audio-engine-shared/adapters/devices/instruments/NanoDeviceBoxAdapter"
import {EngineContext} from "@/worklet/EngineContext.ts"
import {DeviceProcessor, InstrumentDeviceProcessor} from "@/worklet/processors.ts"
import {dbToGain, Event, NoteEvent} from "dsp"
import {Id, int, Option, Terminable, UUID} from "std"
import {AudioProcessor} from "@/worklet/AudioProcessor.ts"
import {AudioBuffer} from "@/worklet/AudioBuffer.ts"
import {Block, Processor} from "@/worklet/processing.ts"
import {PeakBroadcaster} from "@/worklet/PeakBroadcaster.ts"
import {AutomatableParameter} from "@/worklet/AutomatableParameter.ts"
import {AudioLoader} from "@/audio-engine-shared/AudioLoader"
import {AudioData} from "@/audio/AudioData"
import {NoteEventSource, NoteEventTarget, NoteLifecycleEvent} from "@/worklet/NoteEventSource"
import {NoteEventInstrument} from "@/worklet/NoteEventInstrument"

export class NanoDeviceProcessor extends AudioProcessor implements InstrumentDeviceProcessor, NoteEventTarget {
    readonly #adapter: NanoDeviceBoxAdapter

    readonly #voices: Array<Voice>
    readonly #audioOutput: AudioBuffer
    readonly #noteEventProcessor: NoteEventInstrument
    readonly #peakBroadcaster: PeakBroadcaster
    readonly #parameterVolume: AutomatableParameter<number>
    readonly #parameterRelease: AutomatableParameter<number>

    gain: number = 1.0
    release: number = 1.0
    loader: Option<AudioLoader> = Option.None

    constructor(context: EngineContext, adapter: NanoDeviceBoxAdapter) {
        super(context)

        this.#adapter = adapter

        this.#voices = []
        this.#audioOutput = new AudioBuffer()
        this.#noteEventProcessor = new NoteEventInstrument(this, context.broadcaster, adapter.address)
        this.#peakBroadcaster = this.own(new PeakBroadcaster(context.broadcaster, adapter.address))
        this.#parameterVolume = this.own(this.bindParameter(this.#adapter.namedParameter.volume))
        this.#parameterRelease = this.own(this.bindParameter(this.#adapter.namedParameter.release))

        this.ownAll(
            context.registerProcessor(this),
            adapter.box.file.catchupAndSubscribe((pointer) =>
                this.loader = pointer.targetVertex.map(({box}) =>
                    context.audioManager.getOrCreateAudioLoader(box.address.uuid)))
        )
        this.readAllParameters()
    }

    get noteEventTarget(): Option<NoteEventTarget & DeviceProcessor> {return Option.wrap(this)}

    introduceBlock(block: Block): void {
        this.#noteEventProcessor.introduceBlock(block)
    }

    setNoteEventSource(source: NoteEventSource): Terminable {
        return this.#noteEventProcessor.setNoteEventSource(source)
    }

    get incoming(): Processor {return this}
    get outgoing(): Processor {return this}

    reset(): void {
        this.#voices.length = 0
        this.#audioOutput.clear()
        this.eventInput.clear()
        this.#noteEventProcessor.clear()
        this.#peakBroadcaster.clear()
    }

    get uuid(): UUID.Format {return this.#adapter.uuid}
    get audioOutput(): AudioBuffer {return this.#audioOutput}
    get adapter(): NanoDeviceBoxAdapter {return this.#adapter}

    handleEvent(event: Event): void {
        if (NoteLifecycleEvent.isStart(event)) {
            this.#voices.push(new Voice(this, event))
        } else if (NoteLifecycleEvent.isStop(event)) {
            this.#voices.find(voice => voice.event().id === event.id)?.stop()
        }
    }

    processAudio(_block: Block, fromIndex: int, toIndex: int): void {
        this.#audioOutput.clear(fromIndex, toIndex)
        for (let i = this.#voices.length - 1; i >= 0; i--) {
            if (this.#voices[i].processAdd(this.#audioOutput, fromIndex, toIndex)) {
                this.#voices.splice(i, 1)
            }
        }
    }

    parameterChanged(parameter: AutomatableParameter): void {
        if (parameter === this.#parameterVolume) {
            this.gain = dbToGain(this.#parameterVolume.getValue())
        } else if (parameter === this.#parameterRelease) {
            this.release = this.#parameterRelease.getValue() * sampleRate
        }
    }

    finishProcess(): void {
        this.#audioOutput.assertSanity()
        this.#peakBroadcaster.process(this.#audioOutput.getChannel(0), this.#audioOutput.getChannel(1))
    }

    toString(): string {return `{NanoDevice}`}
}

class Voice {
    readonly #device: NanoDeviceProcessor
    readonly #event: Id<NoteEvent>

    readonly #speed: number = 1.0

    #position: number = 0.0
    #envPosition: int = 0 | 0
    #decayPosition: int = Number.POSITIVE_INFINITY

    constructor(device: NanoDeviceProcessor, event: Id<NoteEvent>) {
        this.#device = device
        this.#event = event

        this.#speed = Math.pow(2.0, (event.pitch + event.cent / 100.0) / 12.0 - 5.0)
    }

    event(): Id<NoteEvent> {return this.#event}

    stop(): void {this.#decayPosition = this.#envPosition}

    processAdd(output: AudioBuffer, fromIndex: int, toIndex: int): boolean {
        const optLoader = this.#device.loader
        if (optLoader.isEmpty()) {return true}
        const loader = optLoader.unwrap()
        if (loader.data.isEmpty()) {return true}
        return this.processSimple(output.channels(), loader.data.unwrap(), fromIndex, toIndex)
    }

    processSimple(output: ReadonlyArray<Float32Array>, data: AudioData, fromIndex: int, toIndex: int): boolean {
        const [outL, outR] = output
        const inpL = data.frames[0]
        const inpR = data.frames[1] ?? inpL
        const numberOfFrames = data.numberOfFrames
        const rateRatio = data.sampleRate / sampleRate
        const gain = this.#device.gain
        const release = this.#device.release
        const releaseInverse = 1.0 / release
        for (let i = fromIndex; i < toIndex; i++) {
            const intPosition = this.#position | 0
            if (intPosition >= numberOfFrames - 1) {return true}
            const frac = this.#position - intPosition
            const env = Math.min(1.0 - (this.#envPosition - this.#decayPosition) * releaseInverse, 1.0) ** 2.0
            const l = inpL[intPosition] * (1.0 - frac) + inpL[intPosition + 1] * frac
            const r = inpR[intPosition] * (1.0 - frac) + inpR[intPosition + 1] * frac
            outL[i] += l * gain * env
            outR[i] += r * gain * env
            this.#position += this.#speed * rateRatio
            if (++this.#envPosition - this.#decayPosition > release) {return true}
        }
        return false
    }
}