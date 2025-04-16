# Arbimon Uploader (previously RFCx Ingest App)

> Desktop application for ingesting audio to Arbimon

- 🖥 Built with [electron-vue](https://github.com/SimulatedGREG/electron-vue)
- 🗂 Managed states and reactive data with [vuex-orm](https://github.com/vuex-orm/vuex-orm)
- 🚦Created routes with [vue-router](https://github.com/vuejs/vue-router)
- 💅 Made over with [Bulma CSS](https://bulma.io/)
- 🔍 Analysed source code with [ESLint](https://eslint.org/)

## Getting started

### Requirements

- Node 14 (tested on 14.18.2)

Additional requirements for Windows
- Visual Studio **2017** along with Desktop development with C++

### Start development environment

1. Install dependencies

    ``` bash
    npm install
    ```

    Then, rebuild non-native modules for current OS platform with

    ``` bash
    npm run postinstall
    ```

2. Start the electron browser/app with hot reload (auto restarts app on file changes)

    ``` bash
    npm run dev
    ```
    If you need to set your own URL to API use (TODO: fix this as it might not work for now!)

    ``` bash
    npm run dev --url=`http://localhost:3030`
    ```

## Build

The project has a Github Action workflow, which will start building and releasing the app automatically on push to `master` branch. 🦾

Check the script in `.github/workflows/electron.yml` to see how it works.

### Manually build a notarized version of the app on Mac

1. Get a certificate (.pem) with the password (.p12) from DevOps or Team Lead. Check the certificate in the Keychain: Developer ID Application: Rainforest Connection with the private key. (see the example: https://help.apple.com/xcode/mac/current/#/dev97211aeac).
2. Also, Get an API Key (.p8) with API Key ID and API Key ISSUER ID from DevOps or Team Lead, or generate a new one at https://appstoreconnect.apple.com/access/api. The name of the p8 file should be `AuthKey_<api_key_id>.p8`
3. Put the API Key (.p8) into one of these directory in your local development machine.
* `./private_keys`
* `~/private_keys`
* `~/.private_keys`
* `~/.appstoreconnect/private_keys`
Based on the `API Key ID`, `notarytool` will look in the above places for the API Key file.
3. Add the following to the `.env` file:
APPLE_API_KEY_ID=**API Key ID**
APPLE_API_KEY_ISSUER_ID=**API Key Issuer ID**
5. In the `package.json` add the following under build option (electron-builder config)
```
    build: {
        ...
        "afterSign": "./after-sign-hook.js",
        ...
    }
```

4. Use ```npm run build``` command for building the app.
(The `after-sign-hook.js` will do its job, to notarize the app for you with the configuaration above)

### Manually build the app on Windows

1. Get a certificate with the password from DevOps or Team Lead.
Add the following to the `.env` file:
CSC_LINK=**your windows pfx file content (base64 encoded of the pfx file)**
CSC_KEY_PASSWORD=**your windows pfx file password**
2. Paste static files from the previous build into `./node-server/public`. After every build, we should put 4 files with the last version in the folder: `./node-server/public` and includes following files: RELEASES, .exe, *-delta.nupkg and -full.nupkg (If a new version of the app v1.1.1 you should put v1.1.0 to the folder).
3. Run ```npm run start``` in `./node-server` to start serving those static files from the previous build.
3. Change the remote releases url to be your local server in the `package.json` file:
``` bash
    “squirrelWindows”: {
        “remoteReleases”: “http://localhost:5000/public”
    }
```
4. Use ```npm run build``` command for building the app in another terminal.
5. After building we you see two folders for windows in the `./app/build` folder:
    - squirrel windows
    - squirrel-windows-ia32
These folders keep a new release for WinX64 and WinX86.
6. Upload assets for releases from `squirrel windows` folder to the GitHub: __RELEASES, .exe, *-delta.nupkg and -full.nupkg__.

## Linting

Lint all JS/Vue component files in `src/`
``` bash
npm run lint
```

## Generate test files
This script will convert the audio files recorded by the guardian into AudioMoth file type. It will add `deployment_id` along with other metadata into the header of the files.

1. Grab these original files:
- https://rfcx-web-static.s3.eu-west-1.amazonaws.com/tmp/rfcx-uploader-test-sets/pre_3ad55a16413f.tar.gz
- https://rfcx-web-static.s3.eu-west-1.amazonaws.com/tmp/rfcx-uploader-test-sets/pre_au3zcjx7nrrf.tar.gz
2. Run the script from `test/convert_guardian_to_audiomoth.sh` to generate test files
``` bash
chmod +x convert_guardian_to_audiomoth.sh 
./convert_guardian_to_audiomoth.sh [folder_name_of_original_files] [deployment_id]
```
---

## Project structure
In electron, there are 2 processes: main & renderer. Both processes are stored in `src` folder.

## Renderer process
With electron-vue, we are using vue components to make our large complex applications more organization. Each component has the ability to encapsulate its own CSS, template, and JavaScript functionality. Components are stored in `src/renderer/components`.

## Main process
`src/main/index.js` file is the app’s main file, the file in which electron boots with.

