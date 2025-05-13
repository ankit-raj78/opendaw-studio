import { BoxSchema } from "box-forge"
import { Pointers } from "@/data/pointers"
import { ClipPlaybackFields } from "./clips"

export const ValueEventBox: BoxSchema<Pointers> = {
	type: "box",
	class: {
		name: "ValueEventBox",
		fields: {
			1: { type: "pointer", name: "events", pointerType: Pointers.ValueEvents, mandatory: true },
			10: { type: "int32", name: "position" },
			11: { type: "int32", name: "index" },
			// TODO Attach a CurveBox to ValueEventBox (enables having different curve shapes in future)
			12: { type: "int32", name: "interpolation", value: 1 /*default is line/curve*/ },
			13: { type: "float32", name: "value" },
			14: { type: "float32", name: "slope" }
		}
	}, pointerRules: { accepts: [Pointers.Selection], mandatory: false }
}

export const ValueEventCollectionBox: BoxSchema<Pointers> = {
	type: "box",
	class: {
		name: "ValueEventCollectionBox",
		fields: {
			1: { type: "field", name: "events", pointerRules: { accepts: [Pointers.ValueEvents], mandatory: false } },
			2: { type: "field", name: "owners", pointerRules: { accepts: [Pointers.ValueEventCollection], mandatory: true } }
		}
	}, pointerRules: { accepts: [Pointers.Selection], mandatory: false }
}

export const ValueRegionBox: BoxSchema<Pointers> = {
	type: "box",
	class: {
		name: "ValueRegionBox",
		fields: {
			1: { type: "pointer", name: "regions", pointerType: Pointers.RegionCollection, mandatory: true },
			2: { type: "pointer", name: "events", pointerType: Pointers.ValueEventCollection, mandatory: true },
			10: { type: "int32", name: "position" },
			11: { type: "int32", name: "duration" },
			12: { type: "int32", name: "loop-offset" },
			13: { type: "int32", name: "loop-duration" },
			14: { type: "boolean", name: "mute" },
			15: { type: "string", name: "label" },
			16: { type: "int32", name: "hue" }
		}
	}, pointerRules: { accepts: [Pointers.Selection, Pointers.Editing], mandatory: false }
}

export const ValueClipBox: BoxSchema<Pointers> = {
	type: "box",
	class: {
		name: "ValueClipBox",
		fields: {
			1: { type: "pointer", name: "clips", pointerType: Pointers.ClipCollection, mandatory: true },
			2: { type: "pointer", name: "events", pointerType: Pointers.ValueEventCollection, mandatory: true },
			3: { type: "int32", name: "index" },
			4: { type: "object", name: "playback", class: ClipPlaybackFields },
			10: { type: "int32", name: "duration" },
			11: { type: "boolean", name: "mute" },
			12: { type: "string", name: "label" },
			13: { type: "int32", name: "hue" }
		}
	}, pointerRules: { accepts: [Pointers.Selection, Pointers.Editing], mandatory: false }
}