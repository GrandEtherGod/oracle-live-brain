---
name: theia-dev
description: >
  Theia extension development workflows for AetherLinkOS. Use when working on
  Eclipse Theia extensions, plugins, or configurations inside this project.
  Examples: "add a new Theia extension", "register a Theia plugin", "build the Theia app".
---

# Theia Development Skill

Workflows for developing Eclipse Theia extensions, plugins, and configurations
within the AetherLinkOS / Theia Engine project.

---

## Project Structure

```
src/theia/
  extensions/     Custom Theia extensions (each is an npm package)
  plugins/        VS Code-compatible plugins loaded at runtime
  config/         Theia app configuration (ApplicationProps, package.json)
  frontend/       Frontend Theia application entry point
  backend/        Backend Theia application entry point
```

---

## Creating a New Theia Extension

### 1. Scaffold the extension directory

```bash
mkdir -p src/theia/extensions/<extension-name>/src
cd src/theia/extensions/<extension-name>
```

### 2. Create `package.json`

```json
{
  "name": "@aetherlink/<extension-name>",
  "version": "0.1.0",
  "description": "...",
  "keywords": ["theia-extension"],
  "dependencies": {
    "@theia/core": "latest"
  },
  "theiaExtensions": [
    {
      "frontend": "lib/browser/<extension-name>-frontend-module",
      "backend": "lib/node/<extension-name>-backend-module"
    }
  ]
}
```

### 3. Create the frontend module

```typescript
// src/browser/<extension-name>-frontend-module.ts
import { ContainerModule } from '@theia/core/shared/inversify';

export default new ContainerModule(bind => {
  // bind your contributions here
});
```

### 4. Register in the root `package.json`

Add the extension as a workspace dependency and reference it in the Theia `applications` config.

---

## Building

```bash
npm run build        # Full build
npm run dev          # Watch mode
```

## Running Locally

```bash
npm run start        # Starts the full Theia application on http://localhost:3000
```

---

## Key Theia Concepts

| Concept | Description |
|---------|-------------|
| `ContainerModule` | InversifyJS module; registers bindings for an extension |
| `CommandContribution` | Registers new IDE commands |
| `MenuContribution` | Adds items to menus |
| `WidgetFactory` | Creates custom panels/views |
| `FrontendApplicationContribution` | Lifecycle hooks for the frontend app |
| `BackendApplicationContribution` | Lifecycle hooks for the backend app |

---

## References

- [Theia extension development guide](https://theia-ide.org/docs/authoring_extensions/)
- [Theia plugin API](https://theia-ide.org/docs/authoring_plugins/)
- [InversifyJS documentation](https://inversify.io/)
