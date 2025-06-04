import {BoxSchema} from "box-forge"
import {Pointers} from "@/data/pointers"

export const TrackBox: BoxSchema<Pointers> = {
    type: "box",
    class: {
        name: "TrackBox",
        fields: {
            1: {type: "pointer", name: "tracks", pointerType: Pointers.TrackCollection, mandatory: true},
            2: {type: "pointer", name: "target", pointerType: Pointers.Automation, mandatory: true},
            3: {type: "field", name: "regions", pointerRules: {accepts: [Pointers.RegionCollection], mandatory: false}},
            4: {type: "field", name: "clips", pointerRules: {accepts: [Pointers.ClipCollection], mandatory: false}},
            10: {type: "int32", name: "index"},
            11: {type: "int32", name: "type"},
            20: {type: "boolean", name: "enabled", value: true}
        }
    }, pointerRules: {accepts: [Pointers.Selection, Pointers.PianoMode], mandatory: false}
}

export const TrackPianoModeBox: BoxSchema<Pointers> = {
    type: "box",
    class: {
        name: "TrackPianoModeBox",
        fields: {
            1: {type: "pointer", name: "track", pointerType: Pointers.PianoMode, mandatory: true},
            2: {type: "boolean", name: "enabled", value: true},
            3: {type: "float32", name: "hue", value: 0},
            4: {type: "int32", name: "transpose", value: 0}
        }
    }
}