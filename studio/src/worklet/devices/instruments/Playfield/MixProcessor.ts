import {AudioProcessor} from "@/worklet/AudioProcessor"
import {AudioDeviceProcessor} from "@/worklet/processors"
import {AudioGenerator, Processor} from "@/worklet/processing"
import {PlayfieldDeviceProcessor} from "@/worklet/devices/instruments/PlayfieldDeviceProcessor"
import {AudioBuffer} from "@/worklet/AudioBuffer"
import {PeakBroadcaster} from "@/worklet/PeakBroadcaster"
import {EventBuffer} from "@/worklet/EventBuffer"
import {EngineContext} from "@/worklet/EngineContext"
import {RenderQuantum} from "@/worklet/constants"
import {Arrays, Terminable, UUID} from "std"

export class MixProcessor extends AudioProcessor implements AudioDeviceProcessor, Processor, AudioGenerator {
    readonly #device: PlayfieldDeviceProcessor

    readonly #audioOutput: AudioBuffer
    readonly #peaksBroadcaster: PeakBroadcaster
    readonly #sources: Array<AudioBuffer>
    readonly #eventBuffer: EventBuffer

    constructor(context: EngineContext, device: PlayfieldDeviceProcessor) {
        super(context)

        this.#device = device

        this.#audioOutput = new AudioBuffer()
        this.#peaksBroadcaster = this.own(new PeakBroadcaster(context.broadcaster, device.adapter.address))
        this.#sources = []
        this.#eventBuffer = new EventBuffer()

        this.own(context.registerProcessor(this))
        this.readAllParameters()
    }

    get uuid(): UUID.Format {return this.#device.uuid}
    get incoming(): Processor {return this}
    get outgoing(): Processor {return this}

    setAudioSource(source: AudioBuffer): Terminable {
        this.#sources.push(source)
        return {
            terminate: () => {
                Arrays.remove(this.#sources, source)
                this.#audioOutput.clear()
            }
        }
    }

    get audioOutput(): AudioBuffer {return this.#audioOutput}
    get eventInput(): EventBuffer {return this.#eventBuffer}

    processAudio(_block: Readonly<{}>, _fromIndex: number, _toIndex: number): void {}

    reset(): void {this.#peaksBroadcaster.clear()}

    finishProcess(): void {
        this.#audioOutput.clear()
        const [outL, outR] = this.#audioOutput.channels()
        for (const source of this.#sources) {
            const [srcL, srcR] = source.channels()
            for (let i = 0; i < RenderQuantum; i++) {
                outL[i] += srcL[i]
                outR[i] += srcR[i]
            }
        }
        this.#audioOutput.assertSanity()
        this.#peaksBroadcaster.process(this.#audioOutput.getChannel(0), this.#audioOutput.getChannel(1))
    }

    toString(): string {return "{PlayfieldMixProcessor}"}
}