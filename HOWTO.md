# How To

## Create A New Device

In the future, devices should primarily be built with openDAW's own modular system.
Stock devices should be loaded with a system that can selectively load devices at runtime.

The current way will be replaced.

* Create box schema(s) and add to boxes definitions
* Create DeviceBoxAdapter
* Add DeviceBoxAdapter to BoxAdapters
* Add code to Devices.adapterFor, Devices.fetchEffectIndex
* Add, create IconSymbol
* Add entry in Instruments or Effects (DeviceBox & named entry & Named)
* Create DeviceEditor
* Add DeviceEditor to DeviceEditorFactory
* Create DeviceProcessor
* Add DeviceProcessor to DeviceProcessorFactory