import {createElement} from "jsx"
import {MidiKeys} from "dsp"
import {asDefined, int} from "std"

export const PianoRoll = () => {
    const moveToNextWhiteKey = (key: int, direction: -1 | 1): int => {
        while (MidiKeys.isBlackKey(key)) key += direction
        return key
    }
    const min = moveToNextWhiteKey(21, -1)   // A1
    const max = moveToNextWhiteKey(120, 1)   // C9
    const WHITE_WIDTH = 20
    const WHITE_HEIGHT = 100
    const BLACK_WIDTH = 12
    const BLACK_HEIGHT = 60
    const BLACK_OFFSETS: Record<int, number> = {1: 0.55, 3: 0.45, 6: 0.55, 8: 0.50, 10: 0.45}

    const whites: Array<SVGElement> = []
    const blacks: Array<SVGElement> = []
    for (let key = min; key <= max; key++) {
        if (MidiKeys.isBlackKey(key)) {
            const offset = asDefined(BLACK_OFFSETS[key % 12], "black index not found")
            const x = (whites.length - offset) * WHITE_WIDTH + (WHITE_WIDTH - BLACK_WIDTH) / 2.0
            blacks.push(
                <rect x={x} y={0} width={BLACK_WIDTH} height={BLACK_HEIGHT} fill="black"/>
            )
        } else {
            const x = whites.length * WHITE_WIDTH
            whites.push(
                <rect x={x + 0.5} y={0} width={WHITE_WIDTH - 1} height={WHITE_HEIGHT} fill="white"/>
            )
        }
    }

    return (
        <svg viewBox={`0.5 0 ${whites.length * WHITE_WIDTH - 1} ${WHITE_HEIGHT}`}
             width={whites.length * WHITE_WIDTH} height={WHITE_HEIGHT}>
            {whites}
            {blacks}
        </svg>
    )
}
