import {Box, Vertex} from "box"
import {Predicate} from "std"
import {SelectableVertex} from "@/ui/selection/SelectableVertex"

export const isVertexOfBox = (predicate: Predicate<Box>): Predicate<SelectableVertex> => (vertex: Vertex) => predicate(vertex.box)