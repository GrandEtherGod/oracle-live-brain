"""TheiaAgent — interacts with the Eclipse Theia IDE backend.

Connects to the AetherLinkOS backend (default: ``http://localhost:3000``)
and issues commands via the REST API surface defined in ``src/api/``.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from ..agent import OpenClawAgent
from ..tools import Tool

DEFAULT_BACKEND = "http://localhost:3000"


class TheiaAgent(OpenClawAgent):
    """Agent that can interact with a running Theia IDE instance.

    Tools registered:

    * ``theia_open_file`` — open a file in the editor
    * ``theia_run_task`` — run a named workspace task (build / test / lint)
    * ``theia_get_workspace_info`` — retrieve workspace metadata
    """

    system_prompt = (
        "You are AetherLink Theia, an AI agent embedded in the Eclipse Theia IDE. "
        "You help users manage their workspace, open files, run builds, and navigate the IDE. "
        "Use the available tools to fulfil every request."
    )

    def __init__(self, *, backend_url: str = DEFAULT_BACKEND, **kwargs: Any) -> None:
        self.backend_url = backend_url.rstrip("/")
        super().__init__(**kwargs)

    # ------------------------------------------------------------------
    # Tool registration
    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        self.tools.register(
            Tool(
                name="theia_open_file",
                description="Open a file in the Theia editor.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Absolute or workspace-relative file path to open",
                        }
                    },
                    "required": ["path"],
                },
                handler=self._open_file,
            )
        )
        self.tools.register(
            Tool(
                name="theia_run_task",
                description=(
                    "Run a named task defined in the Theia workspace "
                    "(e.g. 'build', 'test', 'lint')."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "task": {
                            "type": "string",
                            "description": "Task name to run",
                        }
                    },
                    "required": ["task"],
                },
                handler=self._run_task,
            )
        )
        self.tools.register(
            Tool(
                name="theia_get_workspace_info",
                description="Get information about the current Theia workspace.",
                input_schema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._get_workspace_info,
            )
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _api_post(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.backend_url}{path}"
        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())  # type: ignore[no-any-return]
        except urllib.error.URLError as exc:
            return {"error": str(exc)}

    def _api_get(self, path: str) -> dict[str, Any]:
        url = f"{self.backend_url}{path}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                return json.loads(resp.read())  # type: ignore[no-any-return]
        except urllib.error.URLError as exc:
            return {"error": str(exc)}

    # ------------------------------------------------------------------
    # Tool handlers
    # ------------------------------------------------------------------

    def _open_file(self, path: str) -> str:
        result = self._api_post("/api/theia/open", {"path": path})
        if "error" in result:
            return f"Failed to open file: {result['error']}"
        return f"Opened {path}"

    def _run_task(self, task: str) -> str:
        result = self._api_post("/api/theia/task", {"task": task})
        if "error" in result:
            return f"Failed to run task '{task}': {result['error']}"
        return result.get("output", f"Task '{task}' started")  # type: ignore[return-value]

    def _get_workspace_info(self) -> str:
        result = self._api_get("/api/theia/workspace")
        if "error" in result:
            return f"Failed to get workspace info: {result['error']}"
        return json.dumps(result, indent=2)
