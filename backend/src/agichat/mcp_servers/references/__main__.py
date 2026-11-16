from agichat.config import Settings
from agichat.mcp_servers.references.server import build_server


def main() -> None:
    settings = Settings()
    build_server().run(
        "streamable-http",
        host=settings.mcp_host,
        port=settings.references_mcp_port,
        stateless_http=True,
        json_response=True,
    )


if __name__ == "__main__":
    main()
