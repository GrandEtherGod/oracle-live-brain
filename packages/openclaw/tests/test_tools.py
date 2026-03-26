"""Unit tests for openclaw.tools."""

from openclaw.tools import Tool, ToolRegistry, tool


class TestTool:
    def test_to_claude_tool(self) -> None:
        t = Tool(
            name="greet",
            description="Say hello.",
            input_schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
            handler=lambda name: f"Hello, {name}!",
        )
        definition = t.to_claude_tool()
        assert definition["name"] == "greet"
        assert definition["description"] == "Say hello."
        assert "input_schema" in definition

    def test_handler_called(self) -> None:
        t = Tool("add", "Add two numbers.", {}, handler=lambda a, b: a + b)
        assert t.handler(1, 2) == 3


class TestToolRegistry:
    def test_register_and_execute(self) -> None:
        registry = ToolRegistry()
        registry.register(
            Tool("echo", "Echo.", {}, handler=lambda text: text)
        )
        assert registry.execute("echo", {"text": "hi"}) == "hi"

    def test_unknown_tool_returns_error_string(self) -> None:
        registry = ToolRegistry()
        result = registry.execute("nonexistent", {})
        assert isinstance(result, str)
        assert "Unknown tool" in result

    def test_definitions_returns_list(self) -> None:
        registry = ToolRegistry()
        registry.register(Tool("foo", "Foo.", {"type": "object", "properties": {}}, handler=lambda: None))
        defs = registry.definitions()
        assert len(defs) == 1
        assert defs[0]["name"] == "foo"

    def test_multiple_tools(self) -> None:
        registry = ToolRegistry()
        registry.register(Tool("a", "A.", {}, handler=lambda: "a"))
        registry.register(Tool("b", "B.", {}, handler=lambda: "b"))
        assert len(registry.definitions()) == 2
        assert registry.execute("a", {}) == "a"
        assert registry.execute("b", {}) == "b"


class TestToolDecorator:
    def test_decorator_creates_tool(self) -> None:
        @tool(
            name="double",
            description="Double a number.",
            input_schema={"type": "object", "properties": {"n": {"type": "integer"}}, "required": ["n"]},
        )
        def double(n: int) -> int:
            return n * 2

        assert isinstance(double, Tool)
        assert double.name == "double"
        assert double.handler(n=5) == 10
