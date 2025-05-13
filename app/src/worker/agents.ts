import { Messenger } from "runtime"
import { PeakWorker } from "@/peaks/PeakWorker"
import { OpfsWorker } from "@/opfs/OpfsWorker"

const messenger: Messenger = Messenger.for(self)

OpfsWorker.init(messenger)
PeakWorker.install(messenger)