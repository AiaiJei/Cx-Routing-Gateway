"""Line-framed JSON-RPC MCP transport; stdout is protocol only."""
import json
import sys

from .errors import RepoMapError
from .schema import TOOL_SCHEMAS, TOOL_DESCRIPTIONS
from .service import RepoMapService, SERVICE_NAME, SERVICE_VERSION

MAX_FRAME_BYTES = 1_048_576


def _frame(request_id, *, result=None, error=None):
    value = {"jsonrpc": "2.0", "id": request_id}
    if error is not None:
        value["error"] = error
    else:
        value["result"] = result
    sys.stdout.buffer.write((json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()


def _tool_result(payload, is_error=False):
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # Desktop validates structuredContent against some plugin input schemas;
    # content-only results avoid misclassifying the response as call arguments.
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


def run(service=None, tool_schemas=None):
    service = service or RepoMapService()
    tool_schemas = tool_schemas or TOOL_SCHEMAS
    for raw in sys.stdin.buffer:
        request_id = None
        if len(raw) > MAX_FRAME_BYTES:
            _frame(None, error={"code": -32700, "message": "request frame exceeds 1 MiB"})
            continue
        try:
            request = json.loads(raw.decode("utf-8", errors="strict"))
            if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
                raise ValueError("JSON-RPC 2.0 object is required")
            request_id = request.get("id")
            method = request.get("method")
            if not isinstance(method, str):
                raise ValueError("method must be a string")
            params = request.get("params") or {}
            if method == "initialize":
                result = {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": SERVICE_NAME, "version": SERVICE_VERSION},
                }
                _frame(request_id, result=result)
            elif method == "notifications/initialized":
                continue
            elif method == "ping":
                _frame(request_id, result={})
            elif method == "tools/list":
                tools = [{"name": name, "description": TOOL_DESCRIPTIONS[name],
                          "inputSchema": schema} for name, schema in tool_schemas.items()]
                _frame(request_id, result={"tools": tools})
            elif method == "tools/call":
                if not isinstance(params, dict):
                    raise ValueError("tools/call params must be an object")
                name = params.get("name")
                arguments = params.get("arguments", {})
                if not isinstance(arguments, dict):
                    raise ValueError("tools/call arguments must be an object")
                try:
                    result = service.call(name, arguments)
                except RepoMapError as exc:
                    _frame(request_id, result=_tool_result(exc.as_dict(), is_error=True))
                else:
                    _frame(request_id, result=_tool_result(result))
            else:
                _frame(request_id, error={"code": -32601, "message": "method not found"})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            _frame(request_id, error={"code": -32700, "message": "invalid request",
                                      "data": {"reason": type(exc).__name__}})
        except Exception as exc:
            print(f"[awg-repo-map] {type(exc).__name__}: {exc}", file=sys.stderr)
            _frame(request_id, error={"code": -32603, "message": "internal server error"})
