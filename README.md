# openDAW Studio

**openDAW** is a next-generation web-based Digital Audio Workstation (DAW) designed to democratize music production. Our
mission is to make high-quality music creation accessible to everyone, regardless of their background or resources.

For more information about our mission and goals, please join our [Discord](https://discord.gg/B3C664wn), visit
our [official website](https://opendaw.org) and test our current [prototype](https://opendaw.studio/). Please consider
supporting this project on [Patreon](https://www.patreon.com/join/openDAW) or [ko-fi](https://ko-fi.com/opendaw).

## Goals

- **Web-Based Platform**: Create and edit music directly from your browser.
- **User-Friendly Interface**: Intuitive design for both beginners and professionals.
- **Collaborative Tools**: Work seamlessly with others in real-time, building a community of shared creativity.
- **Modular Systems**: Create your own devices and tools to extend the built-in feature-set.
- **Educational Resources**: Access tutorials and guides to enhance your music production skills.

## Getting up and running

Developed and tested on a Macbook Air and [Jetbrain Webstorm](https://www.jetbrains.com/webstorm/). Please file
an [issue](https://github.com/andremichelle/opendaw-studio/issues) if you encounter any problem installing and launching
openDAW.

## Tech Stack

A document is part of the manuals. [Click here](studio/public/manuals/tech-stack.md). The library has its
own [README](https://github.com/andremichelle/opendaw-lib).

### Prerequisites

Before starting, ensure you have the following installed on your system:

1. **Git** is required for cloning the repository and managing submodules. Download and install it
   from [git-scm.com](https://git-scm.com/).
2. Ensure you have Node.js version **>= 23**. This is necessary for running the development server and installing
   dependencies. Download Node.js from [nodejs.org](https://nodejs.org/).
3. **Sass** While Sass is handled internally during the development process, you will need to ensure you have the
   binaries available in your environment if used outside the build system. Install it globally if necessary:

``` bash
   npm install -g sass
   ```

1. **OpenSSL** For generating local development certificates (), OpenSSL needs to be installed on your system. Most
   Linux/macOS systems have OpenSSL pre-installed. If you're on Windows, use a package manager
   like [Chocolatey](https://chocolatey.org/) to install OpenSSL.
2. **Additional Dependencies per Development Tools**:
    - TypeScript (`tsc`): You may need to globally install it for global use: `package.json`

``` bash
     npm install -g typescript
```

### Clone (once)

`git clone --recurse-submodules https://github.com/andremichelle/opendaw-studio.git && cd opendaw-studio`

### Generate local certificates (once)

`./cert.sh`

### Rebuild the project

`./rebuild.sh`

### Start the development server

`./run-web.sh` – open the printed URL `https://localhost:8080`

## Code Philosophy

### Introduction

openDAW is deliberately **environment-agnostic**.

The codebase must run either as a self-contained desktop application or from any standard web server; cloud features are
optional and only activate when the user supplies their own credentials.

All project data should be storable either on the local file system or in whatever cloud service the user chooses; no
single storage backend is assumed. Because nothing about the surrounding platform can be taken for granted, every
component is built to be maximally independent, lazy-loaded only when first needed, and capable of launching in seconds
on even modest hardware.

### Things to know before diving in

* Methods that contain only trivial getters or setters are kept on a single line to minimize scrolling through
  low-signal code.
* Crucial functionality is implemented at a lower level with well-tested classes, while the UI layer is primarily
  scripted.
* Excessive abstraction can harm both readability and scalability, so layers are added only when they clearly pay for
  themselves.
* Rule of thumb: when a method requires more than three parameters, bundle them into a dedicated argument object.
* Always write self-documenting code if possible.

### What we are looking for

1. **Offline desktop build (e.g., via Tauri) or a standalone installable PWA** — offer offline capability either through
   a packaged desktop version, a Progressive Web App, or both.
2. **Cloud-agnostic project storage** — a facade layer that lets users plug in different cloud services (e.g., Drive,
   S3, Dropbox) for projects and sample libraries.
3. **Live remote collaboration** — real-time session sharing and sync so multiple users can edit the same project
   concurrently.
4. **AI manual assistant** — an embedded agent that answers context-aware questions and guides users through features as
   they work.
5. **AI-powered stem splitting** — integrated source-separation to extract vocals, drums, and other stems directly
   inside the DAW.

### What openDAW is working on already

For current progress and technical notes, see the continuously
updated: [developer log](studio/public/manuals/dev-log.md).

## Links

* [openDAW on Discord](https://discord.gg/B3C664wn)
* [openDAW on Patreon](https://www.patreon.com/join/openDAW)
* [openDAW on ko-fi](https://ko-fi.com/opendaw)
* [opendaw.org (website)](https://opendaw.org)
* [opendaw.studio (prototype)](https://opendaw.studio)

## License

[GPL v3](https://www.gnu.org/licenses/gpl-3.0.txt) © 2025 André Michelle

## Dual-Licensing Model

openDAW is available **under two alternative license terms**:

| Option                    | When to choose it                                                                                              | Obligations                                                                                                                                                                      |
|---------------------------|----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A. GPL v3 (or later)**  | You are happy for the entire work that includes openDAW to be released under GPL-compatible open-source terms. | – Must distribute complete corresponding source code under GPL.<br>– Must keep copyright & licence notices.<br>– May run openDAW privately in any software, open or closed (§0). |
| **B. Commercial Licence** | You wish to incorporate openDAW into **closed-source** or otherwise licence-incompatible software.             | – Pay the agreed fee.<br>– No copyleft requirement for your own source code.<br>– Other terms as per the signed agreement.                                                       |

> **How to obtain the Commercial License**  
> Email `andre.michelle@opendaw.org` with your company name, product description, and expected distribution volume.

If you redistribute openDAW or a derivative work **without** a commercial license, the GPL v3 terms apply automatically.