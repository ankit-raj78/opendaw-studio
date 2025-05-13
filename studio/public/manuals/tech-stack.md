# Tech-Stack

## Toolchain

* [Vite](https://vite.dev)
* [Typescript](https://www.typescriptlang.org)
* [Sass](https://sass-lang.com)

## Libraries

openDAW uses minimal external dependencies, avoiding hidden behaviors from bulky UI frameworks.

Each in-house library has a clear, focused purpose. They are currently prefixed **jet** for no apparent reason.

### Dependency Table

| Library           | Dependencies                  |
|-------------------|-------------------------------|
| **fat-std**       | none                          |
| **jet-dsp**       | fat-std                       |
| **jet-dom**       | fat-std                       |
| **jet-tsx**       | fat-std, jet-dom              |
| **jet-runtime**   | fat-std                       |
| **jet-box**       | fat-std, jet-dom, jet-runtime |
| **jet-box-forge** | fat-std, jet-dom, jet-box     |

### In-House Runtime

* fat-std (Core)
* jet-dsp (DSP & Sequencing)
* jet-dom (DOM Integration)
* jet-tsx ([TSX](https://en.wikipedia.org/wiki/JSX_(JavaScript)) Integration)
* jet-runtime (Runtime and Scheduling)

### In-House Data Management

* jet-box (Runtime Immutable Data Graph)
* jet-box-forge (Jet-box Code Generator)

### External

* [jszip](https://www.npmjs.com/package/jszip) (Pack & Unpack Zip-Files)
* [markdown-it](https://www.npmjs.com/package/markdown-it) (Markdown parser)
* [rollbar](https://rollbar.com) (Runtime Error Logging)