# Snapfu

**snap · fu** - _"the way of snap"_

<a href="https://www.npmjs.com/package/snapfu"><img alt="NPM Status" src="https://img.shields.io/npm/v/snapfu.svg?style=flat"></a>

Snapfu is the scaffolding command line tool for the Athos Commerce Snap SDK. This tool creates a new Athos Commerce project from one of our existing Snap scaffolds and bootstraps a development environment. These scaffolds include a GitHub action that when triggered will build and deploy Snap bundles to our infrastructure (permissions required).

## Installation

```bash
npm install -g snapfu
```

## Usage

```bash
snapfu <command> <args> [--options]
```

## Commands

### `init` - Create a new snap project
Creates a new snap project (optional directory)

```bash
snapfu init <directory>
```


### `badges` - Badge template management
Manage badge templates for your project

```bash
snapfu badges <command> <args> [--options]
```

**Subcommands:**
- `init` - Initialize badge template in current project
- `list [local | remote]` - Display list of badge templates (local or remote)
- `archive <name>` - Remove remote badge template
  - `--secret-key <key>` - Secret key for authentication
- `sync [<name> | locations.json]` - Synchronize badge template and parameters with remote
  - `--secret-key <key>` - Secret key for authentication

### `recs` - Recommendation template management
Manage recommendation templates for your project

```bash
snapfu recs <command> <args> [--options]
```

**Subcommands:**
- `init` - Initialize recommendation template in current project
- `list [local | remote]` - Display list of recommendation templates (local or remote)
- `archive <name> <branch>` - Remove remote recommendation template (optional branch)
  - `--secret-key <key>` - Secret key for authentication
- `sync <name> <branch>` - Synchronize recommendation template and parameters with remote (optional branch)
  - `--secret-key <key>` - Secret key for authentication

### `secrets` - Project secret management
Manage secrets in your snap project

```bash
snapfu secrets <command> <args> [--options]
```

**Subcommands:**
- `add` - Adds secrets to snap project
- `update` - Update secrets in snap project
- `verify` - Verify secrets in snap project

### `patch` - Apply patches to update project
Apply patches to update your project

```bash
snapfu patch <command> <args> [--options]
```

**Subcommands:**
- `apply` - Apply patch version (version or latest)
- `list` - List available versions for project
- `fetch` - Fetch latest versions of patches

### `login` - OAuth with GitHub
OAuths with GitHub to allow for creating repositories when using the init command

```bash
snapfu login
```

### `logout` - Remove login credentials
Removes login credentials

```bash
snapfu logout
```

### `org-access` - Review organization access
Review and change organization access for the tool

```bash
snapfu org-access
```

### `whoami` - Show current user
Shows the current user

```bash
snapfu whoami
```

### `about` - Show versioning
Shows versioning information

```bash
snapfu about
```

### `help` - Display help text
Display help text (optional command)

```bash
snapfu help [<command>]
```

## Getting Started

1. **Install snapfu globally:**
   ```bash
   npm install -g snapfu
   ```

2. **Login (optional):**
   ```bash
   snapfu login
   ```

3. **Create a new project:**
   ```bash
   snapfu init my-awesome-website
   ```

4. **Run the project:**
   ```bash
   cd my-awesome-website
   npm install
   npm run dev
   ```

## Deployment

This tool integrates with the Athos Commerce build and deploy process. In order to take advantage of this you must have access to the `snap-implementations` GitHub organization and select it during init command. (Requires login & invitation to the organization upon request).

The tool uses GitHub actions to copy files to our AWS S3 backed CDN (Cloudfront).

When you commit to the main branch (production), the github action will deploy all the files that build into `./dist` to a publicly readable S3 bucket which can be accessed at the following URLs:

```
https://snapui.athoscommerce.io/<siteId>/bundle.js
https://snapui.athoscommerce.io/<siteId>/production/bundle.js
```

Similarly, if you push a branch to github called `my-branch` that will be available at

```
https://snapui.athoscommerce.io/<siteId>/my-branch/bundle.js
```

## Deploying to other places

You can modify the file `deploy.yml` in your generated project under `my-awesome-website/.github/workflows/deploy.yml` to complete different actions if you don't want to use the Athos Commerce build process or don't have access to it.

### SCP
Deploy the built artifacts using `scp`. [https://github.com/marketplace/actions/scp-command-to-transfer-files](https://github.com/marketplace/actions/scp-command-to-transfer-files)

### Google Cloud
Deploy to GCP using `gcloud`. [https://github.com/marketplace/actions/setup-gcloud-environment](https://github.com/marketplace/actions/setup-gcloud-environment)

### SFTP
Deploy a built artifacts through SFTP. [https://github.com/marketplace/actions/sftp-deploy](https://github.com/marketplace/actions/sftp-deploy)

