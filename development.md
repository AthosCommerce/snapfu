# Snapfu

The scaffolding CLI for the Snap SDK.

## Development Prerequisites

- node
- install the project in your workspace directory
  - `git clone git@github.com:AthosCommerce/snapfu.git`
  - `cd snapfu && npm i`

## Development

Run the snapfu client

```bash
cd snapfu
npm run snapfu login --dev
npm run snapfu init --dev
```

In most cases development will need a Snap project to work with. For this type of local development you will need to either execute the command with a relative path or add the Snapfu command (found in ./bin/snapfu.js) to your path.

## Deploy to npm

Pushes to the `main` branch will trigger the versioning and publishing process.

## Misc

Format the code

`npm run format`
